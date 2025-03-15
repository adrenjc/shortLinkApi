const Link = require("../models/Link")
const { createAuditLog } = require("./auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")
const { getAsync, setAsync, delAsync } = require("../config/redis")

const generateShortKey = (longUrl) => {
  // 使用时间戳和长链接生成短链接
  const timestamp = Date.now()
  return Buffer.from(`${longUrl}-${timestamp}`).toString("base64").slice(-6)
}

const createShortLink = async (req, res) => {
  const { longUrl, customDomain, customShortKey } = req.body
  const isDev = process.env.NODE_ENV === "development"

  console.log("Received request body:", req.body)

  if (!longUrl) {
    return res.status(400).send({ success: false, message: "长链接不能为空" })
  }

  // 验证自定义短链key的格式
  if (
    customShortKey &&
    (customShortKey.length < 4 || customShortKey.length > 6)
  ) {
    return res
      .status(400)
      .send({ success: false, message: "自定义短链key长度必须在4-6位之间" })
  }

  try {
    const shortKey = customShortKey || generateShortKey(longUrl)

    // 检查shortKey是否已存在
    const existingLink = await Link.findOne({ shortKey })
    if (existingLink) {
      return res.status(400).json({
        success: false,
        message: "该短链key已存在，请更换一个",
      })
    }

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
        domain: customDomain || currentDomain,
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
      domain: customDomain || currentDomain,
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

    res.json({ success: false, message: "链接已删除" })
  } catch (err) {
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

// 更新短链接
const updateLink = async (req, res) => {
  const { id } = req.params
  const { longUrl, customShortKey } = req.body

  try {
    // 验证自定义短链key的格式
    if (
      customShortKey &&
      (customShortKey.length < 4 || customShortKey.length > 6)
    ) {
      return res
        .status(400)
        .send({ success: false, message: "自定义短链key长度必须在4-6位之间" })
    }

    // 先获取原始链接信息
    const oldLink = await Link.findOne({
      _id: id,
      createdBy: req.user.id,
    })

    if (!oldLink) {
      return res.status(404).json({ success: false, message: "链接未找到" })
    }

    // 如果customShortKey是空字符串，生成新的随机key
    const newShortKey = !customShortKey
      ? generateShortKey(longUrl)
      : customShortKey

    // 如果要更新shortKey，检查是否已存在
    if (newShortKey && newShortKey !== oldLink.shortKey) {
      const existingLink = await Link.findOne({ shortKey: newShortKey })
      if (existingLink) {
        return res.status(400).json({
          success: false,
          message: "该短链key已存在，请更换一个",
        })
      }
    }

    // 构建更新对象
    const updateData = { longUrl }
    if (
      customShortKey === "" ||
      (newShortKey && newShortKey !== oldLink.shortKey)
    ) {
      updateData.shortKey = newShortKey
      // 更新shortUrl
      const baseUrl = oldLink.shortUrl.split("/r/")[0]
      updateData.shortUrl = `${baseUrl}/r/${newShortKey}`
    }

    // 更新链接
    const link = await Link.findOneAndUpdate(
      {
        _id: id,
        createdBy: req.user.id,
      },
      updateData,
      { new: true }
    )

    // 添加审计日志，记录变更前后的链接
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.UPDATE_LINK,
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: link._id,
      description: `更新短链接: ${link.shortUrl}，从 ${oldLink.longUrl} 改为 ${
        link.longUrl
      }${
        newShortKey !== oldLink.shortKey
          ? `，短链key从 ${oldLink.shortKey} 改为 ${newShortKey}`
          : ""
      }`,
      metadata: {
        oldLongUrl: oldLink.longUrl,
        newLongUrl: link.longUrl,
        oldShortKey: oldLink.shortKey,
        newShortKey: link.shortKey,
      },
      req,
    })

    // 清除 Redis 缓存
    try {
      await delAsync(`shortlink:${oldLink.shortKey}`)
      if (newShortKey !== oldLink.shortKey) {
        await delAsync(`shortlink:${newShortKey}`)
      }
    } catch (error) {
      console.error("Redis缓存清除失败:", error)
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
