#!/bin/bash

# 确保脚本在错误时停止
set -e

# 更新系统
echo "正在更新系统..."
sudo apt-get update
sudo apt-get upgrade -y

# 安装必要的软件包
echo "安装必要的软件包..."
sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# 安装 Docker
if ! command -v docker &> /dev/null; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    sudo systemctl enable docker
    sudo systemctl start docker
fi

# 安装 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "安装 Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# 创建必要的目录
echo "创建必要的目录..."
mkdir -p logs

# 设置文件权限
echo "设置文件权限..."
chmod +x deploy.sh
chmod 755 logs

# 启动服务
echo "启动服务..."
docker-compose down
docker-compose up -d --build

# 等待服务启动
echo "等待服务启动..."
sleep 30

# 初始化 MongoDB 副本集
echo "初始化 MongoDB 副本集..."
docker-compose exec mongodb mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})"

# 检查服务状态
echo "检查服务状态..."
docker-compose ps

echo "部署完成!" 