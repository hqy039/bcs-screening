# 乳腺癌筛查小程序（H5）+ 管理后台

零依赖 Node.js 服务：用户端 H5 问卷筛查 + 后台内容/账号/权限管理。

## 本地运行
```
node server.js
# 访问 http://localhost:8123/  （用户端）
# 访问 http://localhost:8123/admin （后台，默认 admin / admin123）
```

## 部署（免信用卡方案：Replit，推荐）
Replit 可从 GitHub 一键导入，无需信用卡，得到稳定的 `*.replit.app` 公开链接。
1. 打开 https://replit.com → 右上角 **Log in / Sign up** → 选 **Continue with Google / GitHub** 登录（无需绑卡）。
2. 登录后点左上角 **+ Create** → **Import from GitHub**。
3. 在仓库列表里选 **`hqy039/bcs-screening`**（公开仓库可直接导入；若弹窗要求授权，点 Authorize）。
4. 运行环境会自动识别为 **Node.js**，并读取仓库里的 `.replit`（`run = "npm start"`）。点绿色的 **Run ▶** 按钮启动，约 1–2 分钟构建完成。
5. 启动后，右上角会出现一个 **Webview / 打开网址** 图标（或点 **Deploy** 旁边的地球图标），你的稳定链接即：
   - 小程序 H5：`https://<项目名>.<用户名>.replit.app/`
   - 管理后台：`https://<项目名>.<用户名>.replit.app/admin`（默认 `admin` / `admin123`）
   - 也可在控制台 **Tools → 打开网页** / 地址栏直接拿到 `.replit.app` 域名分享给别人。
6. 想换名字：项目 **Settings（三个点）→ Rename** 改名，URL 随之变化。

> 说明：Replit 免费版在空闲一段时间后会休眠，别人打开时几秒唤醒（能正常打开，仅首次稍慢）；文件系统持久，改代码重新运行才会重置数据。部署后请尽快在后台「账号管理」修改默认密码 `admin123`。

## 备选（需信用卡验证）：Render
Render 免费版也要求绑定信用卡（仅验证、不扣费）。若你后续有卡：点下面按钮用 GitHub 登录 Render 一键部署，得到 `https://bcs-screening.onrender.com/`（小程序）与 `/admin`（后台）。
（本仓库已备好 `scripts/render_deploy.js`，有卡后我可直接用 API 帮你建服务并排错。）

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hqy039/bcs-screening)

## 备选（固定域名 + 永久卷，需本地装 flyctl）：Fly.io
仓库已含 `fly.toml` + `部署指南-Fly.md`：固定 `*.fly.dev` 域名 + 1GB 永久存储卷、不休眠、数据永久保存。但需在**你本机**装 flyctl 并跑几条命令（无网页一键导入）。

## 环境变量
- `PORT`：监听端口（默认 8123，云托管会自动注入）
- `DB_PATH`：数据文件路径（云托管挂持久卷时设为卷内路径，如 /data/db.json）

## 部署配置
- `.replit`：Replit 运行配置（run = npm start，Node 18）
- `render.yaml`：Render 一键部署蓝图
- `Dockerfile`：任意容器平台（CloudBase Run / Fly.io 等）镜像
- `fly.toml` + `部署指南-Fly.md`：Fly.io 部署
