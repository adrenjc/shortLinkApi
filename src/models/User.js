const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "用户名不能为空"],
      unique: true,
      trim: true,
      minlength: [3, "用户名至少3个字符"],
      maxlength: [20, "用户名最多20个字符"],
    },
    password: {
      type: String,
      required: [true, "密码不能为空"],
      minlength: [6, "密码至少6个字符"],
    },

    status: {
      type: Number,
      enum: [0, 1],
      default: 1,
    },
    roles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        required: true,
      },
    ],
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
        required: false,
      },
    ],
    lastLoginTime: {
      type: Date,
      default: null,
    },
    lastLoginIp: {
      type: String,
      default: null,
    },
    avatar: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    description: {
      type: String,
      maxlength: [200, "个人简介最多200个字符"],
      default: "",
    },
    loginCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

// 密码加密中间件
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
  }
  next()
})

// 更新时自动更新 updatedAt
userSchema.pre("findOneAndUpdate", function (next) {
  this._update.updatedAt = new Date()
  next()
})

// 验证密码的方法
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

// 创建虚拟字段 fullProfile
userSchema.virtual("fullProfile").get(function () {
  return {
    id: this._id,
    username: this.username,
    nickname: this.nickname,
    avatar: this.avatar,
    role: this.roles.map((role) => role.name),
    status: this.status,
    lastLoginTime: this.lastLoginTime,
    createdAt: this.createdAt,
  }
})

const User = mongoose.model("User", userSchema)

module.exports = User
