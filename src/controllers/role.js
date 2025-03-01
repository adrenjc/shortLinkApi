const Role = require("../models/Role")
const { createAuditLog } = require("./auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")

// 创建角色
exports.createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body

    const role = new Role({
      name,
      description,
      permissions,
    })

    await role.save()

    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.ROLE_CREATE,
      resourceType: RESOURCE_TYPES.ROLE,
      resourceId: role._id,
      description: `创建角色: ${role.name}`,
      req,
    })

    res.json({
      success: true,
      data: role,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// 获取角色列表
exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.find()
      .populate("permissions")
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      data: roles,
      total: roles.length,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// 更新角色
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, permissions } = req.body

    const role = await Role.findByIdAndUpdate(
      id,
      { name, description, permissions, updatedAt: Date.now() },
      { new: true }
    ).populate("permissions")

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "角色不存在",
      })
    }

    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.ROLE_UPDATE,
      resourceType: RESOURCE_TYPES.ROLE,
      resourceId: role._id,
      description: `更新角色: ${name}`,
      req,
    })

    res.json({
      success: true,
      data: role,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// 删除角色
exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params

    const role = await Role.findById(id)
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "角色不存在",
      })
    }

    if (role.isSystem) {
      return res.status(400).json({
        success: false,
        message: "系统角色不能删除",
      })
    }

    await Role.deleteOne({ _id: id })

    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.ROLE_DELETE,
      resourceType: RESOURCE_TYPES.ROLE,
      resourceId: role._id,
      description: `删除角色: ${role.name}`,
      req,
    })

    res.json({
      success: true,
      message: "角色已删除",
    })
  } catch (error) {
    console.error("删除角色失败:", error)
    res.status(500).json({
      success: false,
      message: error.message || "删除角色失败",
    })
  }
}
