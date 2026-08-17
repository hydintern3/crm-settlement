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
```

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

`/crm` 只是路径隔离，不提供身份认证。如果 80 端口对公网开放，必须继续使用公司 VPN、安全组白名单、Nginx访问控制或统一身份网关。

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
