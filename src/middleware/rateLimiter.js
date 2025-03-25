/**
 * 速率限制中间件
 * 用于防止API滥用和保护服务器资源
 */

const rateLimit = require("express-rate-limit")

// 短链接跳转的速率限制
const redirectLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟时间窗口
  max: 60, // 每个IP每分钟最多60次请求
  standardHeaders: true, // 返回标准的RateLimit头
  legacyHeaders: false, // 禁用X-RateLimit-*头
  message: { success: false, message: "请求过于频繁，请稍后再试" },
  // 跳过负载测试请求的限制
  skip: (req) => req.get("X-Load-Test") === "true",
  // 自定义密钥生成器，使用IP和User-Agent组合
  keyGenerator: (req) => {
    return `${req.ip}-${req.get("user-agent") || "unknown"}`
  },
})

// API接口的速率限制
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP每15分钟最多100次请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "API请求过于频繁，请稍后再试" },
  // 跳过认证用户的限制
  skip: (req) => req.user && req.user.id,
})

// 登录接口的速率限制（防止暴力破解）
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10, // 每个IP每小时最多10次失败尝试
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "登录尝试次数过多，请稍后再试" },
  // 只对失败的登录请求进行限制
  skip: (req, res) => req.method !== "POST" || res.statusCode !== 401,
})

module.exports = {
  redirectLimiter,
  apiLimiter,
  loginLimiter,
}
