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
const { PERMISSION_CODES } = require("../constants/permissions")

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
router.get("/users", checkPermission(PERMISSION_CODES.USER_VIEW), getAllUsers)
router.put(
  "/users/:id",
  checkPermission(PERMISSION_CODES.USER_UPDATE),
  updateUser
)

// 域名管理路由
router.post(
  "/domains",
  checkPermission(PERMISSION_CODES.DOMAIN_CREATE),
  addDomain
)
router.post(
  "/domains/:domain/verify",
  checkPermission(PERMISSION_CODES.DOMAIN_VERIFY),
  verifyDomain
)
router.get("/domains", getDomains)
router.delete(
  "/domains/:domain",
  checkPermission(PERMISSION_CODES.DOMAIN_DELETE),
  deleteDomain
)
router.post("/domains/:domain/recheck", recheckDomain)

// 审计日志路由 - 仅管理员可访问
router.get(
  "/audit-logs",
  checkPermission(PERMISSION_CODES.AUDIT_VIEW),
  getAuditLogs
)
router.get(
  "/audit-logs/stats",
  checkPermission(PERMISSION_CODES.AUDIT_VIEW),
  getAuditLogStats
)

// 角色管理路由
router.post("/roles", checkPermission(PERMISSION_CODES.ROLE_CREATE), createRole)
router.get("/roles", checkPermission(PERMISSION_CODES.ROLE_VIEW), getRoles)
router.put(
  "/roles/:id",
  checkPermission(PERMISSION_CODES.ROLE_UPDATE),
  updateRole
)
router.delete(
  "/roles/:id",
  checkPermission(PERMISSION_CODES.ROLE_DELETE),
  deleteRole
)

// 权限相关路由
router.get(
  "/permissions",
  checkPermission(PERMISSION_CODES.ROLE_VIEW),
  getPermissions
)

module.exports = router
