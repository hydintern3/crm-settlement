# 与 content-pipeline 共用云主机的完整部署步骤

CRM 平台固定运行在 `/crm/`，内部端口为 `127.0.0.1:3100`。现有 `content-pipeline` 继续使用 `/` 和 `127.0.0.1:5000`，两者使用独立 Docker Compose 项目和网络。

## 1. 部署前确认

在开发电脑推送最新代码：

```powershell
git push origin main
```

在云主机确认现有服务和目标端口：

```bash
sudo docker compose ls
sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
sudo ss -lntp | grep ':3100 ' || true
```

3100 端口应当没有输出。记录当前首页状态，作为部署后的对照：

```bash
curl -I http://127.0.0.1/
```

## 2. 获取或更新项目

首次部署：

```bash
sudo install -d -o dev03 -g dev03 /opt/crm-settlement
git clone https://github.com/hydintern3/crm-settlement.git /opt/crm-settlement
cd /opt/crm-settlement
```

如果目录已经存在：

```bash
cd /opt/crm-settlement
git status --short
git pull --ff-only
```

`git status --short` 在更新前应当没有输出。然后查看实际部署版本：

```bash
git log -1 --oneline
```

## 3. 配置独立内部端口

```bash
cd /opt/crm-settlement
cp -n .env.deploy.example .env
sed -i 's/^BIND_ADDRESS=.*/BIND_ADDRESS=127.0.0.1/' .env
sed -i 's/^APP_PORT=.*/APP_PORT=3100/' .env
cat .env
```

预期内容：

```dotenv
BIND_ADDRESS=127.0.0.1
APP_PORT=3100
```

不要把 `BIND_ADDRESS` 改成 `0.0.0.0`，也不需要在云安全组开放 3100。

## 4. 构建并启动 CRM

```bash
cd /opt/crm-settlement
sudo docker compose config
sudo docker compose up -d --build
sudo docker compose ps
curl --fail http://127.0.0.1:3100/crm/api/health
```

预期响应：

```json
{"status":"ok","service":"crm-analysis-platform"}
```

此时 CRM 只在主机内部可访问，尚未改变 Nginx。

## 5. 找到并备份现有 Nginx 配置

查找当前转发到 content-pipeline 的配置文件：

```bash
sudo grep -RIl "proxy_pass http://127.0.0.1:5000" \
  /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d
```

选择实际生效的配置文件。可通过下面的命令确认其绝对路径：

```bash
readlink -f /etc/nginx/sites-enabled/default
```

假设实际文件为 `/etc/nginx/sites-available/default`，先备份：

```bash
sudo cp -a /etc/nginx/sites-available/default \
  /etc/nginx/sites-available/default.before-crm
```

如果实际文件名不同，后续命令必须使用查到的真实文件，不要照搬 `default`。

## 6. 在现有 server 中增加 `/crm` 路由

打开现有配置：

```bash
sudo nano /etc/nginx/sites-available/default
```

在当前 `server { ... }` 内、现有的 `location /` 旁边加入以下两个区块。不要删除或修改原来转发到 `127.0.0.1:5000` 的 location：

```nginx
location = /crm {
    return 301 /crm/;
}

location /crm/ {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

仓库中的 `deploy/nginx/crm-location.conf` 保存了相同片段，供对照使用。

检查语法后平滑重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

只有 `nginx -t` 成功时才可以执行 reload。reload 不会停止现有 content-pipeline 容器。

## 7. 验证两个项目同时工作

```bash
# 原 content-pipeline 根路径仍应正常响应
curl -I http://127.0.0.1/

# /crm 自动补齐末尾斜杠
curl -I http://127.0.0.1/crm

# CRM 健康检查经过 Nginx 成功
curl --fail http://127.0.0.1/crm/api/health

# 两个 Compose 项目均应运行
sudo docker compose ls
```

浏览器访问：

```text
http://云主机IP/crm/
```

如果公司已有该服务器的内部地址，也可以使用 `http://现有地址/crm/`。

## 8. 访问与数据安全

- `/crm` 只是路径隔离，不提供登录认证；它继承现有 Nginx、VPN、安全组或公司网关的访问范围。
- 如果当前 80 端口对公网开放，CRM 路径也会对公网可见。正式使用前应通过公司 VPN、固定出口 IP、Nginx访问控制或统一身份网关进行限制。
- Excel/CSV 只在各自浏览器本地解析，不上传服务器，也不会自动共享给其他同事。
- 刷新页面后需要重新导入业务数据；服务器不保存 CRM 数据，无需备份业务数据库。

## 9. 日常更新

```bash
cd /opt/crm-settlement
git status --short
git pull --ff-only
sudo docker compose up -d --build
sudo docker compose ps
curl --fail http://127.0.0.1:3100/crm/api/health
curl --fail http://127.0.0.1/crm/api/health
```

查看日志：

```bash
cd /opt/crm-settlement
sudo docker compose logs --tail=200 -f crm-platform
```

## 10. 回滚

如果 CRM 容器异常，先只停止 CRM，不影响 content-pipeline：

```bash
cd /opt/crm-settlement
sudo docker compose down
```

如果需要撤销 Nginx 路由：

```bash
sudo cp -a /etc/nginx/sites-available/default.before-crm \
  /etc/nginx/sites-available/default
sudo nginx -t
sudo systemctl reload nginx
```

实际配置文件不是 `default` 时，使用第 5 步记录的真实路径及其备份文件。
