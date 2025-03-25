# Shortlink Backend 部署指南 (Linux 环境)

## 环境要求

- Linux 服务器 (Ubuntu 20.04/22.04 或 CentOS 8/9 推荐)
- Node.js 18.x 或更高版本
- MongoDB 6.0 或更高版本
- Git
- PM2 (用于进程管理)
- Nginx (用于反向代理)
- Redis (用于缓存)

## 1. 环境安装

### 1.1 Node.js 安装

```bash
# 使用 NVM 安装 Node.js (推荐)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 验证安装
node --version
npm --version
```

### 1.2 MongoDB 安装

```bash
# Ubuntu 安装
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# CentOS 安装
cat <<EOF | sudo tee /etc/yum.repos.d/mongodb-org-6.0.repo
[mongodb-org-6.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/6.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-6.0.asc
EOF
sudo yum install -y mongodb-org

# 启动 MongoDB 并设置开机自启
sudo systemctl start mongod
sudo systemctl enable mongod

# 配置副本集（生产环境推荐）
sudo mkdir -p /var/log/mongodb
sudo chown -R mongod:mongod /var/log/mongodb

# 编辑配置文件
sudo nano /etc/mongod.conf
# 添加以下内容到配置文件
# replication:
#   replSetName: "rs0"

# 重启 MongoDB
sudo systemctl restart mongod

# 初始化副本集
mongo --eval "rs.initiate()"
```

### 1.3 Redis 安装

```bash
# Ubuntu 安装
sudo apt update
sudo apt install redis-server

# CentOS 安装
sudo yum install epel-release
sudo yum install redis

# 启动 Redis 并设置开机自启
sudo systemctl start redis
sudo systemctl enable redis

# 验证 Redis 安装
redis-cli ping
```

### 1.4 Git 安装

```bash
# Ubuntu
sudo apt update
sudo apt install git

# CentOS
sudo yum install git

# 验证安装
git --version
```

### 1.5 PM2 安装

```bash
npm install -g pm2
```

### 1.6 Nginx 安装

```bash
# Ubuntu
sudo apt update
sudo apt install nginx

# CentOS
sudo yum install epel-release
sudo yum install nginx

# 启动 Nginx 并设置开机自启
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 2. 项目部署

### 2.1 克隆项目

```bash
# 选择合适的目录
mkdir -p /var/www
cd /var/www
git clone <your-repository-url> shortlink-backend
cd shortlink-backend
```

### 2.2 安装依赖

```bash
npm install
# 或者使用 yarn
yarn install
```

### 2.3 环境配置

1. 复制环境配置文件：

```bash
cp .env.production .env
```

2. 修改 `.env` 文件，配置以下参数：

```bash
nano .env
```

主要配置参数：

- `MONGO_URI`: MongoDB 连接字符串 (例如: `mongodb://localhost:27017/shortlink?replicaSet=rs0`)
- `JWT_SECRET`: JWT 密钥
- `PORT`: 应用端口号 (默认: 8080)
- `REDIS_HOST`: Redis 主机地址
- `REDIS_PORT`: Redis 端口
- `ACME_EMAIL`: SSL 证书邮箱

### 2.4 创建日志目录

```bash
mkdir -p /var/log/shortlink
sudo chown -R $USER:$USER /var/log/shortlink
```

### 2.5 修改 PM2 配置

编辑 `ecosystem.config.js` 文件，更新日志路径：

```bash
nano ecosystem.config.js
```

将日志路径修改为：

```javascript
// 日志配置
error_file: "/var/log/shortlink/err.log",
out_file: "/var/log/shortlink/out.log",
```

## 3. 启动服务

### 3.1 使用 PM2 启动服务

```bash
# 启动服务
pm2 start ecosystem.config.js

# 设置PM2开机自启
pm2 startup
pm2 save
```

### 3.2 验证服务状态

```bash
pm2 status
pm2 logs shortlink-backend
```

## 4. 配置反向代理

### 4.1 Nginx 配置

1. 创建 Nginx 配置文件

```bash
sudo nano /etc/nginx/sites-available/shortlink
```

2. 添加以下配置：

```nginx
upstream shortlink_backend {
    server 127.0.0.1:8080;
    # 如果使用 PM2 cluster 模式，会自动处理负载均衡
}

server {
    listen 80;
    server_name your_domain.com;  # 替换为你的域名

    # 访问日志
    access_log /var/log/nginx/shortlink.access.log detailed;
    error_log /var/log/nginx/shortlink.error.log error;

    # 反向代理配置
    location / {
        proxy_pass http://shortlink_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件缓存配置（如果有）
    location /static/ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
        proxy_pass http://shortlink_backend;
    }

    # 健康检查接口
    location /health {
        proxy_pass http://shortlink_backend/health;
        access_log off;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

3. 启用站点配置

```bash
sudo ln -s /etc/nginx/sites-available/shortlink /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4.2 配置 SSL (使用 Certbot)

