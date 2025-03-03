const Redis = require("redis")
const { promisify } = require("util")

/**
 * Redis配置
 * 针对1000并发用户优化的配置
 */
const redisConfig = {
  // Redis服务器地址，支持环境变量配置
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,

  // 连接池配置
  max_connections: 200, // 增加连接数以支持高并发
  min_connections: 20, // 保持最小连接数，减少连接建立开销

  // 超时设置
  connect_timeout: 3000, // 连接超时时间，减少等待时间
  connection_timeout: 5000, // 命令执行超时时间

  // 重试策略
  retry_strategy: function (options) {
    // options.error 包含具体错误信息
    // options.total_retry_time 总重试时间
    // options.attempt 重试次数
    if (options.error && options.error.code === "ECONNREFUSED") {
      return new Error("Redis服务器拒绝连接")
    }

    // 重试间隔随次数增加，但最多等待3秒
    // 高并发场景下快速失败比长时间等待更好
    return Math.min(options.attempt * 500, 3000)
  },

  // 性能优化选项
  enable_offline_queue: true, // 启用离线队列，防止连接断开时丢失命令
  retry_unfulfilled_commands: true, // 重试未完成的命令
  no_ready_check: true, // 禁用ready检查，加快连接速度
  disable_resubscribing: true, // 禁用重新订阅，因为不需要pub/sub

  // 连接池优化
  socket_keepalive: true, // 保持连接活跃
  socket_initial_delay: 10000, // 首次keepalive延迟
}

// 全局客户端实例
let client = null

/**
 * 创建Redis客户端
 * 包含自动重连和错误处理机制
 */
function createClient() {
  if (client) return client

  client = Redis.createClient(redisConfig)

  // 错误处理
  client.on("error", (err) => {
    console.error("Redis连接错误:", err)
    // 如果连接断开，尝试重新连接
    if (err.code === "CONNECTION_BROKEN") {
      console.log("尝试重新连接Redis...")
      client = null
      // 5秒后重试，避免立即重连造成服务器压力
      setTimeout(createClient, 5000)
    }
  })

  // 连接监控
  client.on("connect", () => {
    console.log("Redis连接成功")
  })

  client.on("ready", () => {
    console.log("Redis就绪")
  })

  // 连接关闭处理
  client.on("end", () => {
    console.log("Redis连接关闭")
    client = null
  })

  return client
}

// 创建Redis客户端实例
const redisClient = createClient()

// 将Redis命令转换为Promise形式
const getAsync = promisify(redisClient.get).bind(redisClient)
const setAsync = promisify(redisClient.set).bind(redisClient)
const delAsync = promisify(redisClient.del).bind(redisClient)

/**
 * 安全的get方法
 * 包含错误处理和日志记录
 */
const safeGetAsync = async (key) => {
  try {
    const startTime = Date.now()
    const result = await getAsync(key)
    const duration = Date.now() - startTime

    // 记录慢查询
    if (duration > 100) {
      console.warn(`Redis慢查询 - GET ${key}: ${duration}ms`)
    }

    return result
  } catch (error) {
    console.error("Redis获取数据失败:", error)
    return null
  }
}

/**
 * 安全的set方法
 * 包含错误处理和日志记录
 */
const safeSetAsync = async (key, value, ...args) => {
  try {
    const startTime = Date.now()
    const result = await setAsync(key, value, ...args)
    const duration = Date.now() - startTime

    // 记录慢写入
    if (duration > 100) {
      console.warn(`Redis慢写入 - SET ${key}: ${duration}ms`)
    }

    return result
  } catch (error) {
    console.error("Redis设置数据失败:", error)
    return false
  }
}

// 导出方法
module.exports = {
  client: redisClient,
  getAsync: safeGetAsync,
  setAsync: safeSetAsync,
  delAsync,
}
