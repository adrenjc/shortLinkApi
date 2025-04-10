# Shortlink Backend 部署指南 (Linux 环境)

## 环境要求

- Linux (Ubuntu/Debian/CentOS)
- Node.js 18.x 或更高版本
- MongoDB 6.0 或更高版本
- Git
- PM2 (用于进程管理)

## 1. 环境安装

### 1.1 Node.js 安装

```bash
# 使用nvm安装Node.js（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts

# 验证安装
node --version
npm --version
```

### 1.2 MongoDB 安装

```bash
# Ubuntu/Debian
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod

# CentOS/RHEL
echo '[mongodb-org-6.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/$releasever/mongodb-org/6.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-6.0.asc' | sudo tee /etc/yum.repos.d/mongodb-org-6.0.repo
sudo yum install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod

# 验证安装
mongod --version
```

### 1.3 Git 安装

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y git

# CentOS/RHEL
sudo yum install -y git

# 验证安装
git --version
```

### 1.4 PM2 安装

```bash
# 全局安装PM2
sudo npm install -g pm2

# 验证安装
pm2 --version
```

## 2. 项目部署

### 2.1 克隆项目

```bash
# 选择合适的目录
cd /var/www
sudo mkdir -p shortlink-backend
sudo chown $(whoami):$(whoami) shortlink-backend
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

- `MONGODB_URI`: MongoDB 连接字符串
- `JWT_SECRET`: JWT 密钥
- `PORT`: 应用端口号
- 其他必要的环境变量

### 2.4 创建日志目录

```bash
mkdir -p logs
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

## 4. 配置反向代理（可选）

### 4.1 Nginx 安装与配置

1. 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y nginx

# CentOS/RHEL
sudo yum install -y epel-release
sudo yum install -y nginx
```

2. 配置 Nginx 反向代理

创建配置文件：

```bash
sudo nano /etc/nginx/sites-available/shortlink-backend.conf
```

添加以下配置内容：

```nginx
upstream shortlink_backend {
    server 127.0.0.1:3000;
    # 如果使用 PM2 cluster 模式，可以添加多个实例
    # server 127.0.0.1:3001;
    # server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name your_domain.com;  # 替换为你的域名

    # SSL 配置（如果需要 HTTPS）
    # listen 443 ssl;
    # ssl_certificate      /etc/nginx/ssl/your_domain.crt;
    # ssl_certificate_key  /etc/nginx/ssl/your_domain.key;

    # 访问日志
    access_log  /var/log/nginx/shortlink.access.log;
    error_log   /var/log/nginx/shortlink.error.log error;

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

3. 启用配置并重启 Nginx

```bash
# 启用站点配置
sudo ln -s /etc/nginx/sites-available/shortlink-backend.conf /etc/nginx/sites-enabled/

# 验证Nginx配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx
```

4. 配置防火墙

```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# CentOS/RHEL (Firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 5. 维护指南

### 5.1 日常维护命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs

# 重启服务
pm2 restart shortlink-backend

# 停止服务
pm2 stop shortlink-backend

# 删除服务
pm2 delete shortlink-backend
```

### 5.2 更新部署

```bash
# 拉取最新代码
git pull

# 安装依赖
npm install

# 重启服务
pm2 restart shortlink-backend
```

### 5.3 日志管理

- 日志文件位置：`./logs/`
- 错误日志：`./logs/err.log`
- 输出日志：`./logs/out.log`

### 5.4 性能监控

```bash
# 查看实时监控面板
pm2 monit

# 查看性能统计
pm2 plus
```

## 6. 故障排除

### 6.1 常见问题

1. 服务无法启动

   - 检查端口是否被占用：`netstat -tulpn | grep 3000`
   - 检查环境变量配置
   - 查看错误日志：`pm2 logs`

2. MongoDB 连接失败

   - 验证 MongoDB 服务状态：`sudo systemctl status mongod`
   - 检查连接字符串配置
   - 确认防火墙设置

3. 内存占用过高
   - 检查 `ecosystem.config.js` 中的内存限制设置
   - 使用 `pm2 monit` 监控资源使用情况

### 6.2 性能优化建议

1. 根据服务器配置调整 `ecosystem.config.js` 中的实例数
2. 适当配置 MongoDB 索引
3. 启用压缩和缓存
4. 定期清理日志文件

## 7. 安全建议

1. 防火墙配置

   - 只开放必要端口
   - 限制 IP 访问范围

2. 文件权限

   - 设置适当的文件访问权限
   - 保护配置文件和密钥

3. 定期更新

   - 保持依赖包更新
   - 安装系统安全补丁

4. 监控告警
   - 设置资源使用告警
   - 配置错误日志监控

## 8. 备份策略

### 8.1 数据库备份

```bash
# 创建备份目录
sudo mkdir -p /var/backups/mongodb
sudo chown $(whoami):$(whoami) /var/backups/mongodb

# 设置crontab定时备份任务
crontab -e

