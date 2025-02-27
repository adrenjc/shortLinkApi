const Link = require("../models/Link")
const config = require("../config/config")

// const createShortLink = async (req, res) => {
//   const { longUrl } = req.body

//   console.log("Received longUrl:", longUrl)

//   if (!longUrl) {
//     return res.status(400).send("长链接不能为空")
//   }

//   try {
//     const { Octokit } = await import("@octokit/rest")
//     const octokit = new Octokit({
//       auth: "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",
//     })
//     const response = await octokit.issues.create({
//       owner: "adrenjc",
//       repo: "su",
//       title: longUrl,
//       body: "",
//     })

//     const issueUrl = response.data.html_url
//     const shortUrl = issueUrl.replace(
//       "github.com/adrenjc/su/issues",
//       "adrenjc.github.io/su"
//     )

//     const newLink = new Link({
//       longUrl,
//       shortKey: shortUrl,
//       createdBy: req.user.id,
//     })

//     await newLink.save()
//     res.json(newLink)
//   } catch (error) {
//     console.error("创建短链接错误:", error)
//     res.status(500).send("服务器错误")
//   }
// }
const generateShortKey = (longUrl) => {
  // 使用时间戳和长链接生成短链接
  const timestamp = Date.now()
  return Buffer.from(`${longUrl}-${timestamp}`).toString("base64").slice(-6)
}

const createShortLink = async (req, res) => {
  const { longUrl, customDomain } = req.body // 直接从 req.body 解构

  console.log("Received request body:", req.body) // 添加日志

  if (!longUrl) {
    return res.status(400).send({ success: false, message: "长链接不能为空" })
  }

  try {
    const shortKey = generateShortKey(longUrl)

    // 验证自定义域名格式（如果有）
    if (customDomain) {
      const domainRegex =
        /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
      if (!domainRegex.test(customDomain)) {
        return res.status(400).json({
          success: false,
          message: "无效的域名格式",
        })
      }
    }

    // 使用自定义域名或默认域名
    const domain = customDomain || config.domain
    const baseUrl = customDomain ? `https://${customDomain}` : config.baseUrl

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
  const host = req.get("host") // 获取请求的域名

  try {
    // 根据短链接和域名查找
    const link = await Link.findOne({
      shortKey,
      $or: [
        { customDomain: host },
        { customDomain: null }, // 如果是默认域名
      ],
    })

    if (!link) {
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    res.redirect(link.longUrl)
  } catch (err) {
    console.error("重定向错误:", err)
    res.redirect("/404")
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
