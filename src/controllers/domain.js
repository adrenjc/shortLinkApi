const Domain = require("../models/Domain")
const crypto = require("crypto")
const dns = require("dns").promises
const { createAuditLog } = require("./auditLog")
const Link = require("../models/Link")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")

// 添加新域名
const addDomain = async (req, res) => {
  const { domain } = req.body

  try {
    // 检查域名格式
    if (!domain || typeof domain !== "string") {
      return res.status(400).json({
        success: false,
        message: "域名格式无效",
      })
    }

    // 检查域名是否已存在
    const existingDomain = await Domain.findOne({ domain })
    if (existingDomain) {
      return res.status(400).json({
        success: false,
        message: "该域名已被添加",
      })
    }

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
      action: ACTION_TYPES.CREATE_DOMAIN,
      resourceType: RESOURCE_TYPES.DOMAIN,
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
        verificationInstructions: `请添加以下 TXT 记录到您的域名解析：
          记录类型: TXT
          主机记录: @
          记录值: ${verificationCode}`,
      },
    })
  } catch (err) {
    console.error("添加域名错误:", err)

    // 记录失败的审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.CREATE_DOMAIN,
      resourceType: RESOURCE_TYPES.DOMAIN,
      description: `添加域名失败: ${domain}`,
      metadata: { domain, error: err.message },
      req,
      status: "FAILURE",
      errorMessage: err.message,
    })

    // 根据错误类型返回不同的错误信息
    if (err.code === 11000) {
      res.status(400).json({
        success: false,
        message: "该域名已被添加",
      })
    } else {
      res.status(500).json({
        success: false,
        message: "添加域名失败",
        error: err.message,
      })
    }
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
          action: ACTION_TYPES.VERIFY_DOMAIN,
          resourceType: RESOURCE_TYPES.DOMAIN,
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
      action: ACTION_TYPES.VERIFY_DOMAIN,
      resourceType: RESOURCE_TYPES.DOMAIN,
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

// 添加一个检查 DNS 记录的工具函数
const checkDNSRecord = async (domain, verificationCode) => {
  try {
    const records = await dns.resolveTxt(domain)
    return records.some((record) =>
      record.some((string) => string === verificationCode)
    )
  } catch (error) {
    console.error(`DNS 记录检查失败: ${domain}`, error)
    return false
  }
}

// 添加重新验证域名的功能
const recheckDomain = async (req, res) => {
  const { domain } = req.params

  try {
    const domainDoc = await Domain.findOne({
      domain,
      userId: req.user.id,
    })

    if (!domainDoc) {
      return res.status(404).json({
        success: false,
        message: "域名未找到",
      })
    }

    // 检查 DNS 记录
    const isValid = await checkDNSRecord(domain, domainDoc.verificationCode)

    // 如果验证状态发生变化，更新数据库
    if (domainDoc.verified !== isValid) {
      domainDoc.verified = isValid
      await domainDoc.save()

      // 添加审计日志
      await createAuditLog({
        userId: req.user.id,
        action: ACTION_TYPES.DOMAIN_VERIFY,
        resourceType: RESOURCE_TYPES.DOMAIN,
        resourceId: domainDoc._id,
        description: `域名验证状态变更: ${domain} -> ${
          isValid ? "验证成功" : "验证失败"
        }`,
        metadata: {
          domain,
          previousState: domainDoc.verified,
          newState: isValid,
        },
        req,
        status: "SUCCESS",
      })
    }

    res.json({
      success: true,
      data: {
        domain: domainDoc.domain,
        verified: isValid,
        verificationCode: domainDoc.verificationCode,
      },
      message: isValid ? "域名验证有效" : "域名验证已失效",
    })
  } catch (err) {
    console.error("域名重新验证错误:", err)
    res.status(500).json({
      success: false,
      message: err.message || "域名重新验证失败",
    })
  }
}

// 修改 getDomains 函数
const getDomains = async (req, res) => {
  try {
    const domains = await Domain.find({ userId: req.user.id })

    // 并行处理所有域名
    const verificationPromises = domains.map(async (domain) => {
      // 如果域名已验证，检查其 DNS 记录
      if (domain.verified) {
        const isValid = await checkDNSRecord(
          domain.domain,
          domain.verificationCode
        )
        if (domain.verified !== isValid) {
          // 更新验证状态
          domain.verified = isValid
          await domain.save()

          // 记录状态变更
          await createAuditLog({
            userId: req.user.id,
            action: ACTION_TYPES.DOMAIN_VERIFY,
            resourceType: RESOURCE_TYPES.DOMAIN,
            resourceId: domain._id,
            description: `域名自动验证状态变更: ${domain.domain} -> ${
              isValid ? "验证成功" : "验证失败"
            }`,
            metadata: {
              domain: domain.domain,
              previousState: true,
              newState: isValid,
            },
            req,
            status: "SUCCESS",
          })
        }
        return { ...domain.toObject(), verified: isValid }
      }
      // 未验证的域名直接返回
      return domain.toObject()
    })

    const updatedDomains = await Promise.all(verificationPromises)

    res.json({
      success: true,
      data: updatedDomains,
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
  let session = null

  try {
    // 开启事务会话
    session = await Domain.startSession()

    // 开始事务
    const result = await session.withTransaction(async () => {
      // 查找域名是否存在
      const domainDoc = await Domain.findOne({
        domain,
        userId: req.user.id,
      }).session(session)

      if (!domainDoc) {
        throw new Error("域名未找到")
      }

      // 在事务中删除域名
      await Domain.deleteOne({
        domain,
        userId: req.user.id,
      }).session(session)

      // 在事务中删除相关短链接
      await Link.deleteMany({
        customDomain: domain,
        createdBy: req.user.id,
      }).session(session)

      // 在事务中添加审计日志
      await createAuditLog({
        userId: req.user.id,
        action: ACTION_TYPES.DELETE_DOMAIN,
        resourceType: RESOURCE_TYPES.DOMAIN,
        resourceId: domainDoc._id,
        description: `删除域名及相关短链: ${domain}`,
        metadata: { domain },
        req,
        status: "SUCCESS",
      })

      return domainDoc // 返回删除的域名文档
    })

    // 如果事务成功完成
    res.json({
      success: true,
      message: "域名及相关短链删除成功",
      data: result,
    })
  } catch (err) {
    console.error("删除域名错误:", err)

    // 记录失败的审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.DELETE_DOMAIN,
      resourceType: RESOURCE_TYPES.DOMAIN,
      description: `删除域名失败: ${domain}`,
      metadata: { domain, error: err.message },
      req,
      status: "FAILURE",
      errorMessage: err.message,
    })

    res.status(500).json({
      success: false,
      message: err.message || "删除域名失败",
    })
  } finally {
    // 确保会话被终止
    if (session) {
      await session.endSession()
    }
  }
}

// 导出所有函数
module.exports = {
  addDomain,
  verifyDomain,
  getDomains,
  deleteDomain,
  recheckDomain,
}
