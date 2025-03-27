/**
 * MongoDB 数据库备份脚本
 *
 * 此脚本用于:
 * 1. 创建MongoDB数据库的完整备份
 * 2. 保存备份到指定目录
 * 3. 自动删除过期备份
 *
 * 使用方法:
 * - 手动执行: node scripts/database-backup.js
 * - 通过npm脚本: npm run backup
 * - 定时任务: 配置cron job
 */

require("dotenv").config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
})
const { exec } = require("child_process")
const fs = require("fs")
const path = require("path")
const winston = require("winston")

// 配置参数
const BACKUP_DIR = process.env.BACKUP_DIR || "./backups"
const DB_NAME = "shortlink" // 从MongoDB连接字符串中提取
const BACKUP_RETENTION_DAYS = process.env.BACKUP_RETENTION_DAYS || 7 // 保留备份的天数

// 配置日志
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(BACKUP_DIR, "backup.log"),
    }),
  ],
})

// 确保备份目录存在
function ensureBackupDirExists() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    logger.info(`创建备份目录: ${BACKUP_DIR}`)
  }
}

// 获取数据库连接信息
function getDatabaseUrl() {
  const mongoUri = process.env.MONGO_URI
  if (!mongoUri) {
    throw new Error("未找到MONGO_URI环境变量")
  }
  return mongoUri
}

// 创建备份
function createBackup() {
  ensureBackupDirExists()

  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "")
  const backupFileName = `${DB_NAME}_${timestamp}.gz`
  const backupFilePath = path.join(BACKUP_DIR, backupFileName)

  const mongoUri = getDatabaseUrl()

  // 使用mongodump创建备份，确保路径使用正确的格式
  const backupCommand = `mongodump --uri="${mongoUri}" --gzip --archive="${backupFilePath}"`

  logger.info(`开始备份数据库 ${DB_NAME}`)

  return new Promise((resolve, reject) => {
    exec(backupCommand, (error, stdout, stderr) => {
      if (error) {
        logger.error(`备份失败: ${error.message}`)
        reject(error)
        return
      }

      if (stderr) {
        logger.warn(`备份警告: ${stderr}`)
      }

      logger.info(`备份完成: ${backupFilePath}`)
      resolve(backupFilePath)
    })
  })
}

// 删除过期备份
function removeOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
  const now = new Date()

  let deletedCount = 0

  files.forEach((file) => {
    if (!file.endsWith(".gz")) return // 只处理备份文件

    const filePath = path.join(BACKUP_DIR, file)
    const stats = fs.statSync(filePath)
    const fileDate = new Date(stats.mtime)

    // 计算文件天数
    const diffDays = Math.floor((now - fileDate) / (1000 * 60 * 60 * 24))

    if (diffDays > BACKUP_RETENTION_DAYS) {
      try {
        fs.unlinkSync(filePath)
        deletedCount++
        logger.info(`已删除过期备份: ${file}`)
      } catch (err) {
        logger.error(`删除过期备份失败: ${file}, 错误: ${err.message}`)
      }
    }
  })

  if (deletedCount > 0) {
    logger.info(`共删除 ${deletedCount} 个过期备份`)
  } else {
    logger.info("没有过期备份需要删除")
  }
}

// 主函数
async function main() {
  try {
    await createBackup()
    removeOldBackups()
  } catch (error) {
    logger.error(`备份过程出错: ${error.message}`)
    process.exit(1)
  }
}

// 执行备份
main()
