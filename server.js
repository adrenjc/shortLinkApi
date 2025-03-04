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

const app = express()

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

// 添加请求限流
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 1000, // 每个IP最多1000个请求
})

// 应用限流
app.use(limiter)

// 优化错误处理
app.use((err, req, res, next) => {
  console.error("服务器错误:", err)
  res.status(500).send("服务器错误")
})

// 优化监听配置
const server = app.listen(process.env.PORT || 5000, () => {
  console.log("服务器启动在端口:", server.address().port)
})

// 优化连接处理
server.keepAliveTimeout = 65000
server.headersTimeout = 66000
server.maxConnections = 10000 // 最大连接数
