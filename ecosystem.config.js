module.exports = {
  apps: [
    {
      name: "shortlink-backend",
      script: "server.js",

      // 进程配置 - 4核8G配置
      instances: "max", // 自动使用所有CPU核心
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1.5G", // 单个实例最大内存限制

      // 环境变量
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },

      // 日志配置
      error_file: "/logs/err.log",
      out_file: "/logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      log_type: "json",
      max_logs: "5", // 可以保留更多日志

      // 重启策略
      exp_backoff_restart_delay: 100,
      max_restarts: 10, // 增加重启次数容错
      min_uptime: "30s",
      restart_delay: 1000,

      // 优雅关闭配置
      kill_timeout: 5000, // 更宽松的超时时间
      wait_ready: true,
      listen_timeout: 3000,
      shutdown_with_message: true,

      // 性能监控
      status_interval: 60000,

      // 集群配置 - 性能优化
      node_args: [
        "--max-old-space-size=1536", // 更大的内存限制
        "--optimize-for-size",
        "--max-http-header-size=8192",
        "--gc-interval=200", // 降低GC频率
      ],

      // 负载均衡
      increment_var: "PORT",
      instance_var: "INSTANCE_ID",
    },
  ],
}
