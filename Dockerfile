# 乳腺健康自查 - 云托管(CloudBase Run) 部署镜像
# 零依赖 Node 项目：无需 npm install，直接运行 server.js
FROM node:18-alpine

WORKDIR /app

# 复制全部项目文件（含 data/db.json 作为首次种子）
COPY . .

# 服务端口（云托管会注入 PORT，这里给默认便于本地验证）
EXPOSE 8123
ENV PORT=8123

# 启动。DB_PATH 由云托管控制台在「服务设置-环境变量」中设为持久卷路径（如 /data/db.json）
CMD ["node", "server.js"]
