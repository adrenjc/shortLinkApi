const Permission = require("../models/Permission")

// 获取所有权限列表
exports.getPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find().sort({ createdAt: -1 })

    res.json({
      success: true,
      data: permissions,
      total: permissions.length,
    })
  } catch (error) {
    console.error("获取权限列表失败:", error)
    res.status(500).json({
      success: false,
      message: error.message || "获取权限列表失败",
    })
  }
}
