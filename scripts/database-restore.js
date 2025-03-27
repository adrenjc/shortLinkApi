/**
 * MongoDB 数据库恢复脚本
 *
 * 此脚本用于:
 * 1. 从备份文件恢复MongoDB数据库
 * 2. 提供备份列表供用户选择
 *
 * 使用方法:
 * - 列出所有备份: node scripts/database-restore.js list
 * - 恢复指定备份: node scripts/database-restore.js restore <备份文件名>
 * - 通过npm脚本: npm run restore -- restore <备份文件名>
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
const readline = require("readline")
const winston = require("winston")

// 配置参数
const BACKUP_DIR = process.env.BACKUP_DIR || "./backups"
const DB_NAME = "shortlink" // 从MongoDB连接字符串中提取

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
      filename: path.join(BACKUP_DIR, "restore.log"),
    }),
  ],
})

// 获取数据库连接信息
function getDatabaseUrl() {
  const mongoUri = process.env.MONGO_URI
  if (!mongoUri) {
    throw new Error("未找到MONGO_URI环境变量")
  }
  return mongoUri
}

// 列出所有备份文件
function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      logger.error(`备份目录不存在: ${BACKUP_DIR}`)
      return []
    }

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((file) => file.endsWith(".gz"))
      .map((file) => {
        const stats = fs.statSync(path.join(BACKUP_DIR, file))
        return {
          filename: file,
          created: stats.mtime,
          size: stats.size,
        }
      })
      .sort((a, b) => b.created - a.created) // 按日期降序排序

    return files
  } catch (error) {
    logger.error(`获取备份列表失败: ${error.message}`)
    return []
  }
}

// 恢复备份
function restoreBackup(backupFileName) {
  const backupFilePath = path.join(BACKUP_DIR, backupFileName)

  if (!fs.existsSync(backupFilePath)) {
    logger.error(`备份文件不存在: ${backupFilePath}`)
    throw new Error(`备份文件不存在: ${backupFileName}`)
  }

  const mongoUri = getDatabaseUrl()

  // 使用mongorestore恢复备份
  const restoreCommand = `mongorestore --uri="${mongoUri}" --gzip --archive=${backupFilePath} --drop`

  logger.info(`开始恢复数据库 ${DB_NAME} 从备份: ${backupFileName}`)

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question(
      `警告: 此操作将覆盖当前数据库内容。确定要继续吗? (y/n): `,
      (answer) => {
        rl.close()

        if (answer.toLowerCase() !== "y") {
          logger.info("恢复操作已取消")
          resolve("操作已取消")
          return
        }

        exec(restoreCommand, (error, stdout, stderr) => {
          if (error) {
            logger.error(`恢复失败: ${error.message}`)
            reject(error)
            return
          }

          if (stderr) {
            logger.warn(`恢复警告: ${stderr}`)
          }

          logger.info(`恢复完成: ${backupFileName}`)
          resolve(`数据库 ${DB_NAME} 已成功从 ${backupFileName} 恢复`)
        })
      }
    )
  })
}

// 显示备份列表
function displayBackupList() {
  const backups = listBackups()

  if (backups.length === 0) {
    console.log("没有找到备份文件")
    return
  }

  console.log("\n可用备份列表:")
  console.log("------------------------------------")
  backups.forEach((backup, index) => {
    const date = backup.created.toLocaleString()
    const size = (backup.size / (1024 * 1024)).toFixed(2) + " MB"
    console.log(`${index + 1}. ${backup.filename}`)
    console.log(`   创建时间: ${date}`)
    console.log(`   大小: ${size}`)
    console.log("------------------------------------")
  })

  console.log("\n使用以下命令恢复备份:")
  console.log(`node scripts/database-restore.js restore <备份文件名>`)
  console.log("例如:")
  if (backups.length > 0) {
    console.log(
      `node scripts/database-restore.js restore ${backups[0].filename}`
    )
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  try {
    if (!command || command === "list") {
      displayBackupList()
    } else if (command === "restore") {
      const backupFileName = args[1]

      if (!backupFileName) {
        logger.error("请指定要恢复的备份文件名")
        displayBackupList()
        process.exit(1)
      }

      const result = await restoreBackup(backupFileName)
      console.log(result)
    } else {
      console.log("未知命令")
      console.log("可用命令:")
      console.log("- list: 列出所有备份")
      console.log("- restore <备份文件名>: 恢复指定备份")
    }
  } catch (error) {
    logger.error(`恢复过程出错: ${error.message}`)
    process.exit(1)
  }
}

// 执行命令
main()
