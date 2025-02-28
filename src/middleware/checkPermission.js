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

      // 获取用户所有权限
      const userPermissions = new Set()

      // 添加角色包含的权限
      user.roles.forEach((role) => {
        role.permissions.forEach((permission) => {
          userPermissions.add(permission.code)
        })
      })

      // 添加直接分配给用户的权限
      user.permissions.forEach((permission) => {
        userPermissions.add(permission.code)
      })

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
