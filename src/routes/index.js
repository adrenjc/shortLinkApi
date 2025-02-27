const express = require("express")
const { auth } = require("../middleware/auth")
const { register, login, getUser } = require("../controllers/auth")
const {
  createShortLink,
  getLinks,
  // updateLink,
  deleteLink,
  redirectToLongLink,
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
} = require("../controllers/domain")

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

router.route("/links/:id").delete(deleteLink)

router.get("/chats", getChats)
router.get("/chats/:chatId", getChatHistory)
router.delete("/chats/:chatId", deleteChat)
router.post("/chat", streamChat)

// 仅限管理员访问的路由
router.get("/users", getAllUsers)
router.put("/users/:id", updateUser)

// 域名管理路由
router.post("/domains", addDomain)
router.post("/domains/:domain/verify", verifyDomain)
router.get("/domains", getDomains)
router.delete("/domains/:domain", deleteDomain)

module.exports = router
