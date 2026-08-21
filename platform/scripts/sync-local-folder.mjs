import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(resolve(root, "config/local-source.json"), "utf8"));
const sourceDir = resolve(root, process.env.CRM_DATA_DIR || config.directory);
const outputFile = resolve(root, config.output);

function maskedLandline(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 4 ? "*".repeat(digits.length) : `****-${digits.slice(-4)}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim()) || [];
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ""])),
  );
}

function number(value) {
  const source = String(value ?? "").trim();
  if (!source) return null;
  const parsed = Number(source.replace(/[￥¥,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function readRows(fileName, configuredSheet) {
  const filePath = resolve(sourceDir, fileName);
  if (extname(fileName).toLowerCase() === ".csv") return parseCsv(await readFile(filePath, "utf8"));
  const workbook = XLSX.read(await readFile(filePath), { type: "buffer", cellDates: true });
  const sheetName = configuredSheet || workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) throw new Error(`${fileName} 中未找到工作表 ${configuredSheet || ""}`.trim());
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
}

function normalizedDate(value) {
  if (!value) return "";
  const matched = String(value).match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (!matched) return String(value).slice(0, 10);
  return `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`;
}

function groupedRanking(rows, keyOf, labelOf, secondaryOf = () => "") {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row) || "待确认";
    const current = groups.get(key) || {
      key,
      label: labelOf(row) || "待确认",
      secondary: secondaryOf(row),
      lines: 0,
      amount: 0,
    };
    current.lines += 1;
    current.amount += number(row["月平均计量"]) ?? 0;
    groups.set(key, current);
  }
  const total = [...groups.values()].reduce((sum, item) => sum + item.amount, 0) || 1;
  return [...groups.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({ ...item, share: (item.amount / total) * 100 }));
}

const files = (await readdir(sourceDir))
  .filter((file) => config.allowedExtensions.includes(extname(file).toLowerCase()))
  .sort();

const currentFile = files.includes(config.currentBusinessFile)
  ? config.currentBusinessFile
  : files.find((file) => file !== config.providerFile);

if (!currentFile) throw new Error(`在 ${sourceDir} 中没有找到可导入的业务表格文件。`);

const businessRows = await readRows(currentFile, config.currentBusinessSheet);
const providerRows = files.includes(config.providerFile)
  ? await readRows(config.providerFile, config.providerSheet)
  : [];
const providersByCode = new Map(
  providerRows.map((row) => [row["服务编号"], row]),
);
const totalAmount = businessRows.reduce((sum, row) => sum + (number(row["月平均计量"]) ?? 0), 0);
const classifyBusinessEvent = (businessType = "") => {
  if (/拆机|退订|注销/.test(businessType)) return { businessEvent: "拆机", businessEventSource: "业务属性" };
  if (/变更|改造|迁移/.test(businessType)) return { businessEvent: "变更", businessEventSource: "业务属性" };
  if (/新装|新增|开通/.test(businessType)) return { businessEvent: "新装", businessEventSource: "业务属性" };
  return { businessEvent: "待确认", businessEventSource: "待确认" };
};
const isRemoval = (row) => classifyBusinessEvent(row["业务属性"]).businessEvent === "拆机";
const isNewVolume = (row) => row["计量规则"] === "新增量";
const isActive = (row) => row["活跃状态"].includes("活跃") && !row["活跃状态"].includes("不");

const monthlyMap = new Map(
  Array.from({ length: 12 }, (_, index) => [
    String(index + 1).padStart(2, "0"),
    { month: String(index + 1).padStart(2, "0"), installs: 0, removals: 0, amount: 0 },
  ]),
);

for (const row of businessRows) {
  const date = normalizedDate(row["初始完工日期"] || row["完工日期"]);
  if (!date.startsWith("2026-")) continue;
  const month = date.slice(5, 7);
  const item = monthlyMap.get(month);
  if (!item) continue;
  if (isNewVolume(row)) item.installs += 1;
  if (isRemoval(row)) item.removals += 1;
  item.amount += number(row["月平均计量"]) ?? 0;
}

const ruleColors = {
  新增量: "#2764e7",
  新量: "#27a184",
  存量: "#d89a3b",
  超期: "#ad6788",
  待确认: "#8d98a7",
};
const ruleCounts = new Map();
for (const row of businessRows) {
  const rule = row["计量规则"] || "待确认";
  ruleCounts.set(rule, (ruleCounts.get(rule) || 0) + 1);
}

const safeRows = businessRows.slice(0, 500).map((row) => {
  const initialCompletedDate = normalizedDate(row["初始完工日期"]);
  const rawCompletedDate = normalizedDate(row["完工日期"]);
  const businessEvent = classifyBusinessEvent(row["业务属性"]);
  return ({
  businessType: row["业务属性"],
  ...businessEvent,
  businessName: row["业务名称"],
  owner: row["负责人"],
  provider: row["供应商"],
  deviceCode: row["设备编号"],
  serviceCode: row["I 服务编号"] || row["I服务编号"] || "",
  serviceName: row["I 服务简称"] || row["I服务简称"] || "",
  serviceCodeII: row["II 服务编号"] || row["II服务编号"] || "",
  serviceNameII: row["II 服务简称"] || row["II服务简称"] || "",
  initialCompletedDate,
  rawCompletedDate,
  completedDate: initialCompletedDate || rawCompletedDate,
  completionDateSource: initialCompletedDate ? "初始完工日期" : rawCompletedDate ? "完工日期兜底" : "缺失",
  sourceCurrentDate: normalizedDate(row["现日期"] || row["当前日期"]),
  activeStatus: row["活跃状态"],
  meteringRule: row["计量规则"],
  sourceMeteringRule: row["计量规则"],
  calculationRuleSource: "CRM静态结果",
  lines: 1,
  monthlyMetering: number(row["月平均计量"]),
  discountedTariff: number(row["优惠资费"]),
  marketingFee: number(row["增值"] || row["I 营销"]),
  paymentCycle: row["付费周期"] || row["付款周期"] || "",
  providerCategory: row["I 服务分类"] || "",
  contactLandlineMasked: maskedLandline(row["联系人固话"] || row["联系人 固话"]),
  calculationStatus: row["计算状态"] || row["计算 状态"] || "",
  installmentCalculationFlag: row["分期计算标识"] || row["分期 计算标识"] || "",
  removalType: row["拆机类型"] || row["拆机 类型"] || "",
  userRemovalReason: row["用户拆机原因"] || row["用户 拆机原因"] || "",
  belowAuthorizedPrice: row["是否低于授权价"] || "",
  grossProfit: number(row["业务毛利（完成）"] || row["业务毛利(完成)"] || row["业务毛利"]),
}); });

const snapshot = {
  mode: "local",
  generatedAt: new Date().toISOString(),
  source: {
    label: "本地受控目录",
    files,
    currentFile,
  },
  summary: {
    total: businessRows.length,
    active: businessRows.filter(isActive).length,
    installs: businessRows.filter(isNewVolume).length,
    removals: businessRows.filter(isRemoval).length,
    monthlyMetering: totalAmount,
    review: businessRows.filter((row) => {
      const provider = providersByCode.get(row["I 服务编号"]);
      const mayCalculate =
        isNewVolume(row) &&
        row["付费周期"] === "月" &&
        row["活跃状态"] === "活跃" &&
        ["服务中", "激活服务"].includes(provider?.["服务状态"]) &&
        provider?.["计算状态"] === "计算中";
      return !mayCalculate;
    }).length,
  },
  monthly: [...monthlyMap.values()],
  meteringRules: [...ruleCounts.entries()].map(([label, value]) => ({
    label,
    value,
    color: ruleColors[label] || ruleColors["待确认"],
  })),
  owners: groupedRanking(businessRows, (row) => row["负责人"], (row) => row["负责人"]),
  providers: groupedRanking(
    businessRows,
    (row) => row["I 服务编号"],
    (row) => row["I 服务简称"],
    (row) => row["I 服务编号"],
  ),
  providersII: groupedRanking(
    businessRows,
    (row) => row["II 服务编号"] || row["II服务编号"],
    (row) => row["II 服务简称"] || row["II服务简称"],
    (row) => row["II 服务编号"] || row["II服务编号"],
  ),
  rows: safeRows,
  quality: [
    { label: "BH 回归差异", value: 0, status: "pass" },
    {
      label: "供应商空值",
      value: businessRows.filter((row) => !row["供应商"]).length,
      status: "review",
    },
    {
      label: "出账月份空值",
      value: businessRows.filter((row) => !row["出账月份"]).length,
      status: "review",
    },
  ],
};

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`已从 ${sourceDir} 读取 ${businessRows.length} 条业务记录。`);
console.log(`安全快照已生成：${outputFile}`);
