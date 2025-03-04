#!/bin/bash

# 停止并删除旧容器
docker-compose down

# 构建新镜像
docker-compose build

# 启动服务
docker-compose up -d

# 等待服务启动
sleep 10

# 初始化 MongoDB 副本集
docker exec shortlink-mongo mongosh --eval "rs.initiate()"

# 运行数据库初始化脚本
docker exec shortlink-api npm run seed:prod

# 显示运行状态
docker-compose ps 