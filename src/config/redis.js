const Redis = require("redis")
const { promisify } = require("util")

/**
 * Redis配置
 * 针对高并发优化
 */
const redisConfig = {
  // 基础配置
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,

  // 连接池配置
  max_connections: 200, // 增加最大连接数
  min_connections: 20, // 增加基础连接数

  // 超时设置
  connect_timeout: 2000, // 增加连接超时时间
  connection_timeout: 5000, // 增加操作超时时间

  // 重试策略 - 快速失败
  retry_strategy: function (options) {
    if (options.error) {
      if (options.error.code === "ECONNREFUSED") {
        return new Error("Redis服务器拒绝连接")
      }
      if (options.total_retry_time > 1000) {
        return new Error("重试超时")
      }
    }
    return Math.min(options.attempt * 100, 500) // 最多等待500ms
  },

  // 性能优化
  enable_offline_queue: true, // 启用离线队列
  retry_unfulfilled_commands: true, // 启用命令重试
  no_ready_check: true, // 禁用ready检查
  disable_resubscribing: true, // 禁用重新订阅

  // 连接优化
  socket_keepalive: true,
  socket_initial_delay: 1000, // 降低keepalive延迟

  // 添加密码认证（如果有）
  password: process.env.REDIS_PASSWORD,

  // 添加数据库选择
  db: 0,
}

// 连接池管理
const pool = {
  clients: new Set(),
  maxSize: 10, // 增加到10个客户端/进程
}

/**
 * 创建Redis客户端
 * 使用简单的连接池
 */
function createClient() {
  // 如果连接池已满，返回已有连接中负载最小的
  if (pool.clients.size >= pool.maxSize) {
    return Array.from(pool.clients)[0]
  }

  const client = Redis.createClient(redisConfig)

  // 错误处理
  client.on("error", (err) => {
    console.error("Redis连接错误:", err)
    pool.clients.delete(client)

    // 延迟重连
    setTimeout(() => {
      if (pool.clients.size < pool.maxSize) {
        createClient()
      }
    }, 1000)
  })

  // 监控
  client.on("connect", () => console.log("Redis连接成功"))
  client.on("ready", () => console.log("Redis就绪"))
  client.on("end", () => {
    console.log("Redis连接关闭")
    pool.clients.delete(client)
  })

  pool.clients.add(client)
  return client
}

// 获取连接
function getClient() {
  if (pool.clients.size === 0) {
    return createClient()
  }

  // 使用简单的轮询策略
  const clients = Array.from(pool.clients)
  const index = Math.floor(Math.random() * clients.length)
  return clients[index]
}

// 创建初始连接
const redisClient = createClient()

// Promise化
const getAsync = promisify(redisClient.get).bind(redisClient)
const setAsync = promisify(redisClient.set).bind(redisClient)
const delAsync = promisify(redisClient.del).bind(redisClient)

/**
 * 安全的get方法
 */
const safeGetAsync = async (key) => {
  const client = getClient()
  const startTime = Date.now()

  try {
    const result = await getAsync.call(client, key)
    const duration = Date.now() - startTime

    if (duration > 50) {
      // 降低慢查询阈值
      console.warn(`Redis慢查询 - GET ${key}: ${duration}ms`)
    }

    return result
  } catch (error) {
    console.error("Redis获取失败:", error)
    return null
  }
}

/**
 * 安全的set方法
 */
const safeSetAsync = async (key, value, ...args) => {
  const client = getClient()
  const startTime = Date.now()

  try {
    const result = await setAsync.call(client, key, value, ...args)
    const duration = Date.now() - startTime

    if (duration > 50) {
      console.warn(`Redis慢写入 - SET ${key}: ${duration}ms`)
    }

    return result
  } catch (error) {
    console.error("Redis设置失败:", error)
    return false
  }
}

module.exports = {
  client: redisClient,
  getAsync: safeGetAsync,
  setAsync: safeSetAsync,
  delAsync,
}
