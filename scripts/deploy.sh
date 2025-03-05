#!/bin/bash

# 设置错误时退出
set -e

echo "开始部署 Shortlink Backend..."

# 检查命令是否存在的函数
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查服务是否存在并运行的函数
service_exists_and_running() {
    if systemctl is-active --quiet "$1"; then
        return 0
    else
        return 1
    fi
}

# 更新系统包
echo "正在检查系统更新..."
sudo apt-get update

# 安装基础工具
echo "正在检查基础工具..."
for tool in curl wget git build-essential; do
    if ! command_exists $tool; then
        echo "正在安装 $tool..."
        sudo apt-get install -y $tool
    else
        echo "$tool 已安装，跳过..."
    fi
done

# 检查并安装 Node.js
if ! command_exists node; then
    echo "正在安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js 已安装，版本: $(node -v)"
fi

# 检查并安装 PM2
if ! command_exists pm2; then
    echo "正在安装 PM2..."
    sudo npm install -y pm2 -g
else
    echo "PM2 已安装，版本: $(pm2 -v)"
fi

# 检查并安装 MongoDB
if ! service_exists_and_running mongod; then
    echo "正在安装 MongoDB..."
    if ! command_exists mongod; then
        wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
        echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
        sudo apt-get update
        sudo apt-get install -y mongodb-org
    fi
    
    echo "正在启动 MongoDB..."
    sudo systemctl start mongod
    sudo systemctl enable mongod
    
    # 检查副本集是否已初始化
    if ! mongosh --eval "rs.status()" | grep -q "ok.*:.*1"; then
        echo "正在初始化 MongoDB 副本集..."
        mongosh --eval 'rs.initiate()'
    else
        echo "MongoDB 副本集已初始化"
    fi
else
    echo "MongoDB 已安装并运行中"
fi

# 检查并安装 Redis
if ! service_exists_and_running redis-server; then
    echo "正在安装 Redis..."
    sudo apt-get install -y redis-server
    
    echo "正在配置 Redis..."
    # 检查是否已经配置了 supervised
    if ! grep -q "^supervised systemd" /etc/redis/redis.conf; then
        sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
    fi
    
    sudo systemctl restart redis.service
    sudo systemctl enable redis-server
else
    echo "Redis 已安装并运行中"
fi

# 检查并创建应用目录
if [ ! -d "/var/www/shortlinkapi" ]; then
    echo "正在创建应用目录..."
    sudo mkdir -p /var/www/shortlinkapi
    sudo chown -R $USER:$USER /var/www/shortlinkapi
else
    echo "应用目录已存在"
fi

# 检查并创建日志目录
if [ ! -d "/var/log/shortlinkapi" ]; then
    echo "正在创建日志目录..."
    sudo mkdir -p /var/log/shortlinkapi
    sudo chown -R $USER:$USER /var/log/shortlinkapi
else
    echo "日志目录已存在"
fi

# 检查项目文件
cd /var/www/shortlinkapi
if [ ! -f "package.json" ]; then
    echo "请确保项目代码已经复制到 /var/www/shortlinkapi 目录"
    echo "你可以使用以下命令克隆项目："
    echo "git clone git@github.com:adrenjc/shortLinkApi.git /var/www/shortlinkapi"
    exit 1
fi

# 安装项目依赖
echo "正在安装项目依赖..."
npm install


# 初始化数据库（如果需要）
read -p "是否需要初始化数据库？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "正在初始化数据库..."
    npm run seed:prod
fi



# 检查并配置防火墙
if ! command_exists ufw; then
    echo "正在安装防火墙..."
    sudo apt-get install -y ufw
fi

# 配置防火墙规则
echo "配置防火墙规则..."
sudo ufw status | grep -q "Status: active" || {
    sudo ufw allow ssh
    sudo ufw allow http
    sudo ufw allow https
    sudo ufw --force enable
}

# 使用 PM2 启动应用
echo "正在启动应用..."
pm2 describe shortlink-backend > /dev/null
if [ $? -eq 0 ]; then
    echo "应用已在运行，正在重启..."
    pm2 reload ecosystem.config.js
else
    echo "首次启动应用..."
    pm2 start ecosystem.config.js
fi

pm2 save
pm2 startup

echo "部署完成！"
echo "请检查以下事项："
echo "1. 修改 .env.production 中的环境变量"
echo "2. 更新 Nginx 配置中的域名 (/etc/nginx/sites-available/shortlink)"
echo "3. 如果需要 HTTPS，请配置 SSL 证书"
echo "4. 检查应用运行状态：pm2 status"
echo "5. 检查日志：pm2 logs"

# 显示服务状态
echo -e "\n当前服务状态："
echo "-------------------"
echo "MongoDB 状态:"
sudo systemctl status mongod --no-pager | grep "Active:"
echo "Redis 状态:"
sudo systemctl status redis-server --no-pager | grep "Active:"
echo "Nginx 状态:"
sudo systemctl status nginx --no-pager | grep "Active:"
echo "防火墙状态:"
sudo ufw status | grep "Status:"
echo "PM2 进程状态:"
pm2 list | grep "shortlink-backend" 