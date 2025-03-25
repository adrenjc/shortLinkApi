require("dotenv").config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
})
const express = require("express")
const cors = require("cors")
const connectDB = require("./src/config/db")
const router = require("./src/routes")
const rateLimit = require("express-rate-limit")
const mongoose = require("mongoose")
const sslService = require("./src/services/sslService")
// 添加压缩和安全中间件
const compression = require("compression")
const helmet = require("helmet")
const morgan = require("morgan")

const app = express()

// 安全中间件
app.use(helmet())

// 压缩中间件
app.use(
  compression({
    level: 6, // 压缩级别，平衡CPU使用和压缩率
    threshold: 1024, // 只压缩大于1KB的响应
    filter: (req, res) => {
      // 不压缩已经压缩的资源
      if (
        req.headers["content-type"] &&
        (req.headers["content-type"].includes("image/") ||
          req.headers["content-type"].includes("video/"))
      ) {
        return false
      }
      return compression.filter(req, res)
    },
  })
)

// 日志中间件
if (process.env.NODE_ENV === "production") {
  // 生产环境使用简洁日志
  app.use(
    morgan("combined", {
      skip: (req, res) => res.statusCode < 400, // 只记录错误响应
    })
  )
} else {
  // 开发环境使用详细日志
  app.use(morgan("dev"))
}

// 中间件
app.use(cors()) // 允许跨域
app.use(express.json()) // 解析JSON请求体

// 连接数据库
connectDB()

// 添加数据库连接监控
mongoose.connection.on("error", (err) => {
  console.error("MongoDB 连接错误:", err)
})

mongoose.connection.on("connected", () => {
  console.log("MongoDB 连接成功")
})

// 监控慢查询
mongoose.set("debug", (collectionName, method, query, doc) => {
  const start = Date.now()
  return () => {
    const time = Date.now() - start
    if (time > 100) {
      console.warn(`慢查询: ${collectionName}.${method} (${time}ms)`, query)
    }
  }
})

// 路由
app.use("/api", router)

// 增加请求队列长度
app.set("backlog", 511)

// 增加超时设置
app.use((req, res, next) => {
  req.setTimeout(15000)
  res.setTimeout(15000)
  next()
})

// 添加健康检查端点
app.get("/health", (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: "OK",
    timestamp: Date.now(),
  }
  res.status(200).send(healthcheck)
})

// 优化错误处理
app.use((err, req, res, next) => {
  console.error("服务器错误:", err)

  // 区分开发环境和生产环境的错误响应
  if (process.env.NODE_ENV === "development") {
    res.status(500).send({
      success: false,
      message: "服务器错误",
      error: err.message,
      stack: err.stack,
    })
  } else {
    res.status(500).send({
      success: false,
      message: "服务器错误",
    })
  }
})

// 初始化 SSL 服务
async function initializeSSLService() {
  try {
    await sslService.initialize()
    await sslService.setupAutoRenewal()
    console.log("SSL service initialized successfully")
  } catch (error) {
    console.error("Failed to initialize SSL service:", error)
  }
}

// 启动服务器
const startServer = async () => {
  try {
    await connectDB()
    console.log("MongoDB connected successfully")

    await initializeSSLService()

    const server = app.listen(process.env.PORT || 5000, () => {
      console.log("服务器启动在端口:", server.address().port)
    })

    // 优化连接处理
    server.keepAliveTimeout = 65000
    server.headersTimeout = 66000
    server.maxConnections = 10000 // 最大连接数

    // 优雅关闭
    process.on("SIGTERM", () => {
      console.log("收到 SIGTERM 信号，准备关闭服务器...")
      server.close(() => {
        console.log("服务器已关闭")
        mongoose.connection.close(false, () => {
          console.log("MongoDB 连接已关闭")
          process.exit(0)
        })
      })
    })
  } catch (error) {
    console.error("Server startup error:", error)
    process.exit(1)
  }
}

startServer()
