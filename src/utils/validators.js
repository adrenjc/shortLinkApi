const validateMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return "消息必须是数组格式"
  }

  if (messages.length === 0) {
    return "消息不能为空"
  }

  for (const message of messages) {
    if (!message.role || !message.content) {
      return "消息格式错误,必须包含 role 和 content 字段"
    }

    if (!["user", "assistant", "system"].includes(message.role)) {
      return "无效的消息角色"
    }

    if (typeof message.content !== "string") {
      return "消息内容必须是字符串"
    }
  }

  return null
}
module.exports = {
  validateMessages,
}
