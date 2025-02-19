module.exports = {
  apps: [
    {
      name: "shortlink-backend",
      script: "server.js",
      instances: "max", // 根据CPU核心数启动最大实例数
      exec_mode: "cluster", // 使用cluster模式实现负载均衡
      watch: false, // 生产环境关闭文件监听
      max_memory_restart: "1G", // 超过1G内存就重启
      env: {
        NODE_ENV: "production",
      },
      // 错误日志文件
      error_file: "logs/err.log",
      // 输出日志文件
      out_file: "logs/out.log",
      // 日志时间格式
      time: true,
      // 集群配置
      exp_backoff_restart_delay: 100, // 重启延迟
      max_restarts: 10, // 最大重启次数
      // 优雅停机配置
      kill_timeout: 3000, // 等待3秒后强制关闭
      wait_ready: true, // 等待ready事件
      listen_timeout: 3000, // 等待服务启动3秒
    },
  ],
}
