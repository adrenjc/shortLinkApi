const User = require("../models/User")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const { createAuditLog } = require("./auditLog")
const Role = require("../models/Role")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")

// 用户注册
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body

    // 检查用户名是否存在
    let user = await User.findOne({ username })
    if (user) {
      return res.status(400).json({ success: false, message: "用户已经存在" })
    }

    // 获取普通用户角色
    const normalRole = await Role.findOne({ name: "普通用户" })
    if (!normalRole) {
      return res
        .status(500)
        .json({ success: false, message: "系统错误：未找到默认角色" })
    }

    // 创建新用户
    user = new User({
      username,
      password,
      roles: [normalRole._id], // 分配普通用户角色
    })
    await user.save()

    // 添加审计日志
    await createAuditLog({
      userId: user.id,
      action: ACTION_TYPES.REGISTER,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: user._id,
      description: `新用户注册: ${user.username}`,
      req,
    })

    // 生成 JWT 令牌
    const token = jwt.sign(
      {
        user: {
          id: user._id,
        },
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "24h" }
    )

    // 返回用户信息和令牌
    res.json({
      success: true,
      message: "注册成功",
      token,
      user: {
        id: user._id,
        username: user.username,
        roles: [normalRole],
      },
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
      action: ACTION_TYPES.LOGIN,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: user._id,
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
    const token = req.header("x-auth-token")

    if (!token) {
      return res.status(401).json({ success: false, message: "token失效" })
    }

    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (jwtError) {
      console.error("JWT验证错误:", jwtError.name, jwtError.message)
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "登录已过期，请重新登录",
        })
      }
      return res.status(401).json({
        success: false,
        message: "无效的登录凭证",
      })
    }

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

    const userResponse = {
      id: user._id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      roles: user.roles,
      permissions: user.permissions,
      status: user.status,
      lastLoginTime: user.lastLoginTime,
      lastLoginIp: user.lastLoginIp,
      description: user.description,
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
