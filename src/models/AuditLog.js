const mongoose = require("mongoose")

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      "CREATE_LINK",
      "DELETE_LINK",
      "UPDATE_PASSWORD",
      "CREATE_DOMAIN",
      "DELETE_DOMAIN",
      "REGISTER",
      "LOGIN",
    ],
  },
  resourceType: {
    type: String,
    required: true,
    enum: ["LINK", "USER", "DOMAIN"],
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
  },
  description: {
    type: String,
    required: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ipAddress: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

// 创建复合索引以提高查询性能
auditLogSchema.index({ userId: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ resourceType: 1, createdAt: -1 })
auditLogSchema.index({ description: "text" })

module.exports = mongoose.model("AuditLog", auditLogSchema)
