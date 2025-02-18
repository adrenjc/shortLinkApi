const { OpenAI } = require("openai")
const rateLimit = require("express-rate-limit")
const { validateMessages } = require("../utils/validators")
const Chat = require("../models/Chat")

// 创建速率限制器
const chatLimiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW * 60 * 1000, // 15分钟
  max: process.env.RATE_LIMIT_MAX_REQUESTS, // 限制请求次数
  message: {
    success: false,
    message: "请求过于频繁,请稍后再试",
  },
})

const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
})

// 获取用户的所有对话
const getChats = async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id })
      .select("title createdAt updatedAt")
      .sort({ updatedAt: -1 })

    res.json({
      success: true,
      data: chats,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取对话列表失败",
      error: error.message,
    })
  }
}

// 获取特定对话的历史记录
const getChatHistory = async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      userId: req.user.id,
    })

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "对话不存在",
      })
    }

    res.json({
      success: true,
      data: chat,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取对话历史失败",
      error: error.message,
    })
  }
}

// 清除特定对话
const deleteChat = async (req, res) => {
  try {
    const result = await Chat.findOneAndDelete({
      _id: req.params.chatId,
      userId: req.user.id,
    })

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "对话不存在",
      })
    }

    res.json({
      success: true,
      message: "对话已删除",
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "删除对话失败",
      error: error.message,
    })
  }
}

// 修改 streamChat 函数
const streamChat = async (req, res) => {
  const { messages, chatId } = req.body
  console.log("收到请求体:", JSON.stringify({ messages, chatId }))

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-r1",
      messages,
      temperature: 0.7,
      stream: true,
    })

    // SSE 头部设置
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")

    let isFirstChunk = true
    let isReasoning = true
    let fullReasoningContent = ""
    let fullContent = ""

    // 错误处理
    req.on("close", () => {
      completion.controller.abort()
    })

    for await (const chunk of completion) {
      if (!chunk.choices?.length) continue

      const delta = chunk.choices[0].delta

      if (delta.reasoning_content) {
        fullReasoningContent += delta.reasoning_content
        const data = {
          content: "",
          reasoning: delta.reasoning_content,
          type: "reasoning",
          isFirstChunk,
        }
        res.write(`data: ${JSON.stringify(data)}\n\n`)
        isFirstChunk = false
      } else if (delta.content) {
        if (isReasoning) {
          isReasoning = false
          res.write(
            `data: ${JSON.stringify({
              type: "separator",
              content: "",
              reasoning: "",
              isFirstChunk: false,
            })}\n\n`
          )
        }

        fullContent += delta.content
        const data = {
          content: delta.content,
          reasoning: "",
          type: "content",
          isFirstChunk,
        }
        res.write(`data: ${JSON.stringify(data)}\n\n`)
        isFirstChunk = false
      }
    }

    // 保存对话历史
    const lastUserMessage = messages[messages.length - 1]
    const assistantMessage = {
      role: "assistant",
      content: fullContent,
      reasoning_content: fullReasoningContent,
    }

    if (chatId) {
      // 更新现有对话
      await Chat.findOneAndUpdate(
        { _id: chatId, userId: req.user.id },
        {
          $push: {
            messages: [lastUserMessage, assistantMessage],
          },
          $set: { updatedAt: new Date() },
        }
      )
    } else {
      // 创建新对话
      const newChat = new Chat({
        userId: req.user.id,
        title:
          lastUserMessage.content.length > 20
            ? lastUserMessage.content.slice(0, 20) + "..."
            : lastUserMessage.content,
        messages: [lastUserMessage, assistantMessage],
      })
      await newChat.save()
    }

    res.write("data: [DONE]\n\n")
    res.end()
  } catch (error) {
    console.error("Chat API Error:", error)
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
      error: error.message,
    })
  }
}

module.exports = {
  chatLimiter,
  streamChat,
  getChats,
  getChatHistory,
  deleteChat,
}
