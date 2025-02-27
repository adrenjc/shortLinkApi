const User = require("../models/User")

// 获取所有用户
exports.getAllUsers = async (req, res) => {
  try {
    // 从查询参数中获取分页信息，设置默认值
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 10

    // 计算跳过的文档数量
    const skip = (page - 1) * pageSize

    // 使用Promise.all并行执行查询
    const [users, total] = await Promise.all([
      User.find()
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      User.countDocuments(),
    ])

    // 返回标准化的响应格式
    res.json({
      success: true,
      data: users,
      total,
      page,
      pageSize,
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
  const { username, password } = req.body

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

    await user.save()
    res.json({ success: true, data: user })
  } catch (error) {
    console.error("更新用户信息失败:", error)
    res.status(500).json({ success: false, message: "服务器错误" })
  }
}
