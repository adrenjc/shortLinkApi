const User = require("../models/User")

const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id)
        .populate({
          path: "roles",
          populate: {
            path: "permissions",
          },
        })
        .populate("permissions")

      if (!user) {
        return res.status(404).json({ success: false, message: "用户不存在" })
      }

      // 特殊处理：管理员用户 (用户名为 'admin' 或者 拥有isSystem标志)
      if (user.username === "admin" || user.isSystem === true) {
        // 管理员用户拥有所有权限
        req.user.isAdmin = true
        req.user.username = user.username
        next()
        return
      }

      // 获取用户所有权限
      const userPermissions = new Set()

      // 添加角色包含的权限
      user.roles.forEach((role) => {
        // 如果用户的角色里有admin角色，也算作管理员
        if (role.name === "admin") {
          req.user.isAdmin = true
        }
        role.permissions.forEach((permission) => {
          userPermissions.add(permission.code)
        })
      })

      // 添加直接分配给用户的权限
      user.permissions.forEach((permission) => {
        userPermissions.add(permission.code)
      })

      // 保存用户名称和权限信息到请求对象中
      req.user.username = user.username
      req.user.permissions = Array.from(userPermissions)
      req.user.roles = user.roles

      // 如果是管理员角色，自动通过权限检查
      if (req.user.isAdmin) {
        next()
        return
      }

      if (!userPermissions.has(requiredPermission)) {
        return res.status(403).json({
          success: false,
          message: "没有权限执行此操作",
        })
      }

      next()
    } catch (error) {
      console.error("权限检查错误:", error)
      res.status(500).json({
        success: false,
        message: "服务器错误",
      })
    }
  }
}

module.exports = { checkPermission }
