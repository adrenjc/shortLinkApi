module.exports = {
  apps: [
    {
      name: "shortlink-backend",
      script: "server.js",
      // 在容器环境中，我们通常使用较少的实例
      instances: "2", // 改为固定数量，避免容器内存压力
      exec_mode: "cluster",
      watch: false,
      // 调整容器内存限制
      max_memory_restart: "1G", // 降低内存限制以适应容器环境

      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },

      // 修改日志路径，确保与 Docker 挂载卷匹配
      error_file: "/app/logs/err.log",
      out_file: "/app/logs/out.log",

      // 优化容器环境的配置
      exp_backoff_restart_delay: 1000,
      max_restarts: 5, // 减少重启次数
      kill_timeout: 3000,
      wait_ready: true,
      listen_timeout: 6000, // 减少等待时间

      // 日志配置
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_logs: "5", // 减少日志文件数量
      log_type: "json",

      // 容器健康检查配置
      status_interval: 10000, // 10秒检查一次
      min_uptime: "30s", // 最小运行时间
      restart_delay: 4000, // 重启延迟

      // 优雅关闭配置
      shutdown_with_message: true,
      wait_ready: true,
      listen_timeout: 6000,
    },
  ],
}
