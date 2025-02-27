const config = {
  development: {
    baseUrl: "http://localhost:5000",
    domain: "localhost:5000",
    isDev: true,
  },
  production: {
    domains: [
      {
        baseUrl: "https://adrenjc.top",
        domain: "adrenjc.top",
      },
      {
        baseUrl: "https://duckchat.icu",
        domain: "duckchat.icu",
      },
    ],
    // 默认使用第一个域名
    baseUrl: process.env.BASE_URL || "https://adrenjc.top",
    domain: process.env.DOMAIN || "adrenjc.top",
    isDev: false,
  },
}

// 修改导出方式
module.exports = {
  ...config[process.env.NODE_ENV || "development"],
  getConfig: (env) => config[env] || config.development,
}
