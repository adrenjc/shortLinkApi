const Redis = require("redis")
const { promisify } = require("util")

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  retry_strategy: function (options) {
    if (options.error && options.error.code === "ECONNREFUSED") {
      if (options.attempt > 10) {
        return undefined
      }
      return Math.min(options.attempt * 500, 3000)
    }
    return Math.min(options.attempt * 500, 3000)
  },
  connect_timeout: 10000,
  max_connections: 50,
  connection_timeout: 10000,
  retry_unfulfilled_commands: true,
}

let client = null

function createClient() {
  if (client) return client

  client = Redis.createClient(redisConfig)

  client.on("error", (err) => {
    console.error("Redis连接错误:", err)
    if (err.code === "CONNECTION_BROKEN") {
      console.log("尝试重新连接Redis...")
      client = null
      setTimeout(createClient, 5000)
    }
  })

  client.on("connect", () => {
    console.log("Redis连接成功")
  })

  client.on("ready", () => {
    console.log("Redis就绪")
  })

  return client
}

const redisClient = createClient()

const getAsync = promisify(redisClient.get).bind(redisClient)
const setAsync = promisify(redisClient.set).bind(redisClient)
const delAsync = promisify(redisClient.del).bind(redisClient)

const safeGetAsync = async (key) => {
  try {
    return await getAsync(key)
  } catch (error) {
    console.error("Redis获取数据失败:", error)
    return null
  }
}

const safeSetAsync = async (key, value, ...args) => {
  try {
    return await setAsync(key, value, ...args)
  } catch (error) {
    console.error("Redis设置数据失败:", error)
    return false
  }
}

module.exports = {
  client: redisClient,
  getAsync: safeGetAsync,
  setAsync: safeSetAsync,
  delAsync,
}
