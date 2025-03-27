const Link = require("../models/Link")
const { createAuditLog } = require("./auditLog")
const { ACTION_TYPES, RESOURCE_TYPES } = require("../constants/auditLogTypes")
const { getAsync, setAsync, delAsync } = require("../config/redis")
const AuditLog = require("../models/AuditLog")
const {
  formatIpAddress,
  parseUserAgent,
  formatReferer,
} = require("../utils/formatter")
const { PERMISSION_CODES } = require("../constants/permissions")

const generateShortKey = (longUrl) => {
  // 使用时间戳和长链接生成短链接
  const timestamp = Date.now()
  return Buffer.from(`${longUrl}-${timestamp}`).toString("base64").slice(-6)
}

const createShortLink = async (req, res) => {
  const { longUrl, customDomain, customShortKey, remark } = req.body
  const isDev = process.env.NODE_ENV === "development"

  console.log("Received request body:", req.body)

  if (!longUrl) {
    return res.status(400).send({ success: false, message: "长链接不能为空" })
  }

  // 验证自定义短链key的格式
  if (
    customShortKey &&
    (customShortKey.length < 4 || customShortKey.length > 6)
  ) {
    return res
      .status(400)
      .send({ success: false, message: "自定义短链key长度必须在4-6位之间" })
  }

  // 验证备注字段长度
  if (remark && remark.length > 256) {
    return res
      .status(400)
      .send({ success: false, message: "备注长度不能超过256个字符" })
  }

  try {
    const shortKey = customShortKey || generateShortKey(longUrl)

    // 检查shortKey是否已存在
    const existingLink = await Link.findOne({ shortKey })
    if (existingLink) {
      return res.status(400).json({
        success: false,
        message: "该短链key已存在，请更换一个",
      })
    }

    // 获取当前域名，并去除 www 前缀
    const currentDomain = req.get("host").replace(/^www\./, "")

    // 开发环境下的处理
    if (isDev) {
      const baseUrl = `http://${currentDomain}/api`
      const newLink = new Link({
        longUrl,
        shortKey,
        customDomain: customDomain || null,
        shortUrl: `${baseUrl}/r/${shortKey}`,
        createdBy: req.user.id,
        domain: customDomain || currentDomain,
        remark: remark || "",
      })
      await newLink.save()

      // 添加审计日志
      await createAuditLog({
        userId: req.user.id,
        action: ACTION_TYPES.CREATE_LINK,
        resourceType: RESOURCE_TYPES.LINK,
        resourceId: newLink._id,
        description: `创建短链接: ${newLink.shortUrl}`,
        metadata: { longUrl: newLink.longUrl, remark: newLink.remark },
        req,
      })

      res.json(newLink)
      return
    }

    // 生产环境的处理
    let baseUrl

    // 检查是否是IP地址访问
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(currentDomain)

    if (customDomain) {
      // 如果有自定义域名，使用 https
      baseUrl = `https://${customDomain}`
    } else if (isIpAddress) {
      // 如果是IP地址访问，使用 http
      baseUrl = `http://${currentDomain}`
    } else {
      // 如果是域名访问，使用 https
      baseUrl = `https://${currentDomain}`
    }

    const newLink = new Link({
      longUrl,
      shortKey,
      customDomain: customDomain || null,
      shortUrl: `${baseUrl}/r/${shortKey}`,
      createdBy: req.user.id,
      domain: customDomain || currentDomain,
      remark: remark || "",
    })

    await newLink.save()

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.CREATE_LINK,
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: newLink._id,
      description: `创建短链接: ${newLink.shortUrl}`,
      metadata: { longUrl: newLink.longUrl, remark: newLink.remark },
      req,
    })

    res.json(newLink)
  } catch (error) {
    // 处理重复短链接的错误
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "该短链接已存在，请重试",
      })
    }
    console.error("创建短链接错误:", error)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