```bash
# Ubuntu
sudo apt install certbot python3-certbot-nginx

# CentOS
sudo yum install certbot python3-certbot-nginx

# 获取并安装证书
sudo certbot --nginx -d your_domain.com

# 自动续期
sudo systemctl status certbot.timer
```

### 4.3 防火墙配置

```bash
# Ubuntu (UFW)
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable

# CentOS (Firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

## 5. 维护指南

### 5.1 日常维护命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs

# 实时监控
pm2 monit

# 重启服务
pm2 restart shortlink-backend

# 停止服务
pm2 stop shortlink-backend

# 删除服务
pm2 delete shortlink-backend
```

### 5.2 更新部署

```bash
# 进入项目目录
cd /var/www/shortlink-backend

# 拉取最新代码
git pull

# 安装依赖
npm install

# 重启服务
pm2 restart shortlink-backend
```

### 5.3 日志管理

- 应用日志位置：`/var/log/shortlink/`
- Nginx 日志位置：`/var/log/nginx/`
- MongoDB 日志位置：`/var/log/mongodb/`

配置日志轮转：

```bash
sudo nano /etc/logrotate.d/shortlink
```

添加以下内容：

```
/var/log/shortlink/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

### 5.4 性能监控

```bash
# 查看实时监控面板
pm2 monit

# 查看性能统计
pm2 plus

# 系统资源监控
htop
```

## 6. 故障排除

### 6.1 常见问题

1. 服务无法启动

   - 检查端口是否被占用：`sudo netstat -tulpn | grep 8080`
   - 检查环境变量配置：`cat .env`
   - 查看错误日志：`pm2 logs`
   - 检查 Node.js 版本：`node -v`

2. MongoDB 连接失败

   - 验证 MongoDB 服务状态：`sudo systemctl status mongod`
   - 检查连接字符串配置：`cat .env | grep MONGO_URI`
   - 检查副本集状态：`mongo --eval "rs.status()"`
   - 确认防火墙设置：`sudo ufw status` 或 `sudo firewall-cmd --list-all`

3. Nginx 配置问题

   - 检查 Nginx 配置：`sudo nginx -t`
   - 查看 Nginx 错误日志：`sudo tail -f /var/log/nginx/error.log`
   - 重启 Nginx：`sudo systemctl restart nginx`

4. 内存占用过高
   - 检查 `ecosystem.config.js` 中的内存限制设置
   - 使用 `pm2 monit` 监控资源使用情况
   - 检查系统资源：`free -m` 和 `htop`

### 6.2 性能优化建议

1. 根据服务器配置调整 `ecosystem.config.js` 中的实例数
2. 适当配置 MongoDB 索引
3. 启用 Nginx 压缩和缓存
4. 使用 Redis 缓存频繁访问的数据
5. 优化数据库查询

## 7. 安全建议

1. 防火墙配置

   - 只开放必要端口
   - 使用 UFW 或 Firewalld 管理防火墙规则
   - 考虑使用 fail2ban 防止暴力攻击

2. 文件权限

   - 设置适当的文件访问权限：`chmod -R 750 /var/www/shortlink-backend`
   - 保护配置文件：`chmod 600 .env`

3. 定期更新

   - 系统更新：`sudo apt update && sudo apt upgrade` 或 `sudo yum update`
   - 依赖包更新：`npm audit fix`
   - 安装安全补丁

4. 监控告警
   - 设置资源使用告警
   - 配置错误日志监控
   - 考虑使用 Prometheus + Grafana 监控系统

## 8. 备份策略

### 8.1 数据库备份

```bash
# 创建备份目录
sudo mkdir -p /var/backups/mongodb
sudo chown -R mongodb:mongodb /var/backups/mongodb

