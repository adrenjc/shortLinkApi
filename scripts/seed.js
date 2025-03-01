require("dotenv").config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
})
const mongoose = require("mongoose")
const Permission = require("../src/models/Permission")
const Role = require("../src/models/Role")
const User = require("../src/models/User")
const {
  PERMISSIONS,
  PERMISSION_CODES,
} = require("../src/constants/permissions") // 导入权限配置

const initPermissions = async () => {
  console.log("开始初始化权限...")
  for (const permission of PERMISSIONS) {
    await Permission.findOneAndUpdate({ code: permission.code }, permission, {
      upsert: true,
      new: true,
    })
  }
  console.log("权限初始化完成")
}

const initRoles = async () => {
  const {
    LINK_CREATE,
    LINK_DELETE,
    LINK_MANAGE,
    LINK_UPDATE,
    LINK_VIEW,
    DOMAIN_VIEW,
  } = PERMISSION_CODES
  // 获取所有权限
  const permissions = await Permission.find()

  console.log("开始初始化角色...")
  // 创建超级管理员角色
  const adminRole = await Role.findOneAndUpdate(
    { name: "超级管理员" },
    {
      name: "超级管理员",
      description: "系统超级管理员",
      permissions: permissions.map((p) => p._id),
      isSystem: true,
    },
    { upsert: true, new: true }
  )

  // 创建普通用户角色
  await Role.findOneAndUpdate(
    { name: "普通用户" },
    {
      name: "普通用户",
      description: "普通用户",
      permissions: permissions
        .filter((p) =>
          [
            LINK_CREATE,
            LINK_DELETE,
            LINK_MANAGE,
            LINK_UPDATE,
            LINK_VIEW,
            DOMAIN_VIEW,
          ].includes(p.code)
        )
        .map((p) => p._id),
      isSystem: true,
    },
    { upsert: true, new: true }
  )
  console.log("角色初始化完成")

  return adminRole
}

const initUsers = async (adminRole, normalRole) => {
  console.log("开始初始化用户...")
  try {
    // 查找 admin 用户
    let adminUser = await User.findOne({ username: "admin" })

    if (adminUser) {
      console.log("检测到已存在 admin 用户，正在更新...")
      // 更新 admin 用户信息
      adminUser.roles = [adminRole._id]
      adminUser.isSystem = true
      await adminUser.save()
      console.log("admin 用户更新完成")
    } else {
      console.log("未检测到 admin 用户，正在创建...")
      // 创建新的 admin 用户
      adminUser = new User({
        username: "admin",
        password: "123456",
        roles: [adminRole._id],
        isSystem: true,
        nickname: "admin",
      })
      await adminUser.save()
      console.log("admin 用户创建完成")
    }

    // 为其他所有用户分配普通用户角色
    console.log("开始更新其他用户角色...")
    const result = await User.updateMany(
      {
        username: { $ne: "admin" }, // 排除 admin 用户
        $or: [
          { roles: { $exists: false } }, // 没有 roles 字段
          { roles: { $eq: [] } }, // roles 为空数组
          { roles: null }, // roles 为 null
        ],
      },
      {
        $set: { roles: [normalRole._id] },
      }
    )
    console.log(`已更新 ${result.modifiedCount} 个普通用户的角色`)

    // 显示更新详情
    const totalUsers = await User.countDocuments()
    const usersWithRoles = await User.countDocuments({
      roles: { $exists: true, $ne: [] },
    })
    console.log(`
用户统计信息：
- 总用户数：${totalUsers}
- 已分配角色用户数：${usersWithRoles}
- 未分配角色用户数：${totalUsers - usersWithRoles}
    `)
  } catch (error) {
    console.error("初始化用户失败:", error)
    throw error
  }
}

const seed = async () => {
  try {
    console.log(`正在初始化 ${process.env.NODE_ENV} 环境的数据...`)
    await mongoose.connect(process.env.MONGO_URI)
    console.log("数据库连接成功")

    await initPermissions()
    const adminRole = await initRoles()
    // 获取普通用户角色
    const normalRole = await Role.findOne({ name: "普通用户" })
    if (!normalRole) {
      throw new Error("普通用户角色未找到")
    }
    await initUsers(adminRole, normalRole)

    console.log("所有数据初始化完成")
    process.exit(0)
  } catch (error) {
    console.error("数据初始化失败:", error)
    process.exit(1)
  }
}

seed()
