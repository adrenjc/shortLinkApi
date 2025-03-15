const Domain = require("../models/Domain")
const crypto = require("crypto")
const dns = require("dns").promises
const { createAuditLog } = require("./auditLog")
const Link = require("../models/Link")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")
const sslService = require("../services/sslService")
const fs = require("fs").promises
const path = require("path")
const { exec } = require("child_process")
const util = require("util")
const execAsync = util.promisify(exec)
const { delAsync } = require("../config/redis")

const isDev = process.env.NODE_ENV === "development"

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

        // 域名验证成功后，自动申请 SSL 证书
        try {
          const sslResult = await sslService.requestCertificate(domain)
          if (!sslResult && !isDev) {
            console.warn(`SSL certificate request failed for ${domain}`)
          }
        } catch (sslError) {
          if (!isDev) {
            console.error("SSL certificate issuance failed:", sslError)
            // 不阻止域名验证流程，但记录错误
            await createAuditLog({
              userId: req.user.id,
              action: ACTION_TYPES.SSL_CERTIFICATE_ERROR,
              resourceType: RESOURCE_TYPES.DOMAIN,
              description: `SSL 证书申请失败: ${domain}`,
              metadata: { domain, error: sslError.message },
              req,
              status: "FAILURE",
            })
          }
        }

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
  try {
    const { domain } = req.params

    // 1. 获取域名信息
    const domainDoc = await Domain.findOne({ domain })

    if (!domainDoc) {
      return res.status(404).json({
        success: false,
        message: "域名未找到",
      })
    }

    // 2. 获取并删除相关的短链接
    const links = await Link.find({ domain: domainDoc.domain })

    // 删除短链接相关的 Redis 缓存
    for (const link of links) {
      try {
        await delAsync(`shortlink:${link.shortKey}`)
      } catch (error) {
        console.error(`清除短链接缓存失败: ${link.shortKey}`, error)
      }
    }

    // 删除数据库中的短链接
    await Link.deleteMany({ domain: domainDoc.domain })

    // 3. 删除 nginx 配置和证书文件
    const domainName = domainDoc.domain
    if (!process.env.SKIP_SSL_GENERATION) {
      try {
        // 删除 nginx 配置
        await execAsync(`sudo rm -f /etc/nginx/ssl/domains/${domainName}.conf`)

        // 删除证书目录
        await execAsync(`sudo rm -rf /etc/nginx/ssl/domains/${domainName}`)

        // 删除 acme.sh 中的证书
        await execAsync(
          `sudo /root/.acme.sh/acme.sh --remove -d ${domainName} --ecc`
        )

        // 重新加载 nginx
        await execAsync("sudo systemctl reload nginx")
      } catch (error) {
        console.error("Error cleaning up domain files:", error)
      }
    } else {
      console.log(
        `开发环境：跳过删除域名 ${domainName} 的 SSL 证书和 Nginx 配置`
      )
    }

    // 4. 删除数据库中的域名记录
    await Domain.findByIdAndDelete(domainDoc._id)

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.DELETE_DOMAIN,
      resourceType: RESOURCE_TYPES.DOMAIN,
      resourceId: domainDoc._id,
      description: `删除域名: ${domainName}`,
      metadata: { domain: domainName },
      req,
      status: "SUCCESS",
    })

    res.json({
      success: true,
      message: "域名删除成功",
    })
  } catch (error) {
    console.error("删除域名错误:", error)
    res.status(500).json({
      success: false,
      message: "删除域名失败",
    })
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
          sslCertificate: 1,
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

    // 计算每个域名的 SSL 证书剩余时间
    const domainsWithSSLInfo = domains.map((domain) => {
      const sslInfo = {
        ...domain,
        sslRemainingDays: null,
        sslStatus: "pending",
      }

      if (domain.sslCertificate?.expiresAt) {
        const now = new Date()
        const expiresAt = new Date(domain.sslCertificate.expiresAt)
        const remainingDays = Math.ceil(
          (expiresAt - now) / (1000 * 60 * 60 * 24)
        )

        sslInfo.sslRemainingDays = remainingDays
        if (remainingDays <= 0) {
          sslInfo.sslStatus = "expired"
        } else if (remainingDays <= 30) {
          sslInfo.sslStatus = "renewal-needed"
        } else {
          sslInfo.sslStatus = "active"
        }
      }

      return sslInfo
    })

    // 获取总数量
    const total = await Domain.countDocuments(query)

    // 返回符合 ProTable 的数据格式
    res.json({
      success: true,
      data: domainsWithSSLInfo,
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

// 获取域名 SSL 证书状态
const getDomainSSLStatus = async (req, res) => {
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

    const status = await sslService.checkCertificateStatus(domain)

    res.json({
      success: true,
      data: {
        status,
        certificate: domainDoc.sslCertificate,
      },
    })
  } catch (err) {
    console.error("获取 SSL 状态错误:", err)
    res.status(500).json({
      success: false,
      message: err.message || "获取 SSL 状态失败",
    })
  }
}

// 手动更新 SSL 证书
const renewSSLCertificate = async (req, res) => {
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

    await sslService.renewCertificate(domain, req.user.id)

    res.json({
      success: true,
      message: "SSL 证书更新成功",
    })
  } catch (err) {
    console.error("更新 SSL 证书错误:", err)
    res.status(500).json({
      success: false,
      message: err.message || "更新 SSL 证书失败",
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
  getDomainSSLStatus,
  renewSSLCertificate,
}
