# 使用Node.js官方镜像作为基础镜像
FROM node:18-alpine

# 安装PM2
RUN npm install pm2 -g

# 设置工作目录
WORKDIR /app

# 复制package.json和yarn.lock
COPY package*.json yarn.lock ./

# 安装依赖
RUN yarn install

# 复制源代码
COPY . .

# 暴露端口（根据您的应用配置）
EXPOSE 8080

# 使用PM2启动应用
CMD ["pm2-runtime", "ecosystem.config.js"] 