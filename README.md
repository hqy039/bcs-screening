# 乳腺癌筛查小程序（H5）+ 管理后台

零依赖 Node.js 服务：用户端 H5 问卷筛查 + 后台内容/账号/权限管理。

## 本地运行
```
node server.js
# 访问 http://localhost:8123/  （用户端）
# 访问 http://localhost:8123/admin （后台，默认 admin / admin123）
```

## 环境变量
- `PORT`：监听端口（默认 8123）
- `DB_PATH`：数据文件路径（云托管挂持久卷时设为卷内路径，如 /data/db.json）

## 部署
见 `render.yaml`（Render 一键部署）/ `Dockerfile`（任意容器平台）。
