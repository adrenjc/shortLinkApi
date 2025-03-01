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

    // 检查域名是否已存在 - 使用不区分大小写的查询
    const existingDomain = await Domain.findOne({
      domain: { $regex: new RegExp(`^${domain}$`, "i") },
    })

    if (existingDomain) {
      return res.status(400).json({
        success: false,
        message: "该域名已被添加",
        data: existingDomain,
      })
    }

    const verificationCode = crypto.randomBytes(16).toString("hex")

    const newDomain = new Domain({
      domain: domain.toLowerCase(),
      userId: req.user.id, // 记录是谁添加的
      verificationCode,
    })

    await newDomain.save()

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.CREATE_DOMAIN,
      resourceType: RESOURCE_TYPES.DOMAIN,
      resourceId: newDomain._id,
      description: `添加新域名: ${domain}`,
      metadata: { domain },
      req,
      status: "SUCCESS",
    })

    res.json({
      success: true,
      data: newDomain,
      message: "域名添加成功",
    })
  } catch (err) {
    console.error("添加域名错误:", err)
    res.status(500).json({
      success: false,
      message: err.message || "添加域名失败",
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
      const domainDoc = await Domain.findOne({ domain }).session(session)

      if (!domainDoc) {
        throw new Error("域名未找到")
      }

      // 在事务中删除域名
      await Domain.deleteOne({ domain }).session(session)

      // 在事务中删除相关短链接
      await Link.deleteMany({
        customDomain: domain,
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

      return domainDoc
    })

    res.json({
      success: true,
      message: "域名及相关短链删除成功",
      data: result,
    })
  } catch (err) {
    console.error("删除域名错误:", err)
    res.status(500).json({
      success: false,
      message: err.message || "删除域名失败",
    })
  } finally {
    if (session) {
      await session.endSession()
    }
  }
}

// 获取所有用户的域名列表
const getAllUsersDomains = async (req, res) => {
  try {
    // 获取分页参数，使用 current 和 pageSize
    const current = parseInt(req.query.current) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    const skip = (current - 1) * pageSize

    // 构建查询条件
    const query = {}
    if (req.query.domain) {
      query.domain = { $regex: new RegExp(req.query.domain, "i") }
    }

    // 聚合查询，关联用户信息
    const domains = await Domain.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          domain: 1,
          verified: 1,
          verificationCode: 1,
          createdAt: 1,
          updatedAt: 1,
          "user.username": 1,
          "user.email": 1,
          "user._id": 1,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: pageSize,
      },
    ])

    // 获取总数量
    const total = await Domain.countDocuments(query)

    // 返回符合 ProTable 的数据格式
    res.json({
      success: true,
      data: domains,
      total: total,
    })
  } catch (err) {
    console.error("获取所有用户域名列表失败:", err)
    res.status(500).json({
      success: false,
      data: [],
      total: 0,
      message: "获取域名列表失败",
    })
  }
}

// 导出所有函数
module.exports = {
  addDomain,
  verifyDomain,
  getDomains,
  deleteDomain,
  recheckDomain,
  getAllUsersDomains,
}
