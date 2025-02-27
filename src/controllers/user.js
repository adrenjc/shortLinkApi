const User = require("../models/User")

// 获取所有用户
exports.getAllUsers = async (req, res) => {
  const { page = 1, pageSize = 10 } = req.query // 获取分页参数
  try {
    const users = await User.find()
      .select("-password") // 不返回密码
      .skip((page - 1) * pageSize) // 跳过前面的数据
      .limit(Number(pageSize)) // 限制返回的数据条数
    const total = await User.countDocuments() // 获取用户总数
    res.json({
      success: true,
      data: users,
      total: total, // 返回总数
    })
  } catch (error) {
    console.error("获取用户列表失败:", error)
    res.status(500).json({ success: false, message: "服务器错误" })
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
