require("dotenv").config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
})
const mongoose = require("mongoose")
const User = require("../src/models/User")
const Role = require("../src/models/Role")

const createSuperAdmin = async () => {
  try {
    console.log("开始创建超级管理员账户...")

    // 连接数据库
    await mongoose.connect(process.env.MONGO_URI)
    console.log("数据库连接成功")

    // 获取超级管理员角色
    const adminRole = await Role.findOne({ name: "超级管理员" })
    if (!adminRole) {
      throw new Error("超级管理员角色未找到，请先运行 seed.js 初始化基础数据")
    }

    // 设置超级管理员信息
    const superAdminData = {
      username: "superadmin", // 您可以根据需要修改用户名
      password: "123456", // 您可以根据需要修改密码
      nickname: "Super Admin",
      roles: [adminRole._id],
      isSystem: true,
      description: "系统超级管理员账户",
    }

    // 检查用户是否已存在
    let superAdmin = await User.findOne({ username: superAdminData.username })

    if (superAdmin) {
      console.log("超级管理员账户已存在，正在更新...")
      // 更新现有用户
      superAdmin.roles = superAdminData.roles
      superAdmin.isSystem = superAdminData.isSystem
      superAdmin.nickname = superAdminData.nickname
      superAdmin.description = superAdminData.description
      await superAdmin.save()
      console.log("超级管理员账户更新成功")
    } else {
      // 创建新用户
      superAdmin = new User(superAdminData)
      await superAdmin.save()
      console.log("超级管理员账户创建成功")
    }

    console.log("超级管理员账户信息：")
    console.log({
      用户名: superAdmin.username,
      昵称: superAdmin.nickname,
      角色: "超级管理员",
      创建时间: superAdmin.createdAt,
    })

    process.exit(0)
  } catch (error) {
    console.error("创建超级管理员失败:", error)
    process.exit(1)
  }
}

createSuperAdmin()
