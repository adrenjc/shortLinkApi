#!/bin/bash

# 设置错误时退出
set -e

echo "开始更新 Shortlink Backend..."

# 检查工作目录
if [ ! -d "/var/www/shortlinkapi" ]; then
    echo "错误: 应用目录不存在"
    exit 1
fi

# 进入项目目录
cd /var/www/shortlinkapi

# 拉取最新代码
echo "拉取最新代码..."
git pull

# 安装依赖
echo "更新依赖..."
npm install

# 清理 Nginx 缓存
echo "清理 Nginx 缓存..."
sudo rm -rf /var/cache/nginx/*
sudo systemctl reload nginx

# 重启应用
echo "重启应用..."
pm2 reload shortlink-backend

# 显示状态
echo -e "\n当前服务状态："
echo "-------------------"
echo "应用状态:"
pm2 list | grep "shortlink-backend"
echo "Nginx 状态:"
sudo systemctl status nginx --no-pager | grep "Active:"

echo "更新完成！"
echo "可以使用以下命令查看日志："
echo "pm2 logs shortlink-backend" 