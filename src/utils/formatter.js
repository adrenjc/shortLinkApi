/**
 * 格式化工具函数集合
 */

/**
 * 格式化IP地址
 * @param {string} ip - 原始IP地址
 * @returns {string} - 格式化后的IP地址
 */
const formatIpAddress = (ip) => {
  if (!ip) return "未知"

  // 处理IPv6本地回环地址
  if (ip === "::1") {
    return "本地访问 (127.0.0.1)"
  }

  // 处理IPv4映射到IPv6的情况
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7) // 移除::ffff:前缀
  }

  return ip
}

/**
 * 解析User-Agent字符串获取设备和浏览器信息
 * @param {string} ua - User-Agent字符串
 * @returns {string} - 格式化后的设备和浏览器信息
 */
const parseUserAgent = (ua) => {
  if (!ua) return "未知设备"

  // 提取浏览器类型
  let browser = "未知浏览器"
  if (ua.includes("Chrome") && !ua.includes("Edg")) {
    browser = "Chrome"
  } else if (ua.includes("Firefox")) {
    browser = "Firefox"
  } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
    browser = "Safari"
  } else if (ua.includes("Edg")) {
    browser = "Edge"
  } else if (ua.includes("MSIE") || ua.includes("Trident")) {
    browser = "Internet Explorer"
  }

  // 提取设备/操作系统
  let os = "未知系统"
  if (ua.includes("Windows")) {
    os = "Windows"
  } else if (ua.includes("Macintosh") || ua.includes("Mac OS")) {
    os = "MacOS"
  } else if (ua.includes("Android")) {
    os = "Android"
  } else if (
    ua.includes("iPhone") ||
    ua.includes("iPad") ||
    ua.includes("iOS")
  ) {
    os = "iOS"
  } else if (ua.includes("Linux")) {
    os = "Linux"
  }

  // 判断是否为移动设备
  const isMobile =
    ua.includes("Mobile") ||
    ua.includes("Android") ||
    ua.includes("iPhone") ||
    ua.includes("iPad")

  return `${os} / ${browser}${isMobile ? " (移动设备)" : ""}`
}

/**
 * 处理引用来源，使其更易读
 * @param {string} referer - 原始引用来源
 * @returns {string} - 格式化后的引用来源
 */
const formatReferer = (referer) => {
  if (!referer || referer === "direct") {
    return "直接访问"
  }

  try {
    // 尝试解析URL以获取域名部分
    const url = new URL(referer)
    return url.hostname || referer
  } catch (e) {
    return referer
  }
}

module.exports = {
  formatIpAddress,
  parseUserAgent,
  formatReferer,
}
