# 使用 Node.js 18 作为基础镜像
FROM registry.cn-hangzhou.aliyuncs.com/google_containers/node:18-alpine

# 设置 npm 国内镜像
RUN npm config set registry https://registry.npmmirror.com

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖和 PM2
RUN npm install
RUN npm install pm2 -g

# 复制源代码
COPY . .

# 创建日志目录
RUN mkdir -p /app/logs

# 暴露端口
EXPOSE 8080

# 使用 PM2 启动应用
CMD ["pm2-runtime", "ecosystem.config.js"] 