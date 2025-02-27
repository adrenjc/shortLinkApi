const Link = require("../models/Link")
const config = require("../config/config")

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
  const host = req.get("host").replace(/^www\./, "") // 去除 www 前缀
  const env = process.env.NODE_ENV || "development"
  const isDev = config.getConfig(env).isDev

  console.log("Redirect request:", {
    shortKey,
    host,
    isDev,
  })

  try {
    let link

    if (isDev) {
      // 开发环境下不考虑自定义域名，直接查找短链接
      link = await Link.findOne({ shortKey })
    } else {
      // 生产环境下的域名匹配逻辑
      // 先尝试查找完全匹配的自定义域名
      link = await Link.findOne({
        shortKey,
        $or: [{ customDomain: host }, { customDomain: null }],
      })

      console.log("Found link:", link)
    }

    if (!link) {
      console.log("Link not found for:", {
        shortKey,
        host,
        isDev,
      })
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    console.log("Redirecting to:", link.longUrl)
    res.redirect(link.longUrl)
  } catch (err) {
    console.error("重定向错误:", err)
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

    res.json({ success: false, message: "链接已删除" })
  } catch (err) {
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

module.exports = {
  createShortLink,
  getLinks,
  redirectToLongLink,
  deleteLink,
}
