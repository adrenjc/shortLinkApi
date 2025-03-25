const express = require("express")
const { auth } = require("../middleware/auth")
const { register, login, getUser, deleteUser } = require("../controllers/auth")
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
  getAllUsersDomains,
  getDomainSSLStatus,
  renewSSLCertificate,
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
// 导入限流中间件
const {
  redirectLimiter,
  apiLimiter,
  loginLimiter,
} = require("../middleware/rateLimiter")

require("dotenv").config()
const router = express.Router()

// 认证路由
router.post("/register", register)
router.post("/login", loginLimiter, login)
// 应用短链接跳转限流
router.get("/r/:shortKey", redirectLimiter, redirectToLongLink)
router.get("/user", getUser)

// 受保护路由
router.use(auth)

// 应用API限流
router.use(apiLimiter)

router
  .route("/links")
  .post(checkPermission(PERMISSION_CODES.LINK_CREATE), createShortLink)
  .get(checkPermission(PERMISSION_CODES.LINK_VIEW), getLinks)

router
  .route("/links/:id")
  .put(checkPermission(PERMISSION_CODES.LINK_UPDATE), updateLink)
  .delete(checkPermission(PERMISSION_CODES.LINK_DELETE), deleteLink)

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
router.delete(
  "/users/:id",
  checkPermission(PERMISSION_CODES.USER_DELETE),
  deleteUser
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

// SSL 证书管理路由
router.get(
  "/domains/:domain/ssl",
  checkPermission(PERMISSION_CODES.DOMAIN_VIEW),
  getDomainSSLStatus
)
router.post(
  "/domains/:domain/ssl/renew",
  checkPermission(PERMISSION_CODES.DOMAIN_MANAGE),
  renewSSLCertificate
)

// 添加获取所有用户域名列表的路由
router.get(
  "/domains/all",
  checkPermission(PERMISSION_CODES.DOMAIN_VIEW),
  getAllUsersDomains
)

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
