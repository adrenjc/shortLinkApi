/**
 * 内存缓存模块 - 使用LRU策略
 * 用于短链接高性能缓存
 */

class LRUCache {
  constructor(capacity) {
    this.capacity = capacity
    this.cache = new Map()
    this.accessOrder = []
  }

  /**
   * 获取缓存项
   * @param {string} key 缓存键
   * @returns {string|null} 缓存值或null
   */
  get(key) {
    if (!this.cache.has(key)) {
      return null
    }

    // 更新访问顺序
    this.updateAccessOrder(key)

    return this.cache.get(key)
  }

  /**
   * 设置缓存项
   * @param {string} key 缓存键
   * @param {string} value 缓存值
   */
  set(key, value) {
    // 如果已存在，更新值和访问顺序
    if (this.cache.has(key)) {
      this.cache.set(key, value)
      this.updateAccessOrder(key)
      return
    }

    // 如果缓存已满，删除最久未使用的项
    if (this.cache.size >= this.capacity) {
      const leastUsedKey = this.accessOrder.shift()
      this.cache.delete(leastUsedKey)
    }

    // 添加新项
    this.cache.set(key, value)
    this.accessOrder.push(key)
  }

  /**
   * 更新访问顺序
   * @param {string} key 缓存键
   */
  updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    this.accessOrder.push(key)
  }

  /**
   * 获取缓存大小
   * @returns {number} 缓存项数量
   */
  size() {
    return this.cache.size
  }

  /**
   * 清除缓存
   */
  clear() {
    this.cache.clear()
    this.accessOrder = []
  }

  /**
   * 删除缓存项
   * @param {string} key 缓存键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    if (!this.cache.has(key)) {
      return false
    }

    this.cache.delete(key)
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    return true
  }
}

// 创建短链接缓存实例
// 默认缓存10000个短链接
const MEMORY_CACHE_CAPACITY = process.env.MEMORY_CACHE_CAPACITY || 10000
const shortLinkCache = new LRUCache(parseInt(MEMORY_CACHE_CAPACITY))

// 导出缓存实例
module.exports = {
  shortLinkCache,
  LRUCache,
}
