const mongoose = require("mongoose")

const linkSchema = new mongoose.Schema(
  {
    longUrl: { type: String, required: true },
    shortKey: { type: String, required: true },
    shortUrl: { type: String, required: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
  },
  { timestamps: true } // 启用时间戳
)

// 创建复合唯一索引
linkSchema.index({ shortKey: 1, createdBy: 1 }, { unique: true })

const Link = mongoose.model("Link", linkSchema)

module.exports = Link
