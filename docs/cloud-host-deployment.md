# Linux 云主机部署指南

本项目使用 Docker Compose 运行独立 Node.js 服务，不依赖 Sites、Cloudflare Worker、D1 或 R2。

## 1. 准备云主机

建议使用 64 位 Linux、2 核 CPU、2 GB 以上内存，并安装：

- Git；
- Docker Engine；
- Docker Compose 插件；
- Nginx 或 Caddy（需要域名和 HTTPS 时）。

安全组默认只开放 SSH、HTTP 80 和 HTTPS 443。应用端口 3000 默认绑定在主机回环地址，不直接暴露到公网。

## 2. 首次部署

```bash
git clone https://github.com/hydintern3/crm-settlement.git
cd crm-settlement
cp .env.deploy.example .env
docker compose build --pull
docker compose up -d
docker compose ps
curl http://127.0.0.1:3000/api/health
```

健康响应应为：

```json
{"status":"ok","service":"crm-analysis-platform"}
```

查看运行日志：

```bash
docker compose logs --tail=200 -f crm-platform
```

## 3. 域名和 HTTPS

1. 将域名 A/AAAA 记录指向云主机。
2. 把 `deploy/nginx/crm-platform.conf` 中的 `crm.example.com` 改成实际域名。
3. 将配置复制到 Nginx 的站点目录，执行 `nginx -t` 后重载 Nginx。
4. 使用 Certbot 或公司统一证书系统签发 HTTPS 证书。

Nginx 会把公网的 80/443 请求转发到 `127.0.0.1:3000`，无需向公网开放 3000 端口。

如果暂时只使用 IP 和端口访问，可在 `.env` 中设置：

```dotenv
BIND_ADDRESS=0.0.0.0
APP_PORT=3000
```

随后重新执行 `docker compose up -d`。此方式必须同时在云安全组中把 3000 端口限制为公司出口 IP 或 VPN 网段，不建议对全网开放。

## 4. 公司访问控制

当前应用本身不包含登录系统。公司内部上线建议至少采用以下一种边界：

- 仅允许公司 VPN/办公网访问；
- 云安全组限制公司固定出口 IP；
- 在 Nginx、Caddy 或公司网关增加统一身份认证。

浏览器导入的 Excel/CSV 不上传服务器，也不会共享给其他同事。每位用户需要在自己的浏览器中导入数据，刷新页面后重新导入；只有计算规则偏好保存在该浏览器中。

## 5. 更新版本

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d --remove-orphans
docker compose ps
curl http://127.0.0.1:3000/api/health
```

Compose 会重建应用容器。由于服务器不保存业务数据，此过程不需要迁移 CRM 数据。

## 6. 回滚

部署前记录当前提交：

```bash
git rev-parse HEAD
```

需要回滚时切换到已知正常的提交并重建：

```bash
git switch --detach <commit-sha>
docker compose build
docker compose up -d
```

恢复到最新版时执行 `git switch main`，再按更新步骤部署。

## 7. 停止服务

```bash
docker compose down
```

该操作只停止并删除应用容器和网络；项目源代码仍保留在云主机上。
