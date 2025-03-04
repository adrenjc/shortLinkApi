# 构建阶段
FROM node:18-alpine as builder

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 yarn.lock
COPY package*.json yarn.lock ./

# 安装依赖
RUN yarn install --production

# 复制源代码
COPY . .

# 生产阶段
FROM node:18-alpine

# 安装 PM2 和 curl (用于健康检查)
RUN apk add --no-cache curl && \
  npm install pm2 -g

# 设置工作目录
WORKDIR /app

# 从构建阶段复制文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# 创建日志目录
RUN mkdir -p /app/logs

# 设置环境变量
ENV NODE_ENV=production \
  PORT=8080

# 暴露端口
EXPOSE 8080

# 启动命令
CMD ["pm2-runtime", "ecosystem.config.js"] 