# 创建备份脚本
sudo nano /usr/local/bin/backup-mongodb.sh
```

添加以下内容：

```bash
#!/bin/bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/mongodb"
mongodump --db shortlink --out $BACKUP_DIR/$TIMESTAMP
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \;
```

设置权限并创建定时任务：

```bash
sudo chmod +x /usr/local/bin/backup-mongodb.sh
sudo crontab -e
```

添加以下内容：

```
0 2 * * * /usr/local/bin/backup-mongodb.sh
```

### 8.2 应用备份

- 定期备份配置文件
- 使用 Git 管理代码版本
- 保存环境变量配置

## 9. 扩展建议

### 9.1 负载均衡

- 使用 PM2 的 cluster 模式
- 配置多实例部署
- 考虑使用 Nginx 负载均衡多台服务器

### 9.2 监控系统

- 集成 Prometheus + Grafana
- 使用 Node Exporter 监控系统资源
- 配置 MongoDB Exporter 监控数据库

### 9.3 日志管理

- 集成 ELK Stack (Elasticsearch, Logstash, Kibana)
- 配置日志轮转
- 使用 Filebeat 收集日志

## 10. 性能优化指南

为了使短链接服务能够承受高并发访问，我们实施了一系列性能优化措施。这些优化主要针对短链接跳转功能，因为这是系统中最频繁使用的功能。

### 10.1 多级缓存策略

我们实现了三级缓存机制，大幅减少数据库查询次数：

1. **内存缓存 (LRU 算法)**

   - 位置：`src/utils/memoryCache.js`
   - 特点：访问速度最快，直接从应用内存中获取
   - 容量：默认缓存 10000 个短链接，可通过环境变量`MEMORY_CACHE_CAPACITY`调整
   - 策略：使用 LRU(最近最少使用)算法，当缓存满时淘汰最久未使用的项

2. **Redis 缓存**

   - 位置：通过`src/config/redis.js`配置
   - 特点：持久化缓存，多实例间共享
   - 策略：使用动态过期时间，热门链接缓存更长时间

3. **MongoDB 数据库**
   - 作为最终数据源，当缓存全部未命中时查询
   - 已针对短链接查询创建了高效索引

### 10.2 动态缓存时间策略

我们实现了基于访问频率的动态缓存时间调整：

- 位置：`src/utils/cacheStrategy.js`
- 访问计数：记录每个短链接的访问次数
- 动态调整：
  - 访问超过 10000 次：缓存 7 天
  - 访问超过 1000 次：缓存 1 天
  - 访问超过 100 次：缓存 12 小时
  - 访问超过 10 次：缓存 6 小时
  - 默认：缓存 1 小时

这种策略确保热门链接有更长的缓存时间，减少缓存失效导致的数据库查询。

### 10.3 请求限流保护

为防止服务器被恶意请求攻击，我们实现了多层限流保护：

- 位置：`src/middleware/rateLimiter.js`
- 短链接跳转限流：每 IP 每分钟最多 60 次请求
- API 接口限流：每 IP 每 15 分钟最多 100 次请求
- 登录接口限流：每 IP 每小时最多 10 次失败尝试
- 全局限流：每 IP 每分钟最多 1000 次请求

限流配置可根据实际流量情况进行调整。

### 10.4 服务器性能优化

我们对服务器配置进行了多项优化：

1. **响应压缩**

   - 使用`compression`中间件减少网络传输量
   - 针对不同类型的内容配置了智能压缩策略

2. **安全增强**

   - 使用`helmet`中间件添加安全 HTTP 头
   - 防止常见的 Web 安全攻击

3. **连接优化**

   - 增加请求队列长度：`backlog=511`
   - 优化超时设置：15 秒
   - 增加最大连接数：10000

4. **优雅关闭**
   - 实现了服务器优雅关闭机制
   - 确保在关闭前完成所有请求处理

### 10.5 缓存一致性维护

为确保数据一致性，我们实现了缓存更新机制：

- 当短链接被更新或删除时，自动清除对应的缓存
- 实现了`clearLinkCache`函数，同时清除内存缓存和 Redis 缓存
- 确保用户在更新链接后立即看到最新结果

### 10.6 性能监控与分析

我们添加了性能监控和分析工具：

- 位置：`scripts/analyze-performance.js`
- 功能：
  - 分析日志并生成性能报告
  - 统计缓存命中率、响应时间分布
  - 识别最热门和最慢的短链接
  - 监控错误率和类型

使用方法：

```bash
# 运行性能分析
npm run analyze
```

### 10.7 负载测试

我们提供了负载测试脚本，用于验证系统在高并发下的表现：

- 位置：`load-test.js`
- 使用方法：

```bash
# 运行负载测试
npm run test:load
```

测试会模拟不同级别的并发用户，从 10 用户逐步增加到 1000 用户，验证系统的稳定性和性能。

### 10.8 性能优化效果

通过以上优化，短链接服务在高并发场景下的表现有显著提升：

1. **响应速度**：大多数请求可在毫秒级完成
2. **缓存命中率**：在实际使用中可达 90%以上
3. **数据库负载**：大幅降低，仅处理约 10%的请求
4. **系统稳定性**：即使在高峰期也能保持稳定运行