const redirectToLongLink = async (req, res) => {
  const { shortKey } = req.params

  try {
    // 检查是否是压力测试请求
    const isLoadTest = req.get("X-Load-Test") === "true"

    // 1. 尝试从 Redis 缓存中查询
    let cachedUrl = null
    try {
      cachedUrl = await getAsync(`shortlink:${shortKey}`)
    } catch (error) {
      console.error("Redis查询失败，降级到数据库查询:", error)
    }

    if (cachedUrl) {
      // 如果不是压力测试，则异步记录点击日志
      if (!isLoadTest) {
        // 先查找link记录
        const link = await Link.findOne({ shortKey })
        if (link) {
          process.nextTick(async () => {
            try {
              await createAuditLog({
                userId: link.createdBy || "system",
                action: ACTION_TYPES.CLICK_LINK,
                resourceType: RESOURCE_TYPES.LINK,
                resourceId: link._id,
                description: `访问短链接: ${link.shortUrl}`,
                metadata: {
                  longUrl: link.longUrl,
                  remark: link.remark,
                  referer: req.get("referer") || "direct",
                  userAgent: req.get("user-agent"),
                  ipAddress: req.ip,
                },
                req,
                status: "SUCCESS",
              })
            } catch (error) {
              console.error("记录审计日志失败:", error)
            }
          })
        }
      }
      return res.redirect(cachedUrl)
    }

    // 3. 缓存未命中或Redis不可用，查询数据库
    const link = await Link.findOne({ shortKey })

    if (!link) {
      return res.status(404).send({ success: false, message: "短链接未找到" })
    }

    // 4. 尝试写入Redis缓存
    try {
      await setAsync(`shortlink:${shortKey}`, link.longUrl, "EX", 3600)
    } catch (error) {
      console.error("Redis缓存写入失败:", error)
    }

    // 5. 如果不是压力测试，则记录审计日志
    if (!isLoadTest) {
      process.nextTick(async () => {
        try {
          await createAuditLog({
            userId: link.createdBy || "system",
            action: ACTION_TYPES.CLICK_LINK,
            resourceType: RESOURCE_TYPES.LINK,
            resourceId: link._id,
            description: `访问短链接: ${link.shortUrl}`,
            metadata: {
              longUrl: link.longUrl,
              remark: link.remark,
              referer: req.get("referer") || "direct",
              userAgent: req.get("user-agent"),
              ipAddress: req.ip,
            },
            req,
            status: "SUCCESS",
          })
        } catch (error) {
          console.error("记录审计日志失败:", error)
        }
      })
    }

    return res.redirect(link.longUrl)
  } catch (err) {
    console.error("重定向错误:", err)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

// 查询用户所有短链接
const getLinks = async (req, res) => {
  try {
    // 获取 ProTable 传递的分页参数
    const { current = 1, pageSize = 10, shortKey, longUrl, remark } = req.query
    const page = parseInt(current, 10)
    const limit = parseInt(pageSize, 10)
    const skip = (page - 1) * limit

    // 构建查询条件
    const query = { createdBy: req.user.id }

    if (shortKey) {
      query.shortKey = { $regex: shortKey, $options: "i" }
    }

    if (longUrl) {
      query.longUrl = { $regex: longUrl, $options: "i" }
    }

    if (remark) {
      query.remark = { $regex: remark, $options: "i" }
    }

    // 查询用户的短链接，并应用分页
    const [links, total] = await Promise.all([
      Link.find(query)
        .sort({ createdAt: -1 }) // 按创建时间降序排序
        .skip(skip)
        .limit(limit),
      Link.countDocuments(query),
    ])

    // 获取每个链接的点击次数和最近点击时间
    const linksWithClickInfo = await Promise.all(
      links.map(async (link) => {
        // 查询该链接的点击记录（审计日志中的CLICK_LINK记录）
        const clickLogs = await AuditLog.find({
          action: ACTION_TYPES.CLICK_LINK,
          resourceId: link._id,
        })
          .sort({ createdAt: -1 }) // 按时间倒序，最新的在前面
          .limit(10) // 只获取最近10条

        const clickCount = await AuditLog.countDocuments({
          action: ACTION_TYPES.CLICK_LINK,
          resourceId: link._id,
        })

        // 获取最近点击时间
        const lastClickTime =
          clickLogs.length > 0 ? clickLogs[0].createdAt : null

        // 转换为普通对象并添加点击信息
        const linkObj = link.toObject()
        return {
          ...linkObj,
          clickCount,
          lastClickTime,
          recentClicks: clickLogs.map((log) => ({
            time: log.createdAt,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
          })),
        }
      })
    )

    res.json({
      data: linksWithClickInfo,
      success: true,
      total,
    })
  } catch (err) {
    console.error("获取短链接错误:", err)
    res.status(500).send({
      success: false,
      message: "服务器错误",
    })
  }
}

// 查询所有用户的短链接（仅管理员）
const getAllLinks = async (req, res) => {
  try {
    // 获取 ProTable 传递的分页参数
    const {
      current = 1,
      pageSize = 10,
      createdBy,
      shortKey,
      longUrl,
      remark,
    } = req.query
    const page = parseInt(current, 10)
    const limit = parseInt(pageSize, 10)
    const skip = (page - 1) * limit

    // 构建查询条件
    const query = {}

    if (createdBy) {
      query.createdBy = createdBy
    }

    if (shortKey) {
      query.shortKey = { $regex: shortKey, $options: "i" }
    }

    if (longUrl) {
      query.longUrl = { $regex: longUrl, $options: "i" }
    }

    if (remark) {
      query.remark = { $regex: remark, $options: "i" }
    }

    // 获取所有短链接，并查询点击次数相关信息
    const [links, total] = await Promise.all([
      Link.find(query)
        .populate("createdBy", "username nickname email") // 关联查询创建者信息
        .sort({ createdAt: -1 }) // 按创建时间降序排序
        .skip(skip)
        .limit(limit),
      Link.countDocuments(query),
    ])

    // 获取每个链接的点击次数和最近点击时间
    const linksWithClickInfo = await Promise.all(
      links.map(async (link) => {
        // 查询该链接的点击记录（审计日志中的CLICK_LINK记录）
        const clickLogs = await AuditLog.find({
          action: ACTION_TYPES.CLICK_LINK,
          resourceId: link._id,
        })
          .sort({ createdAt: -1 }) // 按时间倒序，最新的在前面
          .limit(10) // 只获取最近10条

        const clickCount = await AuditLog.countDocuments({
          action: ACTION_TYPES.CLICK_LINK,
          resourceId: link._id,
        })

        // 获取最近点击时间
        const lastClickTime =
          clickLogs.length > 0 ? clickLogs[0].createdAt : null

        // 转换为普通对象并添加点击信息
        const linkObj = link.toObject()
        return {
          ...linkObj,
          clickCount,
          lastClickTime,
          recentClicks: clickLogs.map((log) => ({
            time: log.createdAt,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
          })),
        }
      })
    )

    res.json({
      data: linksWithClickInfo,
      success: true,
      total,
    })
  } catch (err) {
    console.error("获取所有短链接错误:", err)
    res.status(500).send({
      success: false,
      message: "服务器错误",
    })
  }
}

// 删除短链接
const deleteLink = async (req, res) => {
  const { id } = req.params

  try {
    // 先查找链接
    const link = await Link.findById(id)

    if (!link) {
      return res.status(404).json({ success: false, message: "链接未找到" })
    }

    // 检查权限 - 确保admin用户有权限
    // 如果用户是admin，直接允许访问，不需要其他检查
    if (req.user.username === "admin" || req.user.isAdmin) {
      console.log("管理员用户，允许删除短链接")
      // 管理员用户，直接删除
      await Link.findByIdAndDelete(id)
    } else {
      // 非管理员用户，检查是否是创建者或有删除所有权限
      const isOwner = link.createdBy.toString() === req.user.id
      const hasDeleteAllPermission =
        req.user.permissions?.includes(PERMISSION_CODES.LINK_MANAGE) ||
        req.user.roles?.some((role) =>
          role.permissions?.some(
            (perm) => perm.code === PERMISSION_CODES.LINK_MANAGE
          )
        )

      if (!isOwner && !hasDeleteAllPermission) {
        return res.status(403).json({
          success: false,
          message: "没有权限删除该短链接",
        })
      }

      // 有权限，执行删除
      await Link.findByIdAndDelete(id)
    }

    // 添加审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.DELETE_LINK,
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: link._id,
      description: `删除短链接: ${link.shortUrl}`,
      metadata: { longUrl: link.longUrl },
      req,
    })

    res.json({ success: true, message: "链接已删除" })
  } catch (err) {
    console.error("删除短链接错误:", err)
    res.status(500).send({ success: false, message: "服务器错误" })
  }
}

