const User = require("../models/User")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")

// 用户注册
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body

    // 检查用户名是否存在
    let user = await User.findOne({ username })
    if (user) {
      return res.status(400).json({ success: false, message: "用户已经存在" })
    }

    // 创建新用户
    user = new User({ username, password })
    await user.save()

    // 生成JWT令牌
    const payload = { user: { id: user.id } }
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    })

    res.json({ token })
  } catch (err) {
    console.error(err.message)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

// 用户登录
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body

    // 验证用户
    const user = await User.findOne({ username })
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "用户名或密码错误",
      })
    }

    // 验证密码
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "用户名或密码错误",
      })
    }

    // 生成JWT令牌
    const payload = { user: { id: user.id } }
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    })

    // 返回用户信息和令牌
    res.json({
      token,
      success: true,
      user: {
        id: user.id,
        username: user.username,
      },
    })
  } catch (err) {
    console.error(err.message)
    res.status(500).send({ success: false, message: "服务器错误" })
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

    // 查找用户
    const user = await User.findById(userId).select("-password")
    if (!user) {
      return res.status(404).json({ success: false, message: "用户不存在" })
    }

    res.json({
      success: true,
      data: {
        name: user.username,
        userId: user.id,
      },
    })
  } catch (err) {
    console.error(err.message)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}
