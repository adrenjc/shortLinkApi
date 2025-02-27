const AuditLog = require("../models/AuditLog")
const User = require("../models/User")

// 创建审计日志
const createAuditLog = async ({
  userId,
  action,
  resourceType,
  resourceId,
  description,
  metadata = {},
  req,
}) => {
  try {
    const auditLog = new AuditLog({
      userId,
      action,
      resourceType,
      resourceId,
      description,
      metadata,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })
    await auditLog.save()
  } catch (error) {
    console.error("审计日志创建失败:", error)
  }
}

// 获取审计日志列表
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      userId,
      action,
      startDate,
      endDate,
      resourceType,
      sort,
      order,
    } = req.query

    const query = {}

    // 构建查询条件
    if (userId) query.userId = userId
    if (action) query.action = action
    if (resourceType) query.resourceType = resourceType
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    // 构建排序条件
    let sortOptions = { createdAt: -1 } // 默认按创建时间降序
    if (sort === "createdAt" && order) {
      sortOptions = {
        createdAt: order === "ascend" ? 1 : -1,
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate("userId", "username nickname")
        .sort(sortOptions)
        .skip((page - 1) * pageSize)
        .limit(Number(pageSize)),
      AuditLog.countDocuments(query),
    ])

    res.json({
      success: true,
      data: logs,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    })
  } catch (error) {
    console.error("获取审计日志失败:", error)
    res.status(500).json({ success: false, message: "服务器错误" })
  }
}

// 获取审计日志统计信息
const getAuditLogStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const query = {}
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    const stats = await AuditLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            action: "$action",
            resourceType: "$resourceType",
          },
          count: { $sum: 1 },
        },
      },
    ])

    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error("获取审计日志统计失败:", error)
    res.status(500).json({ success: false, message: "服务器错误" })
  }
}

module.exports = {
  createAuditLog,
  getAuditLogs,
  getAuditLogStats,
}
