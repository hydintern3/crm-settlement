# CRM 业务分析与结算平台

本仓库包含 CRM 业务数据分析、质量检查、报表和结算准备工作台。应用代码位于 `platform/`，原始 Excel、CSV、本地快照和分析输出均不进入版本控制或发布包。

## 本地开发

```powershell
cd platform
npm.cmd ci
npm.cmd run dev
```

开发模式会从受控的本地数据目录生成忽略提交的快照。原始工作簿保持只读，平台不会回写 BH 公式。

## 提交前验证

```powershell
cd platform
npm.cmd run verify
```

该命令覆盖代码规范、类型、生产依赖审计、生产构建、服务端渲染、发布包数据泄漏和包体预算检查。GitHub Actions 会对 `main` 分支和 Pull Request 自动执行相同检查。

## 云主机部署

| 设置 | 值 |
| --- | --- |
| 推荐系统 | 64 位 Linux |
| 运行方式 | Docker Compose |
| 容器端口 | `3000` |
| 默认监听 | `127.0.0.1:3000` |

```bash
cp .env.deploy.example .env
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

域名、HTTPS、防火墙、更新和回滚步骤见 [`docs/cloud-host-deployment.md`](docs/cloud-host-deployment.md)。

线上构建不携带本地业务快照。毛利、目标、正式结算、收付、销账和发票等缺少输入时保持空状态，不生成模拟金额。
