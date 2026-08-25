# 乳腺癌筛查小程序（H5）+ 管理后台

零依赖 Node.js 服务：用户端 H5 问卷筛查 + 后台内容/账号/权限管理。

## 本地运行
```
node server.js
# 访问 http://localhost:8123/  （用户端）
# 访问 http://localhost:8123/admin （后台，默认 admin / admin123）
```

## 部署（免信用卡方案：Glitch，推荐）
Glitch 可从 GitHub 一键导入，无需信用卡，文件持久，得到稳定 `*.glitch.me` 链接。
1. 打开 https://glitch.com → 右上角 **Sign in** → 选 **Continue with GitHub**（用本项目 GitHub 账号登录）。
2. 登录后点 **New Project** → **Import from GitHub**。
3. 选仓库 `hqy039/bcs-screening`（公开仓库可直接导入；若提示授权，点 Authorize）。
4. Glitch 自动检测 `package.json` 的 `npm start` → 运行 `node server.js`，约 1–2 分钟启动完成。
5. 启动后左上角项目名 → **Share**，你的稳定链接即：
   - 小程序 H5：`https://<项目名>.glitch.me/`
   - 管理后台：`https://<项目名>.glitch.me/admin`（默认 `admin` / `admin123`）
6. 想换名字：项目 **Settings** 里改名，URL 随之变化。

> 说明：Glitch 免费版空闲约 5 分钟会休眠，别人打开时几秒唤醒（能正常打开，仅首次稍慢）；数据写在持久盘，休眠/唤醒后保留，重新部署（改代码）会重置为初始种子。部署后请尽快在后台修改默认密码 `admin123`。

## 备选（免信用卡）：Replit
replit.com → 登录（可 GitHub）→ **Create Repl** → **Import from GitHub** → 选 `hqy039/bcs-screening`，运行环境选 Node.js → **Run** → 得到 `https://<repl>.repl.co`（或 `.replit.app`）链接。

## 备选（需信用卡验证）：Render
Render 免费版也要求绑定信用卡（仅验证、不扣费）。若你后续有卡：点下面按钮用 GitHub 登录 Render 一键部署，得到 `https://bcs-screening.onrender.com/`（小程序）与 `/admin`（后台）。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hqy039/bcs-screening)

## 环境变量
- `PORT`：监听端口（默认 8123，云托管会自动注入）
- `DB_PATH`：数据文件路径（云托管挂持久卷时设为卷内路径，如 /data/db.json）

## 部署配置
- `render.yaml`：Render 一键部署蓝图
- `Dockerfile`：任意容器平台（CloudBase Run / Fly.io 等）镜像
- `fly.toml` + `部署指南-Fly.md`：Fly.io 部署（固定 `*.fly.dev` 域名 + 1GB 永久卷，需本地装 flyctl）
