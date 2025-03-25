/**
 * 短链接服务性能分析脚本
 * 用于分析日志并生成性能报告
 */

const fs = require("fs")
const path = require("path")
const readline = require("readline")

// 配置
const LOG_FILE = process.env.LOG_FILE || "/var/log/shortlink/out.log"
const OUTPUT_FILE = "performance-report.json"

// 性能指标
const metrics = {
  totalRequests: 0,
  redirects: {
    total: 0,
    memoryHits: 0,
    redisHits: 0,
    dbQueries: 0,
    errors: 0,
    avgResponseTime: 0,
    totalResponseTime: 0,
    responseTimeBuckets: {
      "<10ms": 0,
      "10-50ms": 0,
      "50-100ms": 0,
      "100-500ms": 0,
      ">500ms": 0,
    },
  },
  cacheStats: {
    hitRate: 0,
    memoryHitRate: 0,
    redisHitRate: 0,
    avgCacheTime: 0,
    totalCacheTime: 0,
    cacheEntries: 0,
  },
  errors: {
    total: 0,
    byType: {},
  },
  topLinks: [],
  slowestLinks: [],
}

// 临时存储
const linkStats = new Map()
const errorMessages = new Map()

// 解析日志行
function parseLine(line) {
  try {
    // 检查是否是JSON格式
    if (line.trim().startsWith("{") && line.trim().endsWith("}")) {
      const data = JSON.parse(line)
      processLogEntry(data)
      return
    }

    // 检查内存缓存命中
    if (line.includes("内存缓存命中:")) {
      metrics.redirects.memoryHits++
      metrics.redirects.total++
      metrics.totalRequests++

      // 提取响应时间
      const match = line.match(/耗时: (\d+)ms/)
      if (match) {
        const responseTime = parseInt(match[1])
        updateResponseTimeMetrics(responseTime)

        // 提取短链接key
        const keyMatch = line.match(/内存缓存命中: ([^,]+)/)
        if (keyMatch) {
          updateLinkStats(keyMatch[1], responseTime, "memory")
        }
      }
      return
    }

    // 检查Redis缓存命中
    if (line.includes("Redis缓存命中:")) {
      metrics.redirects.redisHits++
      metrics.redirects.total++
      metrics.totalRequests++

      // 提取响应时间
      const match = line.match(/耗时: (\d+)ms/)
      if (match) {
        const responseTime = parseInt(match[1])
        updateResponseTimeMetrics(responseTime)

        // 提取短链接key
        const keyMatch = line.match(/Redis缓存命中: ([^,]+)/)
        if (keyMatch) {
          updateLinkStats(keyMatch[1], responseTime, "redis")
        }
      }
      return
    }

    // 检查数据库查询
    if (line.includes("数据库查询:")) {
      metrics.redirects.dbQueries++
      metrics.redirects.total++
      metrics.totalRequests++

      // 提取响应时间和缓存时间
      const timeMatch = line.match(/耗时: (\d+)ms/)
      const cacheMatch = line.match(/缓存时间: (\d+)秒/)

      if (timeMatch) {
        const responseTime = parseInt(timeMatch[1])
        updateResponseTimeMetrics(responseTime)

        // 提取短链接key
        const keyMatch = line.match(/数据库查询: ([^,]+)/)
        if (keyMatch) {
          updateLinkStats(keyMatch[1], responseTime, "db")
        }

        // 更新缓存时间统计
        if (cacheMatch) {
          const cacheTime = parseInt(cacheMatch[1])
          metrics.cacheStats.totalCacheTime += cacheTime
          metrics.cacheStats.cacheEntries++
        }
      }
      return
    }

    // 检查错误
    if (
      line.includes("错误") ||
      line.includes("Error") ||
      line.includes("失败")
    ) {
      metrics.errors.total++
      metrics.totalRequests++

      // 简单分类错误
      let errorType = "unknown"
      if (line.includes("Redis")) errorType = "redis"
      else if (line.includes("MongoDB")) errorType = "mongodb"
      else if (line.includes("缓存")) errorType = "cache"
      else if (line.includes("重定向")) errorType = "redirect"

      metrics.errors.byType[errorType] =
        (metrics.errors.byType[errorType] || 0) + 1

      // 记录错误消息
      const errorMsg = line.trim()
      errorMessages.set(errorMsg, (errorMessages.get(errorMsg) || 0) + 1)

      return
    }
  } catch (error) {
    console.error("解析日志行失败:", error)
  }
}

