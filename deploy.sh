#!/bin/bash

# 设置错误处理
set -e

# 清理函数
cleanup() {
    echo "清理环境..."
    docker-compose down || true
}

# 错误处理函数
handle_error() {
    echo "发生错误，执行清理..."
    cleanup
    exit 1
}

# 设置错误处理器
trap 'handle_error' ERR

echo "开始部署..."

# 停止并删除旧容器
echo "停止旧容器..."
docker-compose down || true

# 拉取镜像（添加重试机制）
echo "拉取镜像..."
max_attempts=3
attempt=1
while [ $attempt -le $max_attempts ]; do
    if docker-compose pull; then
        break
    fi
    echo "拉取失败，第 $attempt 次重试..."
    attempt=$((attempt + 1))
    sleep 5
done

if [ $attempt -gt $max_attempts ]; then
    echo "拉取镜像失败，请检查网络连接"
    exit 1
fi

# 构建新镜像
echo "构建镜像..."
docker-compose build --no-cache

# 启动服务
echo "启动服务..."
docker-compose up -d

# 等待服务启动
echo "等待服务启动..."
sleep 15

# 初始化 MongoDB 副本集
echo "初始化 MongoDB 副本集..."
docker exec shortlink-mongo mongosh --eval "rs.initiate()" || true

# 等待 MongoDB 副本集初始化
echo "等待 MongoDB 副本集就绪..."
sleep 10

# 运行数据库初始化脚本
echo "初始化数据库..."
docker exec shortlink-api npm run seed:prod

# 显示运行状态
echo "部署完成，显示容器状态："
docker-compose ps

echo "部署成功完成！" 