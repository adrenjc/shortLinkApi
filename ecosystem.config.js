module.exports = {
  apps: [
    {
      name: "shortlink-backend",
      script: "server.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