// 更新响应时间指标
function updateResponseTimeMetrics(responseTime) {
  metrics.redirects.totalResponseTime += responseTime

  // 更新响应时间分布
  if (responseTime < 10) {
    metrics.redirects.responseTimeBuckets["<10ms"]++
  } else if (responseTime < 50) {
    metrics.redirects.responseTimeBuckets["10-50ms"]++
  } else if (responseTime < 100) {
    metrics.redirects.responseTimeBuckets["50-100ms"]++
  } else if (responseTime < 500) {
    metrics.redirects.responseTimeBuckets["100-500ms"]++
  } else {
    metrics.redirects.responseTimeBuckets[">500ms"]++
  }
}

// 更新链接统计
function updateLinkStats(shortKey, responseTime, source) {
  if (!linkStats.has(shortKey)) {
    linkStats.set(shortKey, {
      shortKey,
      count: 0,
      totalResponseTime: 0,
      avgResponseTime: 0,
      sources: {
        memory: 0,
        redis: 0,
        db: 0,
      },
    })
  }

  const stats = linkStats.get(shortKey)
  stats.count++
  stats.totalResponseTime += responseTime
  stats.avgResponseTime = stats.totalResponseTime / stats.count
  stats.sources[source]++
}

// 计算最终指标
function calculateFinalMetrics() {
  // 计算平均响应时间
  if (metrics.redirects.total > 0) {
    metrics.redirects.avgResponseTime =
      metrics.redirects.totalResponseTime / metrics.redirects.total
  }

  // 计算缓存命中率
  const cacheHits = metrics.redirects.memoryHits + metrics.redirects.redisHits
  if (metrics.redirects.total > 0) {
    metrics.cacheStats.hitRate = cacheHits / metrics.redirects.total
    metrics.cacheStats.memoryHitRate =
      metrics.redirects.memoryHits / metrics.redirects.total
    metrics.cacheStats.redisHitRate =
      metrics.redirects.redisHits / metrics.redirects.total
  }

  // 计算平均缓存时间
  if (metrics.cacheStats.cacheEntries > 0) {
    metrics.cacheStats.avgCacheTime =
      metrics.cacheStats.totalCacheTime / metrics.cacheStats.cacheEntries
  }

  // 获取访问量最高的链接
  metrics.topLinks = Array.from(linkStats.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 获取响应时间最慢的链接
  metrics.slowestLinks = Array.from(linkStats.values())
    .filter((link) => link.count >= 5) // 至少有5次访问
    .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
    .slice(0, 10)

  // 获取最常见的错误
  metrics.errors.topErrors = Array.from(errorMessages.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([message, count]) => ({ message, count }))
}

// 主函数
async function analyzePerformance() {
  console.log("开始分析性能日志...")

  try {
    // 检查日志文件是否存在
    if (!fs.existsSync(LOG_FILE)) {
      console.error(`日志文件不存在: ${LOG_FILE}`)
      return
    }

    // 创建读取流
    const fileStream = fs.createReadStream(LOG_FILE)
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    })

    // 逐行处理日志
    for await (const line of rl) {
      parseLine(line)
    }

    // 计算最终指标
    calculateFinalMetrics()

    // 输出报告
    const report = {
      generatedAt: new Date().toISOString(),
      metrics,
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2))
    console.log(`性能分析完成，报告已保存到 ${OUTPUT_FILE}`)

    // 打印摘要
    console.log("\n===== 性能分析摘要 =====")
    console.log(`总请求数: ${metrics.totalRequests}`)
    console.log(`短链接跳转: ${metrics.redirects.total}`)
    console.log(`缓存命中率: ${(metrics.cacheStats.hitRate * 100).toFixed(2)}%`)
    console.log(
      `- 内存缓存: ${(metrics.cacheStats.memoryHitRate * 100).toFixed(2)}%`
    )
    console.log(
      `- Redis缓存: ${(metrics.cacheStats.redisHitRate * 100).toFixed(2)}%`
    )
    console.log(
      `平均响应时间: ${metrics.redirects.avgResponseTime.toFixed(2)}ms`
    )
    console.log(`错误数: ${metrics.errors.total}`)
    console.log("========================")
  } catch (error) {
    console.error("性能分析失败:", error)
  }
}

// 执行分析
analyzePerformance()
