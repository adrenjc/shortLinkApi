const User = require("../models/User")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const { createAuditLog } = require("./auditLog")

// 用户注册
exports.register = async (req, res) => {
  try {
    const { username, password, email, nickname } = req.body

    // 检查用户名是否存在
    let user = await User.findOne({ username })
    if (user) {
      return res.status(400).json({ success: false, message: "用户已经存在" })
    }

    // 创建新用户，只传入必需字段和已提供的可选字段
    const userData = {
      username,
      password,
      ...(email && { email }), // 只有当 email 存在时才添加
      ...(nickname && { nickname }), // 只有当 nickname 存在时才添加
    }

    user = new User(userData)
    await user.save()

    // 添加审计日志
    await createAuditLog({
      userId: user.id,
      action: "REGISTER",
      resourceType: "USER",
      resourceId: user.id,
      description: `新用户注册: ${user.username}`,
      req,
    })

    // 生成JWT令牌
    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    })

    res.json({
      success: true,
      token,
      message: "注册成功",
    })
  } catch (err) {
    console.error(err.message)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

// 用户登录
exports.login = async (req, res) => {
  const { username, password } = req.body

  try {
    // 查找用户并填充角色信息
    const user = await User.findOne({ username })
      .populate({
        path: "roles",
        populate: {
          path: "permissions", // 同时填充角色中的权限信息
          model: "Permission",
        },
      })
      .populate("permissions") // 直接分配给用户的权限

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "用户名或密码错误",
      })
    }

    // 验证密码
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "用户名或密码错误",
      })
    }

    // 更新登录信息
    user.lastLoginTime = new Date()
    user.lastLoginIp = req.ip
    user.loginCount += 1
    await user.save()

    // 添加审计日志
    await createAuditLog({
      userId: user.id,
      action: "LOGIN",
      resourceType: "USER",
      resourceId: user.id,
      description: `用户登录: ${user.username}`,
      req,
    })

    // 生成 token
    const token = jwt.sign(
      {
        user: {
          id: user._id,
        },
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "24h" }
    )

    // 返回用户信息时排除敏感字段
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
      description: user.description,
      roles: user.roles, // 包含完整的角色信息
      permissions: user.permissions, // 直接分配给用户的权限
      status: user.status,
      lastLoginTime: user.lastLoginTime,
      createdAt: user.createdAt,
    }

    res.json({
      success: true,
      message: "登录成功",
      token,
      user: userResponse,
    })
  } catch (error) {
    console.error("登录失败:", error)
    res.status(500).json({
      success: false,
      message: "服务器错误",
    })
  }
}

exports.getUser = async (req, res) => {
  try {
    // 从请求头中获取令牌
    const token = req.header("x-auth-token")

    // 检查是否没有令牌
    if (!token) {
      return res.status(401).json({ success: false, message: "token失效" })
    }

    // 验证令牌
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const userId = decoded.user.id

    // 查找用户并填充角色和权限信息
    const user = await User.findById(userId)
      .select("-password")
      .populate({
        path: "roles",
        populate: {
          path: "permissions",
          model: "Permission",
        },
      })
      .populate("permissions")

    if (!user) {
      return res.status(404).json({ success: false, message: "用户不存在" })
    }

    // 构造完整的用户响应
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
      description: user.description,
      roles: user.roles, // 包含完整的角色信息
      permissions: user.permissions, // 直接分配给用户的权限
      status: user.status,
      lastLoginTime: user.lastLoginTime,
      lastLoginIp: user.lastLoginIp,
      loginCount: user.loginCount,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isSystem: user.isSystem,
    }

    res.json({
      success: true,
      data: userResponse,
    })
  } catch (err) {
    console.error("获取用户信息失败:", err)
    res.status(500).json({
      success: false,
      message: err.message || "服务器错误",
    })
  }
}
