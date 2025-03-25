const Link = require("../models/Link")
const { createAuditLog } = require("./auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")
const { getAsync, setAsync, delAsync } = require("../config/redis")
// 导入内存缓存
const { shortLinkCache } = require("../utils/memoryCache")
// 导入缓存策略
const {
  incrementAccessCount,
  calculateCacheTime,
} = require("../utils/cacheStrategy")

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
  const startTime = Date.now()

  try {
    // 检查是否是压力测试请求
    const isLoadTest = req.get("X-Load-Test") === "true"

    // 1. 首先尝试从内存缓存中查询（最快）
    const cachedInMemory = shortLinkCache.get(shortKey)
    if (cachedInMemory) {
      // 异步更新访问计数，不阻塞响应
      process.nextTick(() => {
        incrementAccessCount(shortKey)
      })

      // 记录缓存命中指标
      const duration = Date.now() - startTime
      console.log(`内存缓存命中: ${shortKey}, 耗时: ${duration}ms`)

      return res.redirect(cachedInMemory)
    }

    // 2. 内存缓存未命中，尝试从Redis缓存中查询
    let cachedInRedis = null
    try {
      cachedInRedis = await getAsync(`shortlink:${shortKey}`)
    } catch (error) {
      console.error("Redis查询失败，降级到数据库查询:", error)
    }

    if (cachedInRedis) {
      // 将结果添加到内存缓存
      shortLinkCache.set(shortKey, cachedInRedis)

      // 异步更新访问计数
      process.nextTick(() => {
        incrementAccessCount(shortKey)
      })

      // 记录缓存命中指标
      const duration = Date.now() - startTime
      console.log(`Redis缓存命中: ${shortKey}, 耗时: ${duration}ms`)

      return res.redirect(cachedInRedis)
    }

    // 3. 缓存全部未命中，查询数据库
    const link = await Link.findOne({ shortKey })

    if (!link) {
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    // 4. 更新访问计数
    incrementAccessCount(shortKey)

    // 5. 计算动态缓存时间
    const cacheTime = calculateCacheTime(shortKey, link)

    // 6. 将结果添加到多级缓存
    // 添加到内存缓存
    shortLinkCache.set(shortKey, link.longUrl)

    // 添加到Redis缓存，使用动态过期时间
    try {
      await setAsync(`shortlink:${shortKey}`, link.longUrl, "EX", cacheTime)
    } catch (error) {
      console.error("Redis缓存写入失败:", error)
    }

    // 7. 如果不是压力测试，则记录审计日志
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
              responseTime: Date.now() - startTime,
            },
            req,
            status: "SUCCESS",
          })
        } catch (error) {
          console.error("记录审计日志失败:", error)
        }
      })
    }

    // 记录数据库查询指标
    const duration = Date.now() - startTime
    console.log(
      `数据库查询: ${shortKey}, 耗时: ${duration}ms, 缓存时间: ${cacheTime}秒`
    )

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

// 当删除或更新短链接时，同时清除缓存
const clearLinkCache = async (shortKey) => {
  try {
    // 清除内存缓存
    shortLinkCache.delete(shortKey)

    // 清除Redis缓存
    await delAsync(`shortlink:${shortKey}`)

    console.log(`已清除短链接缓存: ${shortKey}`)
  } catch (error) {
    console.error(`清除缓存失败: ${shortKey}`, error)
  }
}

// 修改删除短链接函数，清除缓存
const deleteLink = async (req, res) => {
  try {
    const link = await Link.findById(req.params.id)

    if (!link) {
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    // 检查权限
    if (
      link.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).send({
        success: false,
        message: "没有权限删除此短链接",
      })
    }

    // 清除缓存
    await clearLinkCache(link.shortKey)

    await link.remove()

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

    res.json({ success: true, message: "短链接已删除" })
  } catch (err) {
    console.error(err)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

// 修改更新短链接函数，清除缓存
const updateLink = async (req, res) => {
  try {
    const { longUrl } = req.body
    const link = await Link.findById(req.params.id)

    if (!link) {
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    // 检查权限
    if (
      link.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).send({
        success: false,
        message: "没有权限更新此短链接",
      })
    }

    // 清除缓存
    await clearLinkCache(link.shortKey)

    // 更新链接
    link.longUrl = longUrl || link.longUrl
    await link.save()

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

    res.json(link)
  } catch (err) {
    console.error(err)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

module.exports = {
  createShortLink,
  getLinks,
  redirectToLongLink,
  deleteLink,
  updateLink,
}
