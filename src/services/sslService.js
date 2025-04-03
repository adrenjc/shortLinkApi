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
    this.skipSSLGeneration = process.env.NODE_ENV === "development"
  }

  async initialize() {
    if (this.skipSSLGeneration) {
      console.log("开发环境：跳过 SSL 服务初始化")
      return
    }

    try {
      await fs.mkdir(this.sslDir, { recursive: true })
    } catch (error) {
      console.error("Failed to create SSL directory:", error)
    }
  }

  async requestCertificate(domain) {
    if (this.skipSSLGeneration) {
      console.log(`开发环境：跳过为 ${domain} 生成 SSL 证书`)
      // 在开发环境中，我们仍然更新域名的 SSL 证书状态
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 90) // 设置90天的模拟过期时间

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
      return true
    }

    try {
      console.log(`开始为 ${domain} 申请证书...`)

      // 创建证书目录
      await execAsync(`sudo mkdir -p ${this.sslDir}/${domain}`)

      // 添加 --force 参数强制重新申请
      const { stdout, stderr } = await execAsync(
        `sudo /root/.acme.sh/acme.sh --issue -d ${domain} -w /var/www/html --force --debug`
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
    listen 80;
    server_name ${domain};
    
    # ACME challenge - 用于Let's Encrypt证书验证
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri =404;
    }
    
    # 短链跳转接口
    location ~* ^/r/(.+)$ {
        proxy_pass http://backend/api/r/$1;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $http_host;

        # 禁用缓存
        proxy_no_cache 1;
        proxy_cache_bypass 1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "-1";

        # 添加安全相关的响应头
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

        proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
        proxy_next_upstream_tries 3;

        proxy_connect_timeout 10s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;

        limit_req zone=redirect burst=200 nodelay;
    }

    # 对于非短链接请求返回404
    location / {
        return 404;
    }
    
    # 日志配置
    access_log /var/log/nginx/custom_domains.access.log detailed buffer=64k flush=5s;
    error_log /var/log/nginx/custom_domains.error.log;
}

server {
    listen 443 ssl;
    server_name ${domain};
    
    ssl_certificate ${this.sslDir}/${domain}/fullchain.pem;
    ssl_certificate_key ${this.sslDir}/${domain}/key.pem;
    
    # ACME challenge - 用于Let's Encrypt证书验证
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri =404;
    }
    
    # 短链跳转接口
    location ~* ^/r/(.+)$ {
        proxy_pass http://backend/api/r/$1;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $http_host;

        # 禁用缓存
        proxy_no_cache 1;
        proxy_cache_bypass 1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "-1";

        # 添加安全相关的响应头
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

        proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
        proxy_next_upstream_tries 3;

        proxy_connect_timeout 10s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;

        limit_req zone=redirect burst=200 nodelay;
    }

    # 对于非短链接请求返回404
    location / {
        return 404;
    }
    
    # 日志配置
    access_log /var/log/nginx/custom_domains.access.log detailed buffer=64k flush=5s;
    error_log /var/log/nginx/custom_domains.error.log;
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
    if (this.skipSSLGeneration) {
      console.log("开发环境：跳过设置 SSL 自动续期")
      return
    }

    try {
      // 配置自动续期
      await execAsync(`
        sudo /root/.acme.sh/acme.sh --install-cronjob
      `)
      console.log("SSL auto-renewal configured successfully")
    } catch (error) {
      console.error("Failed to setup SSL auto-renewal:", error)
    }

    // 每天检查一次证书状态
    setInterval(async () => {
      if (this.skipSSLGeneration) {
        return
      }

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
    if (this.skipSSLGeneration) {
      console.log(`开发环境：跳过为 ${domain} 更新 SSL 证书`)
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
        description: `开发环境：模拟更新域名 ${domain} 的 SSL 证书`,
        metadata: { domain, expiresAt },
      })

      return Promise.resolve()
    }

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
}

module.exports = new SSLService()
