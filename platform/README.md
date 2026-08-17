# 衡析 CRM 业务分析与结算管理平台

首版内部数据工作台，支持本地目录同步、组合筛选、双线业务指标、负责人/服务商排名、明细查询和可扩展报表注册。

## 本地运行

项目默认读取仓库上级目录的 `csv_output`：

```powershell
npm.cmd run sync:data
npm.cmd run dev
```

访问 `http://localhost:3000`。`npm run dev` 启动前也会自动同步一次。

如需读取其他目录，可修改 `config/local-source.json`，或设置环境变量 `CRM_DATA_DIR`。目录必须是经过授权的数据目录。

## 数据安全

- 本地同步只生成平台所需的业务字段，不包含客户、联系人、手机号、地址、统一社会信用代码、证件或银行卡信息。
- 本地快照为 `public/data/local-snapshot.json`，已在 `.gitignore` 中排除，不得提交或部署。
- 线上部署默认不携带任何业务快照，首次打开显示空状态；用户只可在浏览器本地导入数据。
- 原始 Excel 和 CSV 均保持只读；平台不回写 BH 公式或源数据。

## 扩展报表

报表目录位于 `app/lib/report-registry.ts`。每个报表声明：

- 数据集；
- 维度；
- 指标；
- 当前状态；
- 展示信息。

增加同类报表时先注册定义，再实现对应指标查询或导出模板，不需要修改本地目录扫描主流程。

## 验证

```powershell
npm.cmd run verify
```

`verify` 会依次执行代码规范检查、TypeScript 类型检查、生产依赖审计、生产构建、服务端渲染测试、本地快照泄漏检查和包体预算检查。

## 部署

- GitHub Actions 构建并验证 `linux/amd64` standalone 容器，随后发布到 `ghcr.io/hydintern3/crm-settlement`。
- 生产云主机只拉取已验证镜像，不在服务器上访问 Docker Hub、npm 或执行应用构建。
- 容器固定使用 Node.js 22.13.0，以非 root 用户运行，并提供 `/crm/api/health` 健康检查。
- 默认只监听云主机的 `127.0.0.1:3100`，由 Nginx/Caddy 提供反向代理和访问控制。
- 应用基础路径固定为 `/crm`；根路径不提供页面，可与现有站点共享同一 IP 和 Nginx 默认站点。
- 发布前必须执行 `npm run verify`，并确认构建目录不包含 `data/local-snapshot.json`。
- SheetJS `0.20.3` 固定保存在 `vendor/`，部署不依赖安装时访问外部 CDN；导入同时限制文件大小、工作表数和总行数。
- 图表与工作簿解析器按需加载，首屏 JavaScript 包体由自动测试限制在 350 KB 以内。

完整操作见仓库根目录的 `docs/cloud-host-deployment.md`。

当前结算候选仅供内部工作分流。年付、两年付、拆机、变更、服务商状态异常等场景继续保留人工复核。
