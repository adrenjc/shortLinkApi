const mongoose = require("mongoose")

const linkSchema = new mongoose.Schema(
  {
    longUrl: { type: String, required: true },
    shortKey: { type: String, required: true },
    shortUrl: { type: String, required: true },
    customDomain: {
      type: String,
      default: null, // 如果不设置，则使用默认域名
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
  },
  { timestamps: true } // 启用时间戳
)

// 创建复合唯一索引，确保同一用户下的短链接不重复
linkSchema.index({ shortKey: 1, customDomain: 1 }, { unique: true })

// 添加必要的索引
linkSchema.index({ createdBy: 1 })
linkSchema.index({ createdAt: -1 })

const Link = mongoose.model("Link", linkSchema)

module.exports = Link