// 更新短链接
const updateLink = async (req, res) => {
  try {
    const { id } = req.params
    const { longUrl, customShortKey, remark, customDomain } = req.body

    // 查找短链接
    const link = await Link.findById(id)

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "短链接不存在",
      })
    }

    // 检查权限 - 确保admin用户有权限
    // 如果用户是admin，直接允许访问，不需要其他检查
    if (req.user.username === "admin" || req.user.isAdmin) {
      console.log("管理员用户，允许修改短链接")
      // 管理员用户，直接允许访问
    } else {
      // 非管理员用户，检查是否是创建者或有更新所有权限
      const isOwner = link.createdBy.toString() === req.user.id
      const hasUpdateAllPermission =
        req.user.permissions?.includes(PERMISSION_CODES.LINK_VIEW_ALL) ||
        req.user.roles?.some((role) =>
          role.permissions?.some(
            (perm) => perm.code === PERMISSION_CODES.LINK_VIEW_ALL
          )
        )

      if (!isOwner && !hasUpdateAllPermission) {
        return res.status(403).json({
          success: false,
          message: "没有权限修改该短链接",
        })
      }
    }

    // 保存修改前的数据，用于审计日志
    const oldLongUrl = link.longUrl
    const oldRemark = link.remark
    const oldCustomShortKey = link.shortKey
    const oldCustomDomain = link.customDomain

    // 检查shortKey是否有变化，如果有变化，则检查是否已存在
    if (customShortKey && customShortKey !== link.shortKey) {
      const existingLink = await Link.findOne({
        shortKey: customShortKey,
        customDomain: customDomain || link.customDomain,
        _id: { $ne: id }, // 排除当前链接
      })

      if (existingLink) {
        return res.status(400).json({
          success: false,
          message: "该短链key已存在，请更换一个",
        })
      }

      // 更新shortKey和shortUrl
      link.shortKey = customShortKey
    }

    // 更新其他字段
    if (longUrl) {
      link.longUrl = longUrl
    }

    if (remark !== undefined) {
      link.remark = remark
    }
    if (customDomain !== undefined) {
      link.customDomain = customDomain || null
      link.domain = customDomain || req.get("host").replace(/^www\./, "")
    }

    // 重新构建shortUrl
    const currentDomain =
      link.customDomain || req.get("host").replace(/^www\./, "")
    const isDev = process.env.NODE_ENV === "development"
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(currentDomain)

    let baseUrl
    if (link.customDomain) {
      // 如果有自定义域名，使用 https
      baseUrl = `https://${link.customDomain}`
    } else if (isDev) {
      // 开发环境且没有自定义域名时，使用 /api 路径
      baseUrl = `http://${currentDomain}/api`
    } else if (isIpAddress) {
      // 如果是IP地址访问，使用 http
      baseUrl = `http://${currentDomain}`
    } else {
      // 如果是域名访问，使用 https
      baseUrl = `https://${currentDomain}`
    }
    link.shortUrl = `${baseUrl}/r/${link.shortKey}`

    await link.save()

    // 添加详细的审计日志
    await createAuditLog({
      userId: req.user.id,
      action: ACTION_TYPES.UPDATE_LINK,
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: link._id,
      description: `更新短链接: ${link.shortUrl}`,
      metadata: {
        longUrl,
        oldLongUrl,
        remark,
        oldRemark,
        customShortKey,
        oldCustomShortKey,
        customDomain,
        oldCustomDomain,
      },
      req,
    })

    res.json({
      success: true,
      data: link,
      message: "短链接更新成功",
    })
  } catch (error) {
    console.error("更新短链接错误:", error)
    res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message,
    })
  }
}

