const { exec } = require("child_process")
const util = require("util")
const execAsync = util.promisify(exec)
const fs = require("fs").promises
const path = require("path")
const Domain = require("../models/Domain")
const { createAuditLog } = require("../controllers/auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")

class SSLService {
  constructor() {
    this.sslDir = "/etc/nginx/ssl/domains"
  }

  async initialize() {
    try {
      await fs.mkdir(this.sslDir, { recursive: true })
    } catch (error) {
      console.error("Failed to create SSL directory:", error)
    }
  }

  async requestCertificate(domain) {
    try {
      console.log(`开始为 ${domain} 申请证书...`)

      // 创建证书目录
      await execAsync(`sudo mkdir -p ${this.sslDir}/${domain}`)

      // 申请证书时添加 --debug 参数
      const { stdout, stderr } = await execAsync(
        `sudo /root/.acme.sh/acme.sh --issue -d ${domain} -w /var/www/html --debug`
      )
      console.log("证书申请输出:", stdout)
      if (stderr) console.error("证书申请错误:", stderr)

      // 安装证书
      await execAsync(`
        sudo /root/.acme.sh/acme.sh --install-cert -d ${domain} \
        --key-file ${this.sslDir}/${domain}/key.pem \
        --fullchain-file ${this.sslDir}/${domain}/fullchain.pem \
        --reloadcmd "systemctl reload nginx"
      `)

      // 修改 nginx 配置模板
      const nginxConfig = `
# SSL configuration for ${domain}
server {
    listen 443 ssl;
    server_name ${domain};
    
    ssl_certificate ${this.sslDir}/${domain}/fullchain.pem;
    ssl_certificate_key ${this.sslDir}/${domain}/key.pem;

    # 其他配置继承自主配置
    include /etc/nginx/ssl/domains/common.conf;
}
`
      // 写入配置文件
      await execAsync(
        `sudo tee ${this.sslDir}/${domain}.conf > /dev/null << 'EOL'\n${nginxConfig}\nEOL`
      )

      // 重新加载 nginx
      await execAsync("sudo systemctl reload nginx")

      console.log(
        `SSL certificate for ${domain} has been issued and installed successfully`
      )
      return true
    } catch (error) {
      console.error(`Error requesting SSL certificate for ${domain}:`, error)
      return false
    }
  }

  async setupAutoRenewal() {
    try {
      // 配置自动续期
      await execAsync(`
        sudo /root/.acme.sh/acme.sh --install-cronjob
      `)
      console.log("SSL auto-renewal configured successfully")
    } catch (error) {
      console.error("Failed to setup SSL auto-renewal:", error)
    }
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

  async renewCertificate(domain, userId) {
    return new Promise(async (resolve, reject) => {
      try {
        const renew = exec(
          `sudo /root/.acme.sh/acme.sh --renew -d ${domain} --force`
        )

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
