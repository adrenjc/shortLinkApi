const User = require("../models/User")
const { createAuditLog } = require("./auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")

// 获取所有用户
exports.getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      username,
      email,
      status,
      nickname,
    } = req.query
    const skip = (page - 1) * pageSize

    // 构建查询条件
    const query = {}

    // 支持模糊搜索
    if (username) {
      query.username = { $regex: username, $options: "i" }
    }
    if (email) {
      query.email = { $regex: email, $options: "i" }
    }
    if (nickname) {
      query.nickname = { $regex: nickname, $options: "i" }
    }
    if (status !== undefined && status !== "") {
      query.status = parseInt(status)
    }

    // 使用 Promise.all 并行执行查询
    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .populate({
          path: "roles",
          select: "name", // 只返回角色名称
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(pageSize)),
      User.countDocuments(query),
    ])

    res.json({
      success: true,
      data: users,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    })
  } catch (error) {
    console.error("获取用户列表失败:", error)
    res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message,
    })
  }
}

// 更新用户信息
exports.updateUser = async (req, res) => {
  const { id } = req.params
  const { username, password, roles } = req.body

  try {
    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ success: false, message: "用户不存在" })
    }

    // 更新用户名
    if (username) {
      user.username = username
    }

    // 更新密码
    if (password) {
      user.password = password // 密码会在保存时自动加密
    }

    // 更新角色
    if (roles) {
      user.roles = roles
    }

    // 记录更新时间
    user.updatedAt = Date.now()

    await user.save()

    // 创建审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.USER_UPDATE,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: user._id,
      description: `更新用户: ${user.username}`,
      req,
    })

    // 返回时排除密码字段
    const userResponse = user.toObject()
    delete userResponse.password

    res.json({
      success: true,
      data: userResponse,
      message: "用户信息更新成功",
    })
  } catch (error) {
    console.error("更新用户信息失败:", error)
    res.status(500).json({
      success: false,
      message: error.message || "更新用户信息失败",
    })
  }
}
