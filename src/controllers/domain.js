const Domain = require("../models/Domain")
const crypto = require("crypto")
const dns = require("dns").promises
const { createAuditLog } = require("./auditLog")

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

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: "CREATE_DOMAIN",
      resourceType: "DOMAIN",
      resourceId: newDomain._id,
      description: `添加域名: ${domain}`,
      metadata: { domain },
      req,
      status: "SUCCESS",
    })

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
  } catch (err) {
    // 记录失败的审计日志
    await createAuditLog({
      userId: req.user.id,
      action: "CREATE_DOMAIN",
      resourceType: "DOMAIN",
      description: `添加域名失败: ${domain}`,
      metadata: { domain, error: err.message },
      req,
      status: "FAILURE",
      errorMessage: err.message,
    })
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

        // 添加审计日志
        await createAuditLog({
          userId: req.user.id,
          action: "VERIFY_DOMAIN",
          resourceType: "DOMAIN",
          resourceId: domainRecord._id,
          description: `验证域名: ${domain}`,
          metadata: { domain },
          req,
          status: "SUCCESS",
        })

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
  } catch (err) {
    // 记录失败的审计日志
    await createAuditLog({
      userId: req.user.id,
      action: "VERIFY_DOMAIN",
      resourceType: "DOMAIN",
      description: `验证域名失败: ${domain}`,
      metadata: { domain, error: err.message },
      req,
      status: "FAILURE",
      errorMessage: err.message,
    })
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
    res.json({
      success: true,
      data: domains,
    })
  } catch (error) {
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

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: "DELETE_DOMAIN",
      resourceType: "DOMAIN",
      resourceId: result._id,
      description: `删除域名: ${domain}`,
      metadata: { domain },
      req,
      status: "SUCCESS",
    })

    res.json({
      success: true,
      message: "域名删除成功",
    })
  } catch (err) {
    // 记录失败的审计日志
    await createAuditLog({
      userId: req.user.id,
      action: "DELETE_DOMAIN",
      resourceType: "DOMAIN",
      description: `删除域名失败: ${domain}`,
      metadata: { domain, error: err.message },
      req,
      status: "FAILURE",
      errorMessage: err.message,
    })
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
