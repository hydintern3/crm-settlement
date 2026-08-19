# 与 content-pipeline 共用云主机的完整部署步骤

CRM 平台固定运行在 `/crm/`，内部地址为 `127.0.0.1:3100`。现有 `content-pipeline` 继续使用 `/` 和 `127.0.0.1:5000`。CRM 镜像由 GitHub Actions 在 `linux/amd64` 环境构建并发布到 GHCR，云主机不再访问 Docker Hub 或 npm。

## 1. 发布 GHCR 镜像

在开发电脑推送 `main`：

```powershell
git push origin main
```

进入 GitHub 仓库的 **Actions** 页面，等待 `CI` 工作流全部通过。成功后会发布：

```text
ghcr.io/hydintern3/crm-settlement:latest
ghcr.io/hydintern3/crm-settlement:<完整提交SHA>
```

第一次发布后，在 GitHub 个人主页的 **Packages → crm-settlement → Package settings** 检查可见性。仓库和镜像均不包含业务快照或密码，建议将该包设为 `Public`，这样云主机无需保存 GitHub令牌。

如果包必须保持私有，在 GitHub 创建只有 `read:packages` 权限的访问令牌。不要把令牌写入仓库、`.env` 或命令历史。

## 2. 云主机部署前确认

```bash
sudo docker compose ls
sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
sudo ss -lntp | grep ':3100 ' || true
curl -I http://127.0.0.1/
```

3100 端口应当没有监听；根路径应继续由 content-pipeline 正常响应。

确认 GHCR 网络可达：

```bash
curl -I --max-time 15 https://ghcr.io/v2/
```

`401` 或 `405` 都表示 Registry 已成功响应。

## 3. 获取或更新部署配置

首次部署：

```bash
sudo install -d -o dev03 -g dev03 /opt/crm-settlement
git clone https://github.com/hydintern3/crm-settlement.git /opt/crm-settlement
cd /opt/crm-settlement
```

目录已经存在时：

```bash
cd /opt/crm-settlement
git status --short
git pull --ff-only
```

更新前 `git status --short` 应当没有输出。记录版本：

```bash
git log -1 --oneline
```

## 4. 配置 Compose

```bash
cd /opt/crm-settlement
cp -n .env.deploy.example .env
```

确保 `.env` 包含：

```dotenv
BIND_ADDRESS=127.0.0.1
APP_PORT=3100
CRM_IMAGE=ghcr.io/hydintern3/crm-settlement:latest
CRM_ADMIN_USERNAME=admin
CRM_ADMIN_PASSWORD_HASH='scrypt$...'
CRM_SESSION_SECRET=至少32字节随机值
```

在可信开发机的 `platform/` 目录生成密码摘要（密码从标准输入读取）：

```bash
read -s -p 'CRM admin password: ' CRM_PASSWORD; echo
printf '%s' "$CRM_PASSWORD" | npm run admin:hash -- --stdin
unset CRM_PASSWORD
```

把输出写入云主机 `.env` 的 `CRM_ADMIN_PASSWORD_HASH`。会话密钥可用 `openssl rand -base64 48` 生成。不得把明文密码、摘要或会话密钥提交到 Git。

已有 `.env` 缺少镜像配置时追加：

```bash
grep -q '^CRM_IMAGE=' .env || \
  echo 'CRM_IMAGE=ghcr.io/hydintern3/crm-settlement:latest' >> .env
```

不要把 `BIND_ADDRESS` 改为 `0.0.0.0`，也不需要在云安全组开放 3100。

## 5. 拉取预构建镜像

公开包直接执行：

```bash
cd /opt/crm-settlement
sudo docker compose pull crm-platform
```

### 无法访问 GHCR：SCP 后一键离线更新（推荐）

离线镜像包固定使用 `latest`。仓库提供的脚本会自动校验压缩包、加载镜像、把 `.env` 中旧的提交 SHA 标签纠正为 `latest`、重建容器并等待健康检查；它不会拉取 GHCR，也不会删除或重建数据卷。

在 Windows 开发机上传镜像和校验文件：

```powershell
scp crm-settlement-linux-amd64.tar.gz `
  crm-settlement-linux-amd64.tar.gz.sha256 `
  dev03@<服务器IP>:/home/dev03/
```

然后在服务器执行一条命令：

```bash
sudo bash /opt/crm-settlement/deploy/offline-deploy.sh \
  /home/dev03/crm-settlement-linux-amd64.tar.gz
```

如果压缩包一直保存在默认位置 `/home/dev03/crm-settlement-linux-amd64.tar.gz`，路径也可以省略：

```bash
sudo bash /opt/crm-settlement/deploy/offline-deploy.sh
```

第一次运行时脚本可能显示“将 Compose 镜像固定为 latest”；以后不会再修改 `.env`，也不需要执行 `docker tag`。脚本只更新 `CRM_IMAGE` 这一项，管理员账号、密码摘要、会话密钥和其他配置保持不变。

如果返回 `denied` 或 `unauthorized`，说明 GHCR 包仍为私有。安全登录：

