const mongoose = require("mongoose")

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // 基础配置
      useNewUrlParser: true, // 使用新的URL解析器
      useUnifiedTopology: true, // 使用新的拓扑引擎

      // 连接池配置
      maxPoolSize: 100, // 根据服务器内存调整
      minPoolSize: 20, // 保持更多活跃连接

      // 超时配置
      socketTimeoutMS: 30000, // 降低单个操作超时
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000,

      // 读写分离配置
      readPreference: "primaryPreferred", // 允许从从节点读取
      readConcern: { level: "local" }, // 读取本地数据即可

      // 写入配置
      writeConcern: {
        w: 1, // 只需主节点确认写入
        j: false, // 不要求写入日志
        wtimeout: 5000,
      },

      // 监控和调试
      monitorCommands: true, // 监控数据库命令
    })

    console.log("MongoDB Connected")

    // 连接事件监听
    mongoose.connection.on("connected", () => {
      console.log("Mongoose 已连接")
    })

    mongoose.connection.on("error", (err) => {
      console.error("Mongoose 连接错误:", err)
    })

    mongoose.connection.on("disconnected", () => {
      console.log("Mongoose 连接断开")
    })

    // 性能监控
    mongoose.connection.on("reconnected", () => {
      console.log("MongoDB 重连成功")
    })

    // 添加全局索引
    await createIndexes()
  } catch (err) {
    console.error("MongoDB 连接失败:", err)
    process.exit(1)
  }
}

// 创建索引函数
async function createIndexes() {
  try {
    const Link = mongoose.model("Link")

    // 创建复合索引
    await Link.collection.createIndex(
      { shortKey: 1 },
      { unique: true, background: true }
    )

    // 创建过期时间索引（如果需要自动清理过期数据）
    await Link.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 365 * 24 * 60 * 60, background: true } // 一年后过期
    )

    // 创建常用查询字段的索引
    await Link.collection.createIndex(
      { createdBy: 1, createdAt: -1 },
      { background: true }
    )

    console.log("数据库索引创建成功")
  } catch (error) {
    console.error("创建索引失败:", error)
  }
}

// 添加全局配置（使用新的配置方式）
if (process.env.NODE_ENV === "development") {
  mongoose.set("debug", true) // 开发环境启用调试
}

module.exports = connectDB
