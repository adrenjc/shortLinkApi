#!/bin/bash

# 设置颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "开始测试部署状态..."

# 检查容器状态
echo -e "\n${GREEN}检查容器状态:${NC}"
docker-compose ps

# 等待服务完全启动
echo -e "\n${GREEN}等待服务启动...${NC}"
sleep 5

# 测试健康检查接口
echo -e "\n${GREEN}测试健康检查接口:${NC}"
health_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
if [ $health_status -eq 200 ]; then
    echo "健康检查通过 ✅"
else
    echo -e "${RED}健康检查失败 ❌${NC}"
    echo "HTTP状态码: $health_status"
fi

# 测试注册接口
echo -e "\n${GREEN}测试注册接口:${NC}"
register_response=$(curl -s -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}')
echo $register_response

# 测试登录接口
echo -e "\n${GREEN}测试登录接口:${NC}"
login_response=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}')
echo $login_response

# 提取token（如果登录成功）
token=$(echo $login_response | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ ! -z "$token" ]; then
    echo -e "\n${GREEN}登录成功，获取到token ✅${NC}"
    
    # 测试需要认证的接口
    echo -e "\n${GREEN}测试创建短链接:${NC}"
    curl -X POST http://localhost:8080/api/links \
      -H "Content-Type: application/json" \
      -H "x-auth-token: $token" \
      -d '{"longUrl": "https://www.example.com"}'
else
    echo -e "\n${RED}登录失败，未获取到token ❌${NC}"
fi

# 检查数据库连接
echo -e "\n${GREEN}检查MongoDB副本集状态:${NC}"
docker-compose exec -T mongodb mongosh --eval "rs.status()"

echo -e "\n${GREEN}检查Redis连接:${NC}"
docker-compose exec -T redis redis-cli ping

echo -e "\n${GREEN}测试完成!${NC}" 