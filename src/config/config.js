const config = {
  development: {
    baseUrl: "http://localhost:5000",
    domain: "localhost:5000",
    isDev: true,
  },
  production: {
    // 默认使用第一个域名
    baseUrl: process.env.BASE_URL,
    domain: process.env.DOMAIN,
    isDev: false,
  },
}

// 修改导出方式
module.exports = {
  ...config[process.env.NODE_ENV || "development"],
  getConfig: (env) => config[env] || config.development,
}