// 获取特定短链接的点击记录
const getLinkClickRecords = async (req, res) => {
  try {
    const { id } = req.params
    const { current = 1, pageSize = 10, startDate, endDate } = req.query

    // 验证短链接是否存在，并确保用户有权限访问
    const link = await Link.findById(id)

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "短链接不存在",
      })
    }

    // 检查用户是否有权限 - 简化逻辑并确保admin用户有权限
    // 如果用户是admin，直接允许访问，不需要其他检查
    if (req.user.username === "admin" || req.user.isAdmin) {
      console.log("管理员用户，允许访问点击记录")
      // 管理员用户，直接允许访问
    } else {
      // 非管理员用户，检查是否是创建者或有查看所有权限
      const isOwner = link.createdBy.toString() === req.user.id
      const hasViewAllPermission =
        req.user.permissions?.includes(PERMISSION_CODES.LINK_VIEW_ALL) ||
        req.user.roles?.some((role) =>
          role.permissions?.some(
            (perm) => perm.code === PERMISSION_CODES.LINK_VIEW_ALL
          )
        )

      // 如果既不是链接创建者，也没有查看所有权限，则拒绝访问
      if (!isOwner && !hasViewAllPermission) {
        return res.status(403).json({
          success: false,
          message: "没有权限查看该短链接的点击记录",
        })
      }
    }

    // 构建查询条件
    const query = {
      action: ACTION_TYPES.CLICK_LINK,
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: id,
    }

    // 添加日期范围过滤
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        // 设置开始日期为当天的 00:00:00
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        query.createdAt.$gte = start
      }
      if (endDate) {
        // 设置结束日期为当天的 23:59:59
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        query.createdAt.$lte = end
      }
    }

    // 分页设置
    const skip = (parseInt(current) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    // 使用Promise.all并行执行查询以提高性能
    const [clickRecords, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 }) // 按创建时间降序排序
        .skip(skip)
        .limit(limit)
        .lean(), // 使用lean()优化性能
      AuditLog.countDocuments(query),
    ])

    // 转换记录为前端所需格式并优化信息展示
    const formattedRecords = clickRecords.map((record) => ({
      time: record.createdAt,
      ipAddress: formatIpAddress(record.ipAddress),
      userAgent: parseUserAgent(record.userAgent),
      referrer: record.metadata?.referer || "direct",
      // 处理引用来源，使其更易读
      referrerDisplay: formatReferer(record.metadata?.referer),
    }))

    res.json({
      success: true,
      data: formattedRecords,
      total,
      current: parseInt(current),
      pageSize: parseInt(pageSize),
    })
  } catch (error) {
    console.error("获取点击记录错误:", error)
    res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message,
    })
  }
}