# 添加以下内容（每天凌晨2点备份）
0 2 * * * cd /path/to/shortlink-backend && NODE_ENV=production node scripts/database-backup.js >> /var/backups/mongodb/cron.log 2>&1
```

### 8.2 应用备份

- 定期备份配置文件
- 使用 Git 管理代码版本
- 保存环境变量配置

## 数据库备份与恢复指南

本项目包含自动备份和恢复 MongoDB 数据库的脚本。这些工具可以帮助您定期备份数据，并在需要时恢复数据，保障系统安全。

### 前提条件

1. 确保已安装 MongoDB 数据库工具集，包括`mongodump`和`mongorestore`命令
2. 如果没有安装，可以按照以下步骤安装：

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get update
sudo apt-get install -y mongodb-clients
```

**CentOS/RHEL:**

```bash
sudo yum install -y mongodb-org-tools
```

### 手动备份数据库

您可以使用以下命令手动备份数据库：

```bash
# 生产环境
npm run backup

# 开发环境
npm run backup:dev
```

备份文件将保存在项目根目录的`backups`文件夹中，格式为`shortlink_[时间戳].gz`。

### 列出可用备份

要查看所有可用的备份，请运行：

```bash
# 生产环境
npm run restore list

# 开发环境
npm run restore:dev list
```

这将显示所有备份文件的列表，包括创建时间和文件大小。

### 恢复数据库

要从备份文件恢复数据库，请运行：

```bash
# 生产环境
npm run restore restore <备份文件名>

# 开发环境
npm run restore:dev restore <备份文件名>
```

例如：

```bash
npm run restore restore shortlink_2023-06-01T02-00-00.gz
```

执行恢复命令后，系统会提示确认，因为恢复操作会覆盖当前数据库内容。

### 设置自动备份

您可以设置定期自动备份，支持每日、每周或每月备份：

```bash
# 设置每日备份（默认）
npm run setup-backup

# 设置每周备份
npm run setup-backup weekly

# 设置每月备份
npm run setup-backup monthly
```

这将在 Linux 系统上自动设置相应的 crontab 定时任务。默认备份时间是凌晨 2:00，以减少对系统的影响。

### 备份存储管理

默认情况下，备份文件保存在项目根目录的`backups`文件夹中，系统会自动删除超过 7 天的备份文件。

您可以通过在环境变量文件(.env.production 或.env.development)中添加以下配置来自定义备份设置：

```
BACKUP_DIR=/custom/path/to/backups  # 自定义备份目录
BACKUP_RETENTION_DAYS=30            # 保留备份的天数
```

### 备份最佳实践

1. **定期验证备份**：定期测试恢复过程，确保备份有效
2. **外部存储**：考虑将备份文件复制到外部存储（如云存储）
3. **监控备份**：检查备份日志文件（./backups/backup.log）确保备份成功
4. **在进行重大更改前备份**：在进行数据库结构更改或大量数据更新前进行手动备份
5. **权限控制**：限制对备份文件的访问权限

### 备份错误排查

如果备份过程中遇到问题，请检查：

1. MongoDB 连接字符串是否正确
2. 备份目录是否有写入权限
3. 是否已安装 MongoDB 数据库工具
4. 查看备份日志（./backups/backup.log）获取详细错误信息

如有需要，可以手动执行 mongodump 命令进行备份：

```bash
mongodump --uri="mongodb://localhost:27017/shortlink" --gzip --archive=./manual-backup.gz
```

### 数据恢复错误排查

如果恢复过程中遇到问题，请检查：

1. 备份文件是否存在且未损坏
2. MongoDB 连接字符串是否正确
3. 是否有足够的数据库权限
4. 查看恢复日志（./backups/restore.log）获取详细错误信息

### 备份文件同步

为了确保数据安全，建议将备份文件同步到外部存储。本项目提供了将备份文件同步到外部目录或云存储(AWS S3)的功能。

#### 配置同步设置

在环境变量文件中配置以下参数：

```
# 本地外部目录同步
EXTERNAL_BACKUP_DIR=/path/to/external/storage

# AWS S3同步
S3_BUCKET=your-s3-bucket-name
S3_PREFIX=mongodb-backups/
```

#### 同步到外部本地目录

```bash
npm run sync-backup:local
```

此命令将备份文件同步到`EXTERNAL_BACKUP_DIR`指定的目录。

#### 同步到 AWS S3

使用前需先安装并配置 AWS CLI：

1. 安装 AWS CLI：

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

2. 配置 AWS 凭证：`aws configure`

然后运行同步命令：

```bash
npm run sync-backup:s3
```

此命令将备份文件同步到 S3 存储桶的指定路径。

#### 设置自动同步

您可以将同步命令添加到备份脚本之后，或设置另一个定时任务：

```bash
# 编辑crontab
crontab -e

# 添加以下内容（每天凌晨3点同步备份文件到S3）
0 3 * * * cd /path/to/shortlink-backend && npm run sync-backup:s3 >> /var/backups/mongodb/sync.log 2>&1
```

## 9. 扩展建议

### 9.1 负载均衡

- 使用 PM2 的 cluster 模式
- 配置多实例部署

### 9.2 监控系统

- 集成 APM 工具
- 使用 Grafana+Prometheus

### 9.3 日志管理

- 集成 ELK Stack
- 配置日志轮转

## 10. 联系与支持

如遇到问题，请联系：

- 技术支持邮箱：[your-email]
- 项目仓库：[repository-url]
- 文档地址：[docs-url]
