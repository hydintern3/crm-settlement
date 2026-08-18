# CRM 业务数据分析与结算平台交接

最后更新：2026-08-18（Asia/Shanghai）

## 使用方式

1. 新会话先完整阅读 `AGENTS.md`，确认长期业务规则和安全边界。
2. 再阅读本文件，了解当前开发与部署状态。
3. 执行 `git status --short`、`git log -1 --oneline` 核对现场。本文件是交接快照，不替代 Git、代码、运行日志或财务最新确认口径。
4. 完成重要功能、部署排障或准备暂停工作时，直接更新本快照，并删除已经失效的临时信息。

严禁在本文件中写入密码、令牌、Cookie、私钥、工作簿密码、真实客户信息或完整业务数据。

## 当前仓库状态

- 分支：`main`
- 当前提交：`a1ba6a7f9a1b3904d10f6daf133154f6fa68c27a`
- 提交说明：`feat: implement dashboard template management with CRUD operations`
- 当前未提交改动：`AGENTS.md` 已修改，`HANDOFF.md` 为新增文件，均属于本次交接文档建设；提交后应刷新此项。
- 远端仓库：`hydintern3/crm-settlement`

## 已落地能力

- 管理员登录、服务端数据上传和数据版本管理。
- 可选择多个 CRM 全量数据版本，按设备编号去重并整合；空设备编号保留并进入质量检查。
- 已扩展联系人固话、计算状态、分期计算标识、拆机类型和用户拆机原因等字段支持，并增加更多筛选维度。
- 总览页支持自定义图表模板：柱状图、折线图、面积图、饼图、环形图、堆叠柱状图和散点图。
- 图表支持维度、系列、指标、聚合、排序、Top N 和尺寸配置；支持创建、编辑、复制、固定、取消固定、调整顺序、归档和恢复。
- 固定图表使用当前版本整合后的 `filteredRows`，与全局筛选、动态规则和数据版本联动；可查看聚合后的图表数据。
- 原有四张总览图已迁移为默认模板。

## 关键代码入口

- 图表模板定义：`platform/app/lib/chart-template.ts`
- 图表聚合：`platform/app/lib/chart-aggregation.ts`
- 服务端模板存储：`platform/app/lib/server/dashboard-store.ts`
- 图表模板接口：`platform/app/api/dashboard/templates/`
- 图表编辑器：`platform/app/components/ChartBuilder.tsx`
- 图表渲染与管理：`platform/app/components/AnalyticsCharts.tsx`
- 总览数据和筛选入口：`platform/app/page.tsx`
- 容器编排：`compose.yaml`
- Nginx 子路径配置示例：`deploy/nginx/crm-location.conf`
- 云主机部署说明：`docs/cloud-host-deployment.md`
- CI 与镜像发布：`.github/workflows/ci.yml`

## 最近验证结果

在提交 `a1ba6a7f9a1b3904d10f6daf133154f6fa68c27a` 上已完成：

- `npm run verify`：通过。
- 自动化测试：14 项通过。
- 依赖安全检查：无 high 级别漏洞。
- 浏览器检查：创建、保存、固定、筛选联动、刷新后持久化、模板管理、编辑流程和 390px 宽度响应式布局均通过。
- `AnalyticsCharts` 构建产物约 594.7 KB，接近 600 KB 预算；后续增加图表能力时需关注拆包和懒加载。

以上是历史提交的验证结果。任何新代码变更后都必须重新运行相应检查。

## 当前部署状态

- 云主机网络无法稳定访问 GHCR，当前采用“从 GitHub Actions 下载离线镜像，再通过 SCP 上传云主机”的部署方式。
- 最近一次已成功校验并加载离线包，Docker 中得到镜像 `ghcr.io/hydintern3/crm-settlement:latest`。
- Compose 随后尝试启动提交标签 `a1ba6a7f9a1b3904d10f6daf133154f6fa68c27a`，因本地不存在该标签且访问 GHCR 超时而失败。尚未确认服务器已完成最终部署。
- 根因：CI 离线包当前只保存 `latest` 标签，而服务器 `.env` 或 Compose 解析结果引用完整提交 SHA。

在服务器上可按以下方式补齐标签并强制离线启动：

```bash
sudo docker tag \
  ghcr.io/hydintern3/crm-settlement:latest \
  ghcr.io/hydintern3/crm-settlement:a1ba6a7f9a1b3904d10f6daf133154f6fa68c27a

cd /opt/crm-settlement
sudo docker compose up -d --no-build --pull never --force-recreate crm-platform
sudo docker compose ps
sudo docker compose logs --tail=200 crm-platform
```

启动后需继续验证：

```bash
curl -fsS http://127.0.0.1:3100/crm/api/health
sudo nginx -t
curl -kfsS https://<服务器IP>/crm/api/health
```

不得把真实密码或令牌复制到命令历史、交接文件或问题截图中。

## 部署关键约束

- 应用默认监听宿主机 `127.0.0.1:3100`，由 Nginx 对外代理 `/crm/`。
- `/crm/assets/` 必须单独代理到应用的 `/assets/`，否则页面静态资源会失败。
- 数据版本、上传文件、图表模板及审计记录必须落在持久化的 `CRM_DATA_DIR`；升级时保留 Compose 数据卷 `crm-settlement_crm-data`。
- 只有服务器 IP 也可以部署，但生产登录需要 HTTPS。直接使用 HTTP 可能因 Secure Cookie 无法保存而出现登录画面闪烁后返回登录页。
- 离线部署时使用 `--pull never`，并在启动前通过 `docker image inspect <完整镜像标签>` 确认 Compose 引用的标签确实存在。

## 待办与风险

1. 在服务器补充 SHA 标签并完成离线启动，确认健康检查、登录、数据版本和图表模板持久化均正常。
2. 改进 `.github/workflows/ci.yml`，让离线镜像包同时包含 `latest` 与提交 SHA 标签，避免每次在服务器手工补标签。此项尚未实施。
3. 确定只有 IP 场景下的 HTTPS 方案并验证浏览器信任链；最终方案尚未确认。
4. 图表模板目前采用服务器文件持久化，适合单实例部署；若未来扩展为多实例，需要迁移到共享数据库或对象存储，并处理并发写入。
5. 图表构建器只提供可审计的字段、聚合和展示配置，不支持任意脚本或任意公式；如扩展计算字段，必须设计安全表达式和版本审计。
6. 毛利、目标、正式结算、收付、销账和发票仍受输入数据与正式规则缺失限制，继续遵循 `AGENTS.md` 的人工复核边界。

## 下次交接更新清单

- 更新日期、分支、HEAD 提交和工作树状态。
- 将“当前部署状态”改为现场实际结果，不能把计划写成已完成。
- 记录本轮实际执行的测试、构建和部署验证；未执行项明确注明。
- 更新待办、阻塞项和风险，删除已经失效的信息。
- 新增长期有效的确认事实时，同时提炼到 `AGENTS.md`。
- 检查文档中不存在凭据、敏感业务数据或不必要的服务器标识。
