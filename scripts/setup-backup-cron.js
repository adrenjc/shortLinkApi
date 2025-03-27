/**
 * 设置MongoDB数据库自动备份的cron任务脚本
 *
 * 此脚本用于:
 * 1. 在系统中设置定时备份任务
 * 2. 根据操作系统类型选择合适的方式设置cron
 *
 * 使用方法:
 * - 设置每日备份: node scripts/setup-backup-cron.js daily
 * - 设置每周备份: node scripts/setup-backup-cron.js weekly
 * - 设置每月备份: node scripts/setup-backup-cron.js monthly
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
const os = require("os")

// 获取工作目录的绝对路径
const workingDir = process.cwd()
const backupScriptPath = path.join(workingDir, "scripts", "database-backup.js")

// 检查操作系统类型
const isWindows = os.platform() === "win32"
const isLinux = os.platform() === "linux"
const isMac = os.platform() === "darwin"

/**
 * 在Linux/Mac系统上设置cron任务
 * @param {string} schedule - cron表达式
 */
function setupUnixCron(schedule) {
  const command = `node ${backupScriptPath}`
  const cronJob = `${schedule} cd ${workingDir} && ${command} >> ${workingDir}/backups/cron.log 2>&1`

  // 获取当前crontab
  exec("crontab -l", (error, stdout, stderr) => {
    let crontabContent = ""

    // 如果crontab为空或发生错误，使用空字符串
    if (error) {
      if (error.code !== 0) {
        console.log("当前没有crontab，将创建新的crontab")
      } else {
        console.error(`获取crontab失败: ${error.message}`)
        return
      }
    } else {
      crontabContent = stdout
    }

    // 检查是否已经存在备份任务
    if (crontabContent.includes(backupScriptPath)) {
      console.log("备份任务已存在，将更新现有任务")

      // 使用正则表达式替换现有的cron任务
      const regex = new RegExp(
        `.*${backupScriptPath.replace(/\//g, "\\/")}.*`,
        "g"
      )
      crontabContent = crontabContent.replace(regex, cronJob)
    } else {
      // 添加新的cron任务
      crontabContent += `${cronJob}\n`
    }

    // 写入临时文件
    const tempFile = path.join(os.tmpdir(), "temp-crontab")
    fs.writeFileSync(tempFile, crontabContent)

    // 使用临时文件更新crontab
    exec(`crontab ${tempFile}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`设置crontab失败: ${error.message}`)
        return
      }

      console.log(`备份任务已成功设置为: ${schedule}`)

      // 清理临时文件
      fs.unlinkSync(tempFile)
    })
  })
}

/**
 * 在Windows系统上设置计划任务
 * @param {string} schedule - 计划任务描述
 */
function setupWindowsTask(schedule) {
  let taskName = "MongoDBBackup"
  let scheduleParams = ""

  // 根据不同的备份频率设置参数
  switch (schedule) {
    case "daily":
      scheduleParams = "/sc DAILY /st 02:00"
      break
    case "weekly":
      scheduleParams = "/sc WEEKLY /st 02:00 /d SUN"
      break
    case "monthly":
      scheduleParams = "/sc MONTHLY /st 02:00 /d 1"
      break
    default:
      console.error("无效的备份频率")
      return
  }

  // 删除现有任务（如果存在）
  exec(`schtasks /query /tn "${taskName}" > nul 2>&1`, (error) => {
    const deleteCmd = error ? "" : `schtasks /delete /tn "${taskName}" /f && `

    // 创建新任务
    const command = `${deleteCmd}schtasks /create /tn "${taskName}" ${scheduleParams} /tr "cd /d ${workingDir} && node ${backupScriptPath}"`

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`设置Windows计划任务失败: ${error.message}`)
        return
      }

      console.log(`备份任务已成功设置为${schedule}`)
    })
  })
}

/**
 * 设置备份任务
 * @param {string} frequency - 备份频率 (daily, weekly, monthly)
 */
function setupBackupTask(frequency) {
  // 检查备份脚本是否存在
  if (!fs.existsSync(backupScriptPath)) {
    console.error(`备份脚本不存在: ${backupScriptPath}`)
    return
  }

  let schedule = ""

  if (isWindows) {
    setupWindowsTask(frequency)
    return
  }

  // 为Unix系统设置cron表达式
  switch (frequency) {
    case "daily":
      // 每天凌晨2点执行
      schedule = "0 2 * * *"
      break
    case "weekly":
      // 每周日凌晨2点执行
      schedule = "0 2 * * 0"
      break
    case "monthly":
      // 每月1日凌晨2点执行
      schedule = "0 2 1 * *"
      break
    default:
      console.error("无效的备份频率，请使用 daily, weekly 或 monthly")
      return
  }

  setupUnixCron(schedule)
}

// 主函数
function main() {
  const args = process.argv.slice(2)
  const frequency = args[0] || "daily"

  if (!["daily", "weekly", "monthly"].includes(frequency)) {
    console.error("无效的备份频率，请使用 daily, weekly 或 monthly")
    process.exit(1)
  }

  setupBackupTask(frequency)
}

// 执行脚本
main()
