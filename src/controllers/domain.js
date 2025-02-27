const Domain = require("../models/Domain")
const crypto = require("crypto")
const dns = require("dns").promises

// 添加新域名
const addDomain = async (req, res) => {
  const { domain } = req.body

  try {
    const verificationCode = crypto.randomBytes(16).toString("hex")

    const newDomain = new Domain({
      domain,
      userId: req.user.id,
      verificationCode,
    })

    await newDomain.save()

    res.json({
      success: true,
      data: {
        domain,
        verificationCode,
        // 返回验证说明
        verificationInstructions: `请添加以下 TXT 记录到您的域名解析：
          记录类型: TXT
          主机记录: @
          记录值: ${verificationCode}`,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "添加域名失败",
    })
  }
}

// 验证域名所有权
const verifyDomain = async (req, res) => {
  const { domain } = req.params

  try {
    const domainRecord = await Domain.findOne({
      domain,
      userId: req.user.id,
    })

    if (!domainRecord) {
      return res.status(404).json({
        success: false,
        message: "域名未找到",
      })
    }

    try {
      // 查询域名的 TXT 记录
      const records = await dns.resolveTxt(domain)
      const verified = records.some((record) =>
        record.some((string) => string === domainRecord.verificationCode)
      )

      if (verified) {
        domainRecord.verified = true
        await domainRecord.save()

        res.json({
          success: true,
          message: "域名验证成功",
        })
      } else {
        res.status(400).json({
          success: false,
          message: "域名验证失败，请检查 DNS 记录",
        })
      }
    } catch (dnsError) {
      res.status(400).json({
        success: false,
        message: "DNS 记录查询失败，请确保记录已正确添加",
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "验证过程出错",
    })
  }
}

// 获取域名列表
const getDomains = async (req, res) => {
  try {
    const domains = await Domain.find({ userId: req.user.id })
    console.log("Found domains:", domains) // 添加日志
    res.json({
      success: true,
      data: domains,
    })
  } catch (error) {
    console.error("获取域名列表失败:", error)
    res.status(500).json({
      success: false,
      message: "获取域名列表失败",
    })
  }
}

// 删除域名
const deleteDomain = async (req, res) => {
  const { domain } = req.params

  try {
    const result = await Domain.findOneAndDelete({
      domain,
      userId: req.user.id,
    })

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "域名未找到",
      })
    }

    res.json({
      success: true,
      message: "域名删除成功",
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "删除域名失败",
    })
  }
}

// 导出所有函数
module.exports = {
  addDomain,
  verifyDomain,
  getDomains,
  deleteDomain,
}
