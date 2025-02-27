const Link = require("../models/Link")
const config = require("../config/config")

const generateShortKey = (longUrl) => {
  // 使用时间戳和长链接生成短链接
  const timestamp = Date.now()
  return Buffer.from(`${longUrl}-${timestamp}`).toString("base64").slice(-6)
}

const createShortLink = async (req, res) => {
  const { longUrl, customDomain } = req.body

  console.log("Received request body:", req.body) // 添加日志

  if (!longUrl) {
    return res.status(400).send({ success: false, message: "长链接不能为空" })
  }

  try {
    const shortKey = generateShortKey(longUrl)

    // 使用自定义域名或当前请求的域名
    const currentDomain = req.get("host")
    const baseUrl = customDomain
      ? `https://${customDomain}`
      : `https://${currentDomain}`

    const newLink = new Link({
      longUrl,
      shortKey,
      customDomain: customDomain || currentDomain, // 存储实际使用的域名
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
  try {
    const link = await Link.findOne({ shortKey })
    if (!link) {
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    // 使用当前访问的域名而不是存储的域名
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
