const { spawn } = require("child_process")
const path = require("path")
const fs = require("fs").promises
const Domain = require("../models/Domain")
const { createAuditLog } = require("../controllers/auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")

class SSLService {
  constructor() {
    this.acmePath = "/root/.acme.sh/acme.sh" // acme.sh 安装路径
    this.certsDir =
      process.env.NODE_ENV === "production"
        ? "/etc/nginx/ssl/domains"
        : path.join(process.cwd(), "certs") // 证书存储目录
  }

  async initialize() {
    // 确保证书目录存在
    await fs.mkdir(this.certsDir, { recursive: true })

    // 在生产环境下设置目录权限
    if (process.env.NODE_ENV === "production") {
      try {
        // 设置目录权限，确保 nginx 和应用都能访问
        await fs.chmod(this.certsDir, 0o750)
        // 如果需要，也可以更改所有权
        // 注意：这需要应用以 root 权限运行，或使用 sudo
        // await fs.chown(this.certsDir, 'www-data', 'www-data')
      } catch (error) {
        console.warn(
          "Warning: Could not set permissions on certs directory:",
          error
        )
      }
    }
  }

  async installAcme() {
    if (!process.env.ACME_EMAIL) {
      throw new Error("ACME_EMAIL environment variable is not set")
    }

    return new Promise((resolve, reject) => {
      const install = spawn("curl", [
        "https://get.acme.sh",
        "|",
        "sh",
        "-s",
        `email=${process.env.ACME_EMAIL}`,
      ])

      install.stdout.on("data", (data) => {
        console.log(`acme.sh installation: ${data}`)
      })

      install.stderr.on("data", (data) => {
        console.error(`acme.sh installation error: ${data}`)
      })

      install.on("close", (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`acme.sh installation failed with code ${code}`))
        }
      })
    })
  }

  async issueCertificate(domain, userId) {
    const certPath = path.join(this.certsDir, domain, "cert.pem")
    const keyPath = path.join(this.certsDir, domain, "key.pem")

    return new Promise(async (resolve, reject) => {
      try {
        // 创建域名证书目录
        await fs.mkdir(path.join(this.certsDir, domain), { recursive: true })

        const issue = spawn(this.acmePath, [
          "--issue",
          "-d",
          domain,
          "--standalone",
          "--server",
          "letsencrypt",
          "--cert-file",
          certPath,
          "--key-file",
          keyPath,
          "--fullchain-file",
          path.join(this.certsDir, domain, "fullchain.pem"),
        ])

        issue.stdout.on("data", (data) => {
          console.log(`Certificate issuance for ${domain}: ${data}`)
        })

        issue.stderr.on("data", (data) => {
          console.error(`Certificate issuance error for ${domain}: ${data}`)
        })

        issue.on("close", async (code) => {
          if (code === 0) {
            // 更新数据库中的证书信息
            const expiresAt = new Date()
            expiresAt.setDate(expiresAt.getDate() + 90) // Let's Encrypt 证书有效期为 90 天

            await Domain.findOneAndUpdate(
              { domain },
              {
                "sslCertificate.certPath": certPath,
                "sslCertificate.keyPath": keyPath,
                "sslCertificate.issuedAt": new Date(),
                "sslCertificate.expiresAt": expiresAt,
                "sslCertificate.status": "active",
                "sslCertificate.lastRenewalAttempt": new Date(),
                "sslCertificate.renewalError": null,
              }
            )

            // 记录审计日志
            await createAuditLog({
              userId,
              action: ACTION_TYPES.SSL_CERTIFICATE_ISSUED,
              resourceType: RESOURCE_TYPES.DOMAIN,
              description: `为域名 ${domain} 颁发了 SSL 证书`,
              metadata: { domain, expiresAt },
            })

            resolve()
          } else {
            const error = new Error(
              `Certificate issuance failed for ${domain} with code ${code}`
            )
            await Domain.findOneAndUpdate(
              { domain },
              {
                "sslCertificate.status": "error",
                "sslCertificate.lastRenewalAttempt": new Date(),
                "sslCertificate.renewalError": error.message,
              }
            )
            reject(error)
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  async renewCertificate(domain, userId) {
    return new Promise(async (resolve, reject) => {
      try {
        const renew = spawn(this.acmePath, ["--renew", "-d", domain, "--force"])

        renew.stdout.on("data", (data) => {
          console.log(`Certificate renewal for ${domain}: ${data}`)
        })

        renew.stderr.on("data", (data) => {
          console.error(`Certificate renewal error for ${domain}: ${data}`)
        })

        renew.on("close", async (code) => {
          if (code === 0) {
            const expiresAt = new Date()
            expiresAt.setDate(expiresAt.getDate() + 90)

            await Domain.findOneAndUpdate(
              { domain },
              {
                "sslCertificate.issuedAt": new Date(),
                "sslCertificate.expiresAt": expiresAt,
                "sslCertificate.status": "active",
                "sslCertificate.lastRenewalAttempt": new Date(),
                "sslCertificate.renewalError": null,
              }
            )

            // 记录审计日志
            await createAuditLog({
              userId,
              action: ACTION_TYPES.SSL_CERTIFICATE_RENEWED,
              resourceType: RESOURCE_TYPES.DOMAIN,
              description: `更新了域名 ${domain} 的 SSL 证书`,
              metadata: { domain, expiresAt },
            })

            resolve()
          } else {
            const error = new Error(
              `Certificate renewal failed for ${domain} with code ${code}`
            )
            await Domain.findOneAndUpdate(
              { domain },
              {
                "sslCertificate.lastRenewalAttempt": new Date(),
                "sslCertificate.renewalError": error.message,
              }
            )
            reject(error)
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  async checkCertificateStatus(domain) {
    const domainDoc = await Domain.findOne({ domain })
    if (!domainDoc?.sslCertificate?.expiresAt) {
      return "pending"
    }

    const now = new Date()
    const expiresAt = new Date(domainDoc.sslCertificate.expiresAt)
    const daysUntilExpiry = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry <= 0) {
      return "expired"
    } else if (daysUntilExpiry <= 30) {
      return "renewal-needed"
    } else {
      return "active"
    }
  }

  async setupAutoRenewal() {
    // 每天检查一次证书状态
    setInterval(async () => {
      try {
        const domains = await Domain.find({
          "sslCertificate.status": "active",
        })

        for (const domain of domains) {
          const status = await this.checkCertificateStatus(domain.domain)
          if (status === "renewal-needed") {
            try {
              await this.renewCertificate(domain.domain, domain.userId)
              console.log(
                `Successfully renewed certificate for ${domain.domain}`
              )
            } catch (error) {
              console.error(
                `Failed to renew certificate for ${domain.domain}:`,
                error
              )
            }
          }
        }
      } catch (error) {
        console.error("Error in certificate auto-renewal:", error)
      }
    }, 24 * 60 * 60 * 1000) // 24 小时
  }
}

module.exports = new SSLService()
