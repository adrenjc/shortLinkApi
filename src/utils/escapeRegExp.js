/**
 * 转义正则表达式中的特殊字符
 * 防止正则表达式注入攻击
 * @param {string} string 需要转义的字符串
 * @returns {string} 转义后的安全字符串
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // $& 表示匹配到的子字符串
}

module.exports = {
  escapeRegExp,
}
