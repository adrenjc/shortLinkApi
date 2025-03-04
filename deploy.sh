#!/bin/bash

# 确保脚本在错误时停止
set -e

# 检查是否以root运行
if [ "$EUID" -ne 0 ]; then 
    echo "请使用 sudo 运行此脚本"
    exit 1
fi

# 检查当前用户
CURRENT_USER=${SUDO_USER:-$USER}

echo "正在为用户 $CURRENT_USER 设置Docker环境..."

# 配置Docker镜像加速
echo "配置Docker镜像加速器..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": [
    "https://registry.cn-hangzhou.aliyuncs.com",
    "https://mirror.ccs.tencentyun.com",
    "https://hub-mirror.c.163.com"
  ]
}
EOF

# 重启Docker服务
systemctl daemon-reload
systemctl restart docker

# 更新系统
echo "正在更新系统..."
apt-get update
apt-get upgrade -y

# 安装必要的软件包
echo "安装必要的软件包..."
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# 安装 Docker
if ! command -v docker &> /dev/null; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    
    # 将当前用户添加到docker组
    usermod -aG docker $CURRENT_USER
    
    # 启动Docker服务
    systemctl enable docker
    systemctl start docker
fi

# 安装 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "安装 Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# 创建必要的目录
echo "创建必要的目录..."
mkdir -p logs
chown -R $CURRENT_USER:$CURRENT_USER logs

# 设置文件权限
echo "设置文件权限..."
chmod +x deploy.sh
chmod 755 logs

# 确保 docker.sock 有正确的权限
chmod 666 /var/run/docker.sock

# 创建并设置环境变量文件
echo "设置环境变量..."
cat > .env << EOF
PM2_PUBLIC_KEY=your_pm2_public_key
PM2_SECRET_KEY=your_pm2_secret_key
EOF

# 拉取镜像（添加重试机制）
echo "拉取必要的Docker镜像..."
for i in {1..3}; do
    if docker pull mongo:latest && \
       docker pull redis:latest && \
       docker pull node:18-alpine; then
        echo "镜像拉取成功"
        break
    else
        echo "第 $i 次尝试拉取镜像失败，等待重试..."
        sleep 5
    fi
done

# 启动服务
echo "启动服务..."
docker-compose down
docker-compose up -d --build

# 等待服务启动
echo "等待服务启动..."
sleep 30

# 初始化 MongoDB 副本集
echo "初始化 MongoDB 副本集..."
docker-compose exec -T mongodb mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})"

# 检查服务状态
echo "检查服务状态..."
docker-compose ps

echo "部署完成!"

# 提示用户重新登录以使组成员身份生效
echo "请注意: 您需要重新登录以使Docker组成员身份生效"
echo "您可以运行以下命令重新加载组成员身份:"
echo "newgrp docker" 