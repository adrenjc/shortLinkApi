const Link = require("../models/Link")
const config = require("../config/config")
const { createAuditLog } = require("./auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")

const generateShortKey = (longUrl) => {
  // 使用时间戳和长链接生成短链接
  const timestamp = Date.now()
  return Buffer.from(`${longUrl}-${timestamp}`).toString("base64").slice(-6)
}

const createShortLink = async (req, res) => {
  const { longUrl, customDomain } = req.body
  const env = process.env.NODE_ENV || "development"
  const isDev = config.getConfig(env).isDev

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
    const baseUrl = customDomain
      ? `https://${customDomain}`
      : `https://${currentDomain}`

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
    const link = await Link.findOne({ shortKey })

    if (!link) {
      console.log("Link not found for shortKey:", shortKey)
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    // 添加点击审计日志
    await createAuditLog({
      userId: link.createdBy,
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

    console.log("Redirecting to:", link.longUrl)
    res.redirect(link.longUrl)
  } catch (err) {
    console.error("重定向错误:", err)
    // 记录失败的审计日志
    if (err.link) {
      await createAuditLog({
        userId: err.link.createdBy,
        action: ACTION_TYPES.CLICK_LINK,
        resourceType: RESOURCE_TYPES.LINK,
        resourceId: err.link._id,
        description: `访问短链接失败: ${err.link.shortUrl}`,
        metadata: { error: err.message },
        req,
        status: "FAILURE",
        errorMessage: err.message,
      })
    }
    res.status(404).send({ success: false, message: "短链接未找到" })
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
