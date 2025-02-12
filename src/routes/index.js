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

module.exports = router
