const Link = require("../models/Link")
const { createAuditLog } = require("./auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")
const { getAsync, setAsync, delAsync } = require("../config/redis")
const axios = require("axios")

const generateShortKey = (longUrl) => {
  // 使用时间戳和长链接生成短链接
  const timestamp = Date.now()
  return Buffer.from(`${longUrl}-${timestamp}`).toString("base64").slice(-6)
}

const createShortLink = async (req, res) => {
  const { longUrl, customDomain } = req.body
  const isDev = process.env.NODE_ENV === "development"

  console.log("Received request body:", req.body)

  if (!longUrl) {
    return res.status(400).send({ success: false, message: "长链接不能为空" })
  }

  try {
    const shortKey = generateShortKey(longUrl)

    // 获取当前域名，并去除 www 前缀
    const currentDomain = req.get("host").replace(/^www\./, "")

    // 开发环境下的处理
    if (isDev) {
      const baseUrl = `http://${currentDomain}/api`
      const newLink = new Link({
        longUrl,
        shortKey,
        customDomain: customDomain || null,
        shortUrl: `${baseUrl}/r/${shortKey}`,
        createdBy: req.user.id,
      })
      await newLink.save()

      // 添加审计日志
      await createAuditLog({
        userId: req.user.id,
        action: ACTION_TYPES.CREATE_LINK,
        resourceType: RESOURCE_TYPES.LINK,
        resourceId: newLink._id,
        description: `创建短链接: ${newLink.shortUrl}`,
        metadata: { longUrl: newLink.longUrl },
        req,
      })

      res.json(newLink)
      return
    }

    // 生产环境的处理
    let baseUrl

    // 检查是否是IP地址访问
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(currentDomain)

    if (customDomain) {
      // 如果有自定义域名，使用 https
      baseUrl = `https://${customDomain}`
    } else if (isIpAddress) {
      // 如果是IP地址访问，使用 http
      baseUrl = `http://${currentDomain}`
    } else {
      // 如果是域名访问，使用 https
      baseUrl = `https://${currentDomain}`
    }

    const newLink = new Link({
      longUrl,
      shortKey,
      customDomain: customDomain || null,
      shortUrl: `${baseUrl}/r/${shortKey}`,
      createdBy: req.user.id,
    })

    await newLink.save()

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.CREATE_LINK,
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: newLink._id,
      description: `创建短链接: ${newLink.shortUrl}`,
      metadata: { longUrl: newLink.longUrl },
      req,
    })

    res.json(newLink)
  } catch (error) {
    // 处理重复短链接的错误
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "该短链接已存在，请重试",
      })
    }
    console.error("创建短链接错误:", error)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

