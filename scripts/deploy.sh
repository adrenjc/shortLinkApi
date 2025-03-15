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



# 在安装 nginx 之前创建证书目录和默认证书
echo "创建 SSL 证书目录和默认证书..."
sudo mkdir -p /etc/nginx/ssl/domains
sudo chown -R www-data:www-data /etc/nginx/ssl
sudo chmod -R 750 /etc/nginx/ssl

# 创建默认自签名证书
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/default.key \
    -out /etc/nginx/ssl/default.pem \
    -subj "/CN=default.local" \
    -addext "subjectAltName = DNS:default.local"

# 然后再安装 nginx
echo "安装标准 Nginx..."
sudo apt-get update
sudo apt-get install -y nginx


# 验证 Nginx 配置
echo "验证 Nginx 配置..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "Nginx 配置验证成功，正在重启服务..."
    sudo systemctl restart nginx
    
    # 检查 Nginx 是否成功启动
    if ! systemctl is-active --quiet nginx; then
        echo "Nginx 启动失败，查看错误日志..."
        sudo journalctl -xeu nginx.service
        sudo systemctl status nginx.service
        exit 1
    else
        echo "Nginx 重启成功"
    fi
else
    echo "Nginx 配置验证失败，请检查配置文件"
    exit 1
fi

# 检查并安装 acme.sh
echo "正在检查 acme.sh..."
if [ ! -f "/root/.acme.sh/acme.sh" ]; then
    echo "正在安装 acme.sh..."
    
    # 安装 cron
    echo "安装 cron..."
    sudo apt-get install -y cron
    sudo systemctl enable cron
    sudo systemctl start cron
    
    # 检查是否设置了 ACME_EMAIL 环境变量
    if [ -z "$ACME_EMAIL" ]; then
        read -p "请输入用于 Let's Encrypt 的邮箱地址: " email
        export ACME_EMAIL=$email
    fi
    
    # 使用 force 参数安装 acme.sh
    echo "安装 acme.sh..."
    curl https://get.acme.sh | sh -s email=$ACME_EMAIL
    
    # 检查安装是否成功
    if [ ! -f "/root/.acme.sh/acme.sh" ]; then
        echo "尝试使用 force 参数重新安装..."
        curl https://get.acme.sh | sh -s -- --install --force email=$ACME_EMAIL
    fi
    
    # 再次检查安装
    if [ -f "/root/.acme.sh/acme.sh" ]; then
        # 设置默认 CA
        /root/.acme.sh/acme.sh --set-default-ca --server letsencrypt
        echo "acme.sh 安装完成"
    else
        echo "acme.sh 安装失败，请检查错误信息"
        exit 1
    fi
else
    echo "acme.sh 已安装"
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
        # 导入 MongoDB 7.0 公钥
        curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
            sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg \
            --dearmor

        # 添加 MongoDB 7.0 仓库
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
            sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

        # 更新包列表
        sudo apt-get update

        # 安装 MongoDB
        sudo apt-get install -y mongodb-org
    fi
    
    # 确保 MongoDB 数据目录存在并设置正确的权限
    echo "配置 MongoDB 数据目录..."
    sudo mkdir -p /var/lib/mongodb
    sudo chown -R mongodb:mongodb /var/lib/mongodb
    sudo chmod 750 /var/lib/mongodb

    # 配置 MongoDB
    echo "配置 MongoDB..."
    sudo tee /etc/mongod.conf > /dev/null << EOL
# 网络配置
net:
  port: 27017
  bindIp: 127.0.0.1

# 存储配置
storage:
  dbPath: /var/lib/mongodb

# 系统日志配置
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

# 副本集配置
replication:
  replSetName: "rs0"
