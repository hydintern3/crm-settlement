import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CHART_SCHEMA_VERSION, DEFAULT_CHART_TEMPLATES, MAX_DASHBOARD_TEMPLATES, migrateChartDraft, parseChartDraft, type ChartTemplate, type ChartTemplateDraft } from "../chart-template.ts";

type DashboardFile = { schemaVersion: number; templates: ChartTemplate[] };
let dashboardMutationQueue: Promise<unknown> = Promise.resolve();

function dashboardPaths() {
  const root = resolve(process.env.CRM_DATA_DIR || resolve(process.cwd(), "work/server-data"), "dashboard");
  return { root, templates: resolve(root, "templates.json"), audit: resolve(root, "audit.jsonl") };
}

function cloneDefaults() {
  return structuredClone(DEFAULT_CHART_TEMPLATES) as ChartTemplate[];
}

async function ensureDashboardDirectory() {
  const paths = dashboardPaths();
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  return paths;
}

function serialize<T>(operation: () => Promise<T>) {
  const task = dashboardMutationQueue.then(operation, operation);
  dashboardMutationQueue = task.then(() => undefined, () => undefined);
  return task;
}

async function readDashboard(): Promise<DashboardFile> {
  const target = await ensureDashboardDirectory();
  try {
    const parsed = JSON.parse(await readFile(target.templates, "utf8")) as Partial<DashboardFile>;
    if (!Array.isArray(parsed.templates)) throw new Error("总览模板文件格式无效");
    const templates = parsed.templates.map((template) => {
      const sourceSchemaVersion = Number(template.schemaVersion ?? parsed.schemaVersion ?? 1);
      const migrated = migrateChartDraft(parseChartDraft(template), sourceSchemaVersion);
      const corrected = template.id === "system-provider-ranking" && sourceSchemaVersion < 8
        ? { ...migrated, title: "供应商分布", description: "按供应商汇总线路数与月平均计量，可滚动查看全部分类", chartType: "combo" as const, dimension: { field: "provider" as const }, measures: [{ field: "lines" as const, aggregation: "sum" as const }, { field: "monthlyMetering" as const, aggregation: "sum" as const }], options: { ...migrated.options, orientation: "horizontal" as const } }
        : template.id === "system-service-ranking" && sourceSchemaVersion < 8
          ? { ...migrated, title: "服务商分布", description: "按 I 服务编号汇总线路数与月平均计量，可滚动查看全部分类", chartType: "combo" as const, dimension: { field: "serviceCode" as const }, measures: [{ field: "lines" as const, aggregation: "sum" as const }, { field: "monthlyMetering" as const, aggregation: "sum" as const }], options: { ...migrated.options, topN: 12, orientation: "horizontal" as const, showLabels: false, showOther: false, size: "wide" as const, height: 420, smooth: false } }
          : migrated;
      return {
        ...template,
        ...corrected,
        schemaVersion: CHART_SCHEMA_VERSION,
      };
    });
    const missingDefaults = cloneDefaults().filter((systemTemplate) => !templates.some((template) => template.id === systemTemplate.id));
    return { schemaVersion: CHART_SCHEMA_VERSION, templates: [...templates, ...missingDefaults] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: CHART_SCHEMA_VERSION, templates: cloneDefaults() };
    throw error;
  }
}

async function writeDashboard(value: DashboardFile) {
  const target = await ensureDashboardDirectory();
  const temporary = `${target.templates}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target.templates);
}

async function audit(action: string, actor: string, details: Record<string, unknown>) {
  const target = await ensureDashboardDirectory();
  await appendFile(target.audit, `${JSON.stringify({ action, at: new Date().toISOString(), actor, ...details })}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function listChartTemplates() {
  const dashboard = await readDashboard();
  return dashboard.templates.sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt));
}

export async function createChartTemplate(input: unknown, actor: string) {
  return serialize(async () => {
    const dashboard = await readDashboard();
    if (dashboard.templates.filter((template) => !template.archived).length >= MAX_DASHBOARD_TEMPLATES) throw new Error(`最多保留 ${MAX_DASHBOARD_TEMPLATES} 个未归档图表模板`);
    const draft = parseChartDraft(input);
    const now = new Date().toISOString();
    const template: ChartTemplate = {
      ...draft,
      id: `chart-${randomBytes(10).toString("hex")}`,
      schemaVersion: CHART_SCHEMA_VERSION,
      revision: 1,
      system: false,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    dashboard.templates.push(template);
    await writeDashboard(dashboard);
    await audit("chart.create", actor, { id: template.id, revision: template.revision });
    return template;
  });
}

export async function updateChartTemplate(id: string, input: unknown, revision: unknown, actor: string) {
  return serialize(async () => {
    const dashboard = await readDashboard();
    const index = dashboard.templates.findIndex((template) => template.id === id);
    if (index < 0) throw new Error("图表模板不存在");
    const previous = dashboard.templates[index];
    if (!Number.isInteger(revision) || Number(revision) !== previous.revision) throw new Response(JSON.stringify({ error: "模板已在其他页面被更新，请刷新后重试" }), { status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    const draft = parseChartDraft(input);
    const template: ChartTemplate = { ...previous, ...draft, revision: previous.revision + 1, updatedAt: new Date().toISOString(), updatedBy: actor };
    dashboard.templates[index] = template;
    await writeDashboard(dashboard);
    await audit("chart.update", actor, { id, revision: template.revision, pinned: template.pinned, archived: template.archived });
    return template;
  });
}

export async function reorderChartTemplates(ids: unknown, actor: string) {
  return serialize(async () => {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new Error("图表排序参数无效");
    const dashboard = await readDashboard();
    const unique = [...new Set(ids)];
    const eligible = dashboard.templates.filter((template) => template.pinned && !template.archived);
    if (unique.length !== eligible.length || unique.some((id) => !eligible.some((template) => template.id === id))) throw new Error("图表排序列表与当前固定模板不一致，请刷新后重试");
    const now = new Date().toISOString();
    const orderMap = new Map(unique.map((id, index) => [id, (index + 1) * 10]));
    dashboard.templates = dashboard.templates.map((template) => orderMap.has(template.id) ? { ...template, order: orderMap.get(template.id)!, revision: template.revision + 1, updatedAt: now, updatedBy: actor } : template);
    await writeDashboard(dashboard);
    await audit("chart.reorder", actor, { ids: unique });
    return dashboard.templates.sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt));
  });
}

export function chartTemplateDraft(template: ChartTemplate): ChartTemplateDraft {
  return parseChartDraft(template);
}
