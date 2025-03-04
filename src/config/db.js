const mongoose = require("mongoose")

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 50,
      minPoolSize: 10,
      socketTimeoutMS: 45000,
      maxIdleTimeMS: 10000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
      monitorCommands: true,
    })

    console.log("MongoDB Connected")

    mongoose.connection.on("connected", () => {
      console.log("Mongoose 已连接")
    })

    mongoose.connection.on("error", (err) => {
      console.error("Mongoose 连接错误:", err)
    })

    mongoose.connection.on("disconnected", () => {
      console.log("Mongoose 连接断开")
    })

    // 状态映射
    const stateMap = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    }

    // 定期检查连接状态
    setInterval(() => {
      const state = mongoose.connection.readyState
      console.log("MongoDB 连接状态:", stateMap[state] || "未知状态")
    }, 30000)
  } catch (err) {
    console.error("MongoDB 连接失败:", err)
    process.exit(1)
  }
}

module.exports = connectDB
