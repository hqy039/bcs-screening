# 乳腺癌筛查小程序（H5）+ 管理后台

零依赖 Node.js 服务：用户端 H5 问卷筛查 + 后台内容/账号/权限管理。

## 本地运行
```
node server.js
# 访问 http://localhost:8123/  （用户端）
# 访问 http://localhost:8123/admin （后台，默认 admin / admin123）
```

## 一键部署到 Render（免费，稳定外网链接）
点击下面的按钮，用 GitHub 登录 Render，约 2–3 分钟即可得到固定外网地址：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hqy039/bcs-screening)

或手动：Render 控制台 → New → Web Service → 连接 GitHub 仓库 `hqy039/bcs-screening` → 选 `render.yaml` 蓝图 → Create Web Service。

部署完成后：
- 小程序 H5：`https://bcs-screening.onrender.com/`
- 管理后台：`https://bcs-screening.onrender.com/admin`（默认账号 `admin` / 密码 `admin123`，**请尽快在后台修改**）

> 说明：Render 免费版空闲约 15 分钟后会休眠，再次打开需 10–30 秒冷启动（能正常打开，仅首次稍慢）；数据写在容器文件系统，重新部署会重置为初始种子。如需后台数据/用户提交永久保存，可在 Render 升级并挂载磁盘，或改用带持久卷的方案。

## 环境变量
- `PORT`：监听端口（默认 8123，云托管会自动注入）
- `DB_PATH`：数据文件路径（云托管挂持久卷时设为卷内路径，如 /data/db.json）

## 部署配置
- `render.yaml`：Render 一键部署蓝图
- `Dockerfile`：任意容器平台（CloudBase Run / Fly.io 等）镜像
- `fly.toml` + `部署指南-Fly.md`：Fly.io 部署（固定 `*.fly.dev` 域名 + 1GB 永久卷）
