const jwt = require("jsonwebtoken")

const auth = (req, res, next) => {
  const token = req.header("x-auth-token")
  if (!token) return res.status(401).json({ msg: "未授权访问" })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded.user
    next()
  } catch (err) {
    res.status(401).json({ msg: "令牌无效" })
  }
}

module.exports = { auth }
