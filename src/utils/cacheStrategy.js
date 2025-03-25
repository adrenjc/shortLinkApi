/**
 * 动态缓存策略模块
 * 根据访问频率和重要性动态调整缓存时间
 */

// 访问计数器
const accessCounter = new Map()

// 默认缓存时间（秒）
const DEFAULT_CACHE_TIME = 3600 // 1小时

/**
 * 增加访问计数
 * @param {string} shortKey 短链接key
 */
const incrementAccessCount = (shortKey) => {
  const currentCount = accessCounter.get(shortKey) || 0
  accessCounter.set(shortKey, currentCount + 1)

  // 防止计数器无限增长，设置上限
  if (accessCounter.size > 100000) {
    // 简单的清理策略：保留访问次数最多的前50000个
    const entries = [...accessCounter.entries()]
    entries.sort((a, b) => b[1] - a[1])

    accessCounter.clear()
    entries.slice(0, 50000).forEach(([key, count]) => {
      accessCounter.set(key, count)
    })
  }
}

/**
 * 获取访问计数
 * @param {string} shortKey 短链接key
 * @returns {number} 访问次数
 */
const getAccessCount = (shortKey) => {
  return accessCounter.get(shortKey) || 0
}

/**
 * 计算动态缓存时间
 * @param {string} shortKey 短链接key
 * @param {Object} link 链接对象
 * @returns {number} 缓存时间（秒）
 */
const calculateCacheTime = (shortKey, link = null) => {
  const accessCount = getAccessCount(shortKey)

  // 基于访问频率的缓存策略
  if (accessCount > 10000) {
    return 86400 * 7 // 访问超过10000次，缓存7天
  } else if (accessCount > 1000) {
    return 86400 // 访问超过1000次，缓存1天
  } else if (accessCount > 100) {
    return 3600 * 12 // 访问超过100次，缓存12小时
  } else if (accessCount > 10) {
    return 3600 * 6 // 访问超过10次，缓存6小时
  }

  // 默认缓存时间
  return DEFAULT_CACHE_TIME
}

module.exports = {
  incrementAccessCount,
  getAccessCount,
  calculateCacheTime,
}
