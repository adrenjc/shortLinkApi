const mongoose = require("mongoose")
const { ACTION_TYPES } = require("../constants/auditLogTypes")

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  action: {
    type: String,
    required: true,
    enum: Object.values(ACTION_TYPES),
  },
  resourceType: {
    type: String,
    required: true,
    enum: ["LINK", "USER", "DOMAIN", "ROLE", "PERMISSION"],
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
  status: {
    type: String,
    enum: ["SUCCESS", "FAILURE"],
    default: "SUCCESS",
  },
  errorMessage: String,
  deviceInfo: {
    browser: String,
    os: String,
    device: String,
  },
})

// 创建复合索引以提高查询性能
auditLogSchema.index({ userId: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ resourceType: 1, createdAt: -1 })
auditLogSchema.index({ description: "text" })

module.exports = mongoose.model("AuditLog", auditLogSchema)