// 获取短链接的历史记录（创建和修改记录）
const getLinkHistory = async (req, res) => {
  try {
    const { id } = req.params

    // 1. 验证短链接是否存在
    const link = await Link.findById(id).populate(
      "createdBy",
      "username nickname email"
    )

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "短链接不存在",
      })
    }

    // 2. 检查用户权限 - 简化逻辑并确保admin用户有权限
    // 如果用户是admin，直接允许访问，不需要其他检查
    if (req.user.username === "admin" || req.user.isAdmin) {
      console.log("管理员用户，允许访问")
      // 管理员用户，直接允许访问
    } else {
      // 非管理员用户，检查是否是创建者或有查看所有权限
      const isOwner = link.createdBy._id.toString() === req.user.id
      const hasViewAllPermission =
        req.user.permissions?.includes(PERMISSION_CODES.LINK_VIEW_ALL) ||
        req.user.roles?.some((role) =>
          role.permissions?.some(
            (perm) => perm.code === PERMISSION_CODES.LINK_VIEW_ALL
          )
        )

      console.log("是否创建者:", isOwner)
      console.log("是否有查看所有权限:", hasViewAllPermission)

      // 如果既不是链接创建者，也没有查看所有权限，则拒绝访问
      if (!isOwner && !hasViewAllPermission) {
        return res.status(403).json({
          success: false,
          message: "没有权限查看该短链接的历史记录",
        })
      }
    }

    // 3. 查询该短链接的所有审计日志
    const auditLogs = await AuditLog.find({
      resourceType: RESOURCE_TYPES.LINK,
      resourceId: id,
      action: { $in: [ACTION_TYPES.CREATE_LINK, ACTION_TYPES.UPDATE_LINK] },
    })
      .populate("userId", "username nickname email")
      .sort({ createdAt: -1 }) // 按时间从新到旧排序
      .lean()

    // 4. 转换数据为前端所需格式
    const historyRecords = auditLogs.map((log) => {
      // 从metadata中提取变更信息
      const changes = {}
      if (log.action === ACTION_TYPES.UPDATE_LINK && log.metadata) {
        // 如果是更新操作，记录变更的字段
        if (log.metadata.oldLongUrl !== log.metadata.longUrl) {
          changes.longUrl = {
            from: log.metadata.oldLongUrl,
            to: log.metadata.longUrl,
          }
        }

        if (log.metadata.oldRemark !== log.metadata.remark) {
          changes.remark = {
            from: log.metadata.oldRemark || "",
            to: log.metadata.remark || "",
          }
        }

        if (log.metadata.oldCustomShortKey !== log.metadata.customShortKey) {
          changes.customShortKey = {
            from: log.metadata.oldCustomShortKey,
            to: log.metadata.customShortKey,
          }
        }

        if (log.metadata.oldCustomDomain !== log.metadata.customDomain) {
          changes.customDomain = {
            from: log.metadata.oldCustomDomain || null,
            to: log.metadata.customDomain || null,
          }
        }
      }

      return {
        id: log._id,
        action: log.action === ACTION_TYPES.CREATE_LINK ? "创建" : "更新",
        userId: log.userId._id,
        username: log.userId.nickname || log.userId.username,
        email: log.userId.email,
        time: log.createdAt,
        description: log.description,
        changes: log.action === ACTION_TYPES.UPDATE_LINK ? changes : null,
        ipAddress: formatIpAddress(log.ipAddress),
        userAgent: parseUserAgent(log.userAgent),
      }
    })

    // 5. 构建完整的响应数据
    const responseData = {
      linkInfo: {
        id: link._id,
        shortUrl: link.shortUrl,
        longUrl: link.longUrl,
        shortKey: link.shortKey,
        customDomain: link.customDomain,
        remark: link.remark,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
        creator: {
          id: link.createdBy._id,
          username: link.createdBy.nickname || link.createdBy.username,
          email: link.createdBy.email,
        },
      },
      history: historyRecords,
    }

    res.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("获取短链接历史记录错误:", error)
    res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message,
    })
  }
}

module.exports = {
  createShortLink,
  getLinks,
  getAllLinks,
  redirectToLongLink,
  deleteLink,
  updateLink,
  getLinkClickRecords,
  getLinkHistory,
}
