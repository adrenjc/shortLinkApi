const express = require("express")
const { auth } = require("../middleware/auth")
const { register, login, getUser } = require("../controllers/auth")
const {
  createShortLink,
  getLinks,
  // updateLink,
  deleteLink,
  redirectToLongLink,
  updateLink,
} = require("../controllers/link")
const {
  streamChat,
  chatLimiter,
  getChats,
  getChatHistory,
  deleteChat,
} = require("../controllers/chat")
const { getAllUsers, updateUser } = require("../controllers/user")
const {
  addDomain,
  verifyDomain,
  getDomains,
  deleteDomain,
  recheckDomain,
} = require("../controllers/domain")
const { getAuditLogs, getAuditLogStats } = require("../controllers/auditLog")
const {
  createRole,
  getRoles,
  updateRole,
  deleteRole,
} = require("../controllers/role")
const { getPermissions } = require("../controllers/permission")
const { checkPermission } = require("../middleware/checkPermission")

require("dotenv").config()
const router = express.Router()

// 认证路由
router.post("/register", register)
router.post("/login", login)
router.get("/r/:shortKey", redirectToLongLink)
router.get("/user", getUser)

// 受保护路由
router.use(auth)

router.route("/links").post(createShortLink).get(getLinks)

router.route("/links/:id").put(updateLink).delete(deleteLink)

router.get("/chats", getChats)
router.get("/chats/:chatId", getChatHistory)
router.delete("/chats/:chatId", deleteChat)
router.post("/chat", streamChat)

// 仅限管理员访问的路由
router.get("/users", checkPermission("user:view"), getAllUsers)
router.put("/users/:id", checkPermission("user:update"), updateUser)

// 域名管理路由
router.post("/domains", addDomain)
router.post("/domains/:domain/verify", verifyDomain)
router.get("/domains", getDomains)
router.delete("/domains/:domain", deleteDomain)
router.post("/domains/:domain/recheck", recheckDomain)

// 审计日志路由 - 仅管理员可访问
router.get("/audit-logs", getAuditLogs)
router.get("/audit-logs/stats", getAuditLogStats)

// 角色管理路由
router.post("/roles", checkPermission("role:create"), createRole)
router.get("/roles", checkPermission("role:view"), getRoles)
router.put("/roles/:id", checkPermission("role:update"), updateRole)
router.delete("/roles/:id", checkPermission("role:delete"), deleteRole)

// 权限相关路由
router.get("/permissions", checkPermission("role:view"), getPermissions)

module.exports = router