```bash
read -s -p 'GHCR token: ' GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | \
  sudo docker login ghcr.io -u hydintern3 --password-stdin
unset GHCR_TOKEN

sudo docker compose pull crm-platform
```

## 6. 启动 CRM

```bash
cd /opt/crm-settlement
sudo docker compose config
sudo docker compose up -d --no-build
sudo docker compose ps
curl --fail http://127.0.0.1:3100/crm/api/health
```

预期响应：

```json
{"status":"ok","service":"crm-analysis-platform"}
```

此过程只使用 GHCR 成品镜像，不执行 Dockerfile、Docker Hub 拉取或 npm 安装。

## 7. 接入现有 Nginx

查找当前转发到 content-pipeline 的生效配置：

```bash
NGINX_ACTIVE=$(sudo grep -RIl \
  "proxy_pass http://127.0.0.1:5000" \
  /etc/nginx/sites-enabled /etc/nginx/conf.d | head -n1)
NGINX_SITE=$(readlink -f "$NGINX_ACTIVE")
echo "$NGINX_SITE"
```

备份实际配置：

```bash
sudo cp -a "$NGINX_SITE" "${NGINX_SITE}.before-crm"
```

安装仓库提供的路由片段：

```bash
sudo install -d -m 755 /etc/nginx/snippets
sudo install -m 644 \
  /opt/crm-settlement/deploy/nginx/crm-location.conf \
  /etc/nginx/snippets/crm-location.conf
```

编辑现有站点：

```bash
sudo nano "$NGINX_SITE"
```

在当前 `server { ... }` 内、原有 `location /` 旁边加入：

```nginx
include /etc/nginx/snippets/crm-location.conf;
```

不要删除或修改原来转发到 `127.0.0.1:5000` 的 location。检查并平滑重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 上传文件大小配置

平台允许单次发布的原始表格总大小不超过 100 MB。由于浏览器使用
`multipart/form-data` 上传，框架和 Nginx 均预留到 110 MB。更新部署文件后，
必须重新安装 Nginx 片段并重载配置：

```bash
sudo install -m 644 \
  /opt/crm-settlement/deploy/nginx/crm-location.conf \
  /etc/nginx/snippets/crm-location.conf
sudo nginx -t
sudo systemctl reload nginx
sudo nginx -T | grep -n -A3 -B2 'client_max_body_size 110m'
```

如果上传时看到 `Payload Too Large`，先确认运行的是包含上传限制修复的新镜像，
再确认 `nginx -T` 的实际输出中 `/crm/` 路由包含上述 110 MB 配置。只修改仓库文件
但没有复制到 `/etc/nginx/snippets/` 并重载 Nginx，不会改变服务器当前配置。

## 8. 验证两个项目共存

```bash
curl -I http://127.0.0.1/
curl -I http://127.0.0.1/crm
curl --fail http://127.0.0.1/crm/api/health
sudo docker compose ls
```

浏览器访问：

```text
http://云主机IP/crm/
```

`/crm` 现在要求管理员登录，但生产仍必须启用 HTTPS，并建议继续使用公司 VPN、安全组白名单或统一身份网关。没有 HTTPS 时浏览器不会发送生产环境的 Secure 会话 Cookie。

首次登录后在“数据中心”上传表格并发布版本。数据写入 Docker 命名卷 `crm-data`，可用以下命令确认：

```bash
sudo docker volume inspect crm-settlement_crm-data
```

备份时先停止写入，再备份该卷；恢复后保持目录归属为容器内 `node` 用户。不要把卷内容复制进仓库或公开 Web 目录。

## 9. 日常更新

等待 GitHub Actions 成功发布新镜像后执行：

```bash
cd /opt/crm-settlement
git status --short
git pull --ff-only
sudo docker compose pull crm-platform
sudo docker compose up -d --no-build
sudo docker compose ps
curl --fail http://127.0.0.1:3100/crm/api/health
curl --fail http://127.0.0.1/crm/api/health
```

查看日志：

```bash
sudo docker compose logs --tail=200 -f crm-platform
```

## 10. 按提交版本回滚

GitHub Actions 同时发布提交 SHA 标签。把 `.env` 中的 `CRM_IMAGE` 改成已知正常版本：

```dotenv
CRM_IMAGE=ghcr.io/hydintern3/crm-settlement:<完整提交SHA>
```

然后执行：

```bash
cd /opt/crm-settlement
sudo docker compose pull crm-platform
sudo docker compose up -d --no-build
curl --fail http://127.0.0.1:3100/crm/api/health
```

只停止 CRM：

```bash
cd /opt/crm-settlement
sudo docker compose down
```

上述操作不会停止 content-pipeline。

应用镜像回滚与业务数据回滚相互独立：镜像使用提交 SHA 回滚；业务数据在管理员“数据中心”重新激活历史版本。`docker compose down` 不删除数据卷，禁止在未备份时使用 `docker compose down -v`。

离线环境需要回滚时，不要直接运行上述联网拉取命令。应加载对应历史镜像包并确保它带有 `.env` 指定的标签；恢复到日常更新后，再执行一键离线脚本把镜像配置切回 `latest`。