const redirectToLongLink = async (req, res) => {
  const { shortKey } = req.params

  try {
    // 检查是否是压力测试请求
    const isLoadTest = req.get("X-Load-Test") === "true"

    // 1. 尝试从 Redis 缓存中查询
    let cachedUrl = null
    try {
      cachedUrl = await getAsync(`shortlink:${shortKey}`)
    } catch (error) {
      console.error("Redis查询失败，降级到数据库查询:", error)
    }

    if (cachedUrl) {
      return res.redirect(cachedUrl)
    }

    // 3. 缓存未命中或Redis不可用，查询数据库
    const link = await Link.findOne({ shortKey })

    if (!link) {
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    // 4. 尝试写入Redis缓存
    try {
      await setAsync(`shortlink:${shortKey}`, link.longUrl, "EX", 3600)
    } catch (error) {
      console.error("Redis缓存写入失败:", error)
    }

    // 5. 如果不是压力测试，则记录审计日志
    if (!isLoadTest) {
      process.nextTick(async () => {
        try {
          await createAuditLog({
            userId: link.createdBy || "system",
            action: ACTION_TYPES.CLICK_LINK,
            resourceType: RESOURCE_TYPES.LINK,
            resourceId: link._id,
            description: `访问短链接: ${link.shortUrl}`,
            metadata: {
              longUrl: link.longUrl,
              referer: req.get("referer") || "direct",
              userAgent: req.get("user-agent"),
              ipAddress: req.ip,
            },
            req,
            status: "SUCCESS",
          })
        } catch (error) {
          console.error("记录审计日志失败:", error)
        }
      })
    }

    return res.redirect(link.longUrl)
  } catch (err) {
    console.error("重定向错误:", err)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

// 查询用户所有短链接
const getLinks = async (req, res) => {
  try {
    // 获取 ProTable 传递的分页参数
    const { current = 1, pageSize = 10 } = req.query
    const page = parseInt(current, 10)
    const limit = parseInt(pageSize, 10)
    const skip = (page - 1) * limit

    // 查询用户的短链接，并应用分页
    const [links, total] = await Promise.all([
      Link.find({ createdBy: req.user.id })
        .sort({ createdAt: -1 }) // 按创建时间降序排序
        .skip(skip)
        .limit(limit),
      Link.countDocuments({ createdBy: req.user.id }),
    ])

    res.json({
      data: links,
      success: true,
      total,
    })
  } catch (err) {
    console.error("获取短链接错误:", err)
    res.status(500).send({
      success: false,
      message: "服务器错误",
    })
  }
}
// 删除短链接
const deleteLink = async (req, res) => {
  const { id } = req.params

  try {
    const link = await Link.findOneAndDelete({
      _id: id,
      createdBy: req.user.id,
    })

    if (!link) {
      return res.status(404).json({ success: false, message: "链接未找到" })
    }

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.DELETE_LINK,
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: link._id,
      description: `删除短链接: ${link.shortUrl}`,
      metadata: { longUrl: link.longUrl },
      req,
    })

    // 清除 Redis 缓存
    try {
      await delAsync(`shortlink:${link.shortKey}`)
    } catch (error) {
      console.error("Redis缓存清除失败:", error)
    }

    // 清除 Nginx 缓存
    try {
      const nginxPurgeUrl = `${process.env.NGINX_INTERNAL_URL}/purge/r/${link.shortKey}`

      await axios.get(nginxPurgeUrl, {
        timeout: 5000,
        headers: {
          Host: req.get("host"),
        },
        validateStatus: function (status) {
          return (status >= 200 && status < 300) || status === 404
        },
      })
    } catch (error) {
      console.error("Nginx缓存清除失败:", error.message)
    }

    res.json({ success: true, message: "链接已删除" }) // 修正 success 的值为 true
  } catch (err) {
    console.error("删除短链接错误:", err)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

// 更新短链接
const updateLink = async (req, res) => {
  const { id } = req.params
  const { longUrl } = req.body

  try {
    const link = await Link.findOneAndUpdate(
      {
        _id: id,
        createdBy: req.user.id,
      },
      { longUrl },
      { new: true }
    )

    if (!link) {
      return res.status(404).json({ success: false, message: "链接未找到" })
    }

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.UPDATE_LINK,
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: link._id,
      description: `更新短链接: ${link.shortUrl}`,
      metadata: { longUrl: link.longUrl },
      req,
    })

    // 清除 Redis 缓存
    try {
      await delAsync(`shortlink:${link.shortKey}`)
    } catch (error) {
      console.error("Redis缓存清除失败:", error)
    }

    // 清除 Nginx 缓存
    try {
      // 使用环境变量中配置的 Nginx 内部地址
      const nginxPurgeUrl = `${process.env.NGINX_INTERNAL_URL}/purge/r/${link.shortKey}`

      // 设置请求超时和重试
      await axios.get(nginxPurgeUrl, {
        timeout: 5000, // 5秒超时
        headers: {
          Host: req.get("host"), // 传递原始 host 头
        },
        validateStatus: function (status) {
          return (status >= 200 && status < 300) || status === 404 // 404 也算成功（缓存可能不存在）
        },
      })
    } catch (error) {
      console.error("Nginx缓存清除失败:", error.message)
      // 这里我们只记录错误，不影响正常流程
    }

    res.json({ success: true, data: link })
  } catch (err) {
    console.error("更新短链接错误:", err)
    res.status(500).json({ success: false, message: "服务器错误" })
  }
}

module.exports = {
  createShortLink,
  getLinks,
  redirectToLongLink,
  deleteLink,
  updateLink,
}
