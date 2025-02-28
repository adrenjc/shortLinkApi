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
  status = "SUCCESS",
  errorMessage = null,
  session = null,
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
      status,
      errorMessage,
      deviceInfo: {
        browser: req.get("user-agent"),
        os: req.get("user-agent"),
        device: req.get("user-agent"),
      },
    })

    if (session) {
      await auditLog.save({ session })
    } else {
      await auditLog.save()
    }
  } catch (error) {
    console.error("审计日志创建失败:", error)
  }
}

// 获取审计日志列表
const getAuditLogs = async (req, res) => {
  try {
    const {
      current = 1,
      pageSize = 10,
      userId,
      action,
      startDate,
      endDate,
      resourceType,
      description,
      status,
      sort = "createdAt",
      order = "descend",
    } = req.query

    const query = {}

    // 构建查询条件
    if (userId) {
      // 支持用户名模糊搜索
      const users = await User.find({
        username: { $regex: userId, $options: "i" },
      }).select("_id")
      query.userId = { $in: users.map((user) => user._id) }
    }

    if (action) {
      query.action = action
    }

    if (resourceType) {
      query.resourceType = resourceType
    }

    if (description) {
      query.description = { $regex: description, $options: "i" }
    }

    // 添加状态查询条件
    if (status) {
      query.status = status
    }

    // 处理日期范围查询
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        // 设置开始日期为当天的 00:00:00
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        query.createdAt.$gte = start
      }
      if (endDate) {
        // 设置结束日期为当天的 23:59:59
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        query.createdAt.$lte = end
      }
    }

    // 构建排序条件
    const sortOptions = {
      [sort]: order === "ascend" ? 1 : -1,
    }

    const skip = (parseInt(current) - 1) * parseInt(pageSize)

    // 使用 Promise.all 并行执行查询
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate("userId", "username nickname")
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(pageSize)),
      AuditLog.countDocuments(query),
    ])

    res.json({
      success: true,
      data: logs,
      total,
      page: parseInt(current),
      pageSize: parseInt(pageSize),
    })
  } catch (error) {
    console.error("获取审计日志失败:", error)
    res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message,
    })
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