EOL

    # 清理并重新创建数据目录
    echo "重置 MongoDB 数据目录..."
    sudo systemctl stop mongod
    sudo rm -rf /var/lib/mongodb/*
    sudo rm -rf /var/log/mongodb/*
    sudo mkdir -p /var/lib/mongodb
    sudo mkdir -p /var/log/mongodb
    sudo chown -R mongodb:mongodb /var/lib/mongodb
    sudo chown -R mongodb:mongodb /var/log/mongodb

    # 重启 MongoDB 服务
    echo "重启 MongoDB 服务..."
    sudo systemctl daemon-reload
    sudo systemctl start mongod
    sudo systemctl enable mongod

    # 等待 MongoDB 启动
    echo "等待 MongoDB 启动..."
    sleep 10

    # 检查 MongoDB 状态
    if ! systemctl is-active --quiet mongod; then
        echo "MongoDB 启动失败，查看日志..."
        sudo journalctl -u mongod -n 50
        exit 1
    fi

    # 初始化副本集
    echo "初始化副本集..."
    sleep 5  # 给 MongoDB 一些额外时间完全启动

    # 尝试初始化副本集，如果失败则重试
    for i in {1..3}; do
        echo "尝试初始化副本集 (尝试 $i/3)..."
        
        # 停止 MongoDB
        sudo systemctl stop mongod
        
        # 清理数据
        sudo rm -rf /var/lib/mongodb/*
        sudo rm -rf /var/log/mongodb/*
        
        # 重新创建目录
        sudo mkdir -p /var/lib/mongodb
        sudo mkdir -p /var/log/mongodb
        
        # 设置权限
        sudo chown -R mongodb:mongodb /var/lib/mongodb
        sudo chown -R mongodb:mongodb /var/log/mongodb
        
        # 启动 MongoDB
        sudo systemctl start mongod
        
        # 等待服务启动
        sleep 10
        
        # 初始化副本集
        mongosh --eval '
        rs.initiate({
            _id: "rs0",
            members: [
                { _id: 0, host: "localhost:27017" }
            ]
        });' && break || {
            echo "副本集初始化失败，正在重试..."
            if [ $i -eq 3 ]; then
                echo "副本集初始化失败，已达到最大重试次数"
                exit 1
            fi
            sleep 5
        }
    done

    # 等待副本集初始化完成
    echo "等待副本集初始化完成..."
    for i in {1..30}; do
        if mongosh --eval "rs.status()" | grep -q '"ok" : 1'; then
            echo "副本集初始化成功！"
            # 额外检查确保副本集完全就绪
            if mongosh --eval "rs.status()" | grep -q '"stateStr" : "PRIMARY"'; then
                echo "副本集主节点已就绪！"
                break
            fi
        fi
        if [ $i -eq 30 ]; then
            echo "副本集初始化超时"
            exit 1
        fi
        echo "等待副本集就绪... ($i/30)"
        sleep 2
    done

    # 确保副本集完全就绪
    echo "等待副本集完全就绪..."
    sleep 10

    # 验证副本集状态
    echo "验证副本集状态..."
    if ! mongosh --eval "rs.status()" | grep -q '"stateStr" : "PRIMARY"'; then
        echo "副本集状态检查失败 - 未找到主节点"
        exit 1
    fi

    # 验证 MongoDB 连接
    echo "验证 MongoDB 连接..."
    for i in {1..5}; do
        if mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
            echo "MongoDB 连接测试成功！"
            break
        fi
        if [ $i -eq 5 ]; then
            echo "MongoDB 连接测试失败"
            echo "检查 MongoDB 状态..."
            sudo systemctl status mongod
            echo "检查 MongoDB 日志..."
            sudo tail -n 50 /var/log/mongodb/mongod.log
            exit 1
        fi
        echo "重试 MongoDB 连接... ($i/5)"
        sleep 2
    done
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
if [ ! -d "/var/www/shortLinkApi" ]; then
    echo "正在创建应用目录..."
    sudo mkdir -p /var/www/shortLinkApi
    sudo chown -R $USER:$USER /var/www/shortLinkApi
else
    echo "应用目录已存在"
fi

# 检查并创建日志目录
if [ ! -d "/var/log/shortLinkApi" ]; then
    echo "正在创建日志目录..."
    sudo mkdir -p /var/log/shortLinkApi
    sudo chown -R $USER:$USER /var/log/shortLinkApi
else
    echo "日志目录已存在"
fi

# 检查项目文件
cd /var/www/shortLinkApi
if [ ! -f "package.json" ]; then
    echo "请确保项目代码已经复制到 /var/www/shortLinkApi 目录"
    echo "你可以使用以下命令克隆项目："
    echo "git clone git@github.com:adrenjc/shortLinkApi.git /var/www/shortLinkApi"
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
# 修改日志路径
sudo mkdir -p /logs
sudo chown -R $USER:$USER /logs

# 检查应用是否已经在运行
if pm2 list | grep -q "shortlink-backend"; then
    echo "应用已在运行，正在重启..."
    pm2 reload shortlink-backend
else
    echo "首次启动应用..."
    # 确保在正确的目录下
    cd /var/www/shortLinkApi
    pm2 start ecosystem.config.js
fi

# 保存 PM2 配置并设置开机自启
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

# 验证 SSL 相关组件
echo -e "\nSSL 组件状态："
echo "-------------------"

echo "acme.sh:"
if [ -f "/root/.acme.sh/acme.sh" ]; then
    echo "✓ acme.sh 已安装"
    echo "版本: $(/root/.acme.sh/acme.sh --version 2>&1 | head -n 1)"
else
    echo "✗ acme.sh 未安装或未正确配置"
fi

echo "SSL 证书目录:"
if [ -d "/etc/nginx/ssl/domains" ]; then
    echo "✓ SSL 证书目录已创建"
    ls -l /etc/nginx/ssl/domains
else
    echo "✗ SSL 证书目录未创建"
fi

echo "权限配置:"
echo "SSL 目录权限: $(stat -c '%A %U:%G' /etc/nginx/ssl/domains)"
echo "当前用户组: $(groups)"

echo -e "\n部署完成！请检查以上状态确保所有组件都正确安装和配置。" 