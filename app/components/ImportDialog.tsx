"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";

type CsvRow = Record<string, string>;

type ImportedSnapshot = {
  mode: "local";
  generatedAt: string;
  source: { label: string; files: string[]; currentFile: string };
  summary: {
    total: number;
    active: number;
    installs: number;
    removals: number;
    monthlyMetering: number;
    review: number;
  };
  monthly: Array<{ month: string; installs: number; removals: number; amount: number }>;
  meteringRules: Array<{ label: string; value: number; color: string }>;
  owners: Array<{ key: string; label: string; lines: number; amount: number; share: number }>;
  providers: Array<{ key: string; label: string; secondary: string; lines: number; amount: number; share: number }>;
  rows: Array<{
    businessType: string;
    businessName: string;
    owner: string;
    serviceCode: string;
    serviceName: string;
    completedDate: string;
    activeStatus: string;
    meteringRule: string;
    lines: number;
    monthlyMetering: number;
  }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (snapshot: ImportedSnapshot) => void;
};

function parseCsv(text: string): CsvRow[] {
  const matrix: string[][] = [];
  let row: string[] = [];
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
      if (row.some(Boolean)) matrix.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    matrix.push(row);
  }

  const headers = (matrix.shift() || []).map((value) => value.replace(/^\uFEFF/, "").trim());
  return matrix.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ""])),
  );
}

function numeric(value: string) {
  const parsed = Number(String(value || "").replace(/[￥¥,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: string) {
  const match = String(value || "").match(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : String(value || "").slice(0, 10);
}

function ranking(rows: CsvRow[], keyField: string, labelField: string, secondaryField?: string) {
  const groups = new Map<string, { key: string; label: string; secondary?: string; lines: number; amount: number }>();
  for (const row of rows) {
    const key = row[keyField] || "待确认";
    const item = groups.get(key) || {
      key,
      label: row[labelField] || "待确认",
      secondary: secondaryField ? row[secondaryField] : undefined,
      lines: 0,
      amount: 0,
    };
    item.lines += 1;
    item.amount += numeric(row["月平均计量"]);
    groups.set(key, item);
  }
  const total = [...groups.values()].reduce((sum, item) => sum + item.amount, 0) || 1;
  return [...groups.values()]
    .sort((left, right) => right.amount - left.amount)
    .map((item) => ({ ...item, share: (item.amount / total) * 100 }));
}

async function createSnapshot(files: File[]): Promise<ImportedSnapshot> {
  const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith(".csv"));
  if (!csvFiles.length) throw new Error("没有找到 CSV 文件，请选择 CSV 文件或包含 CSV 的目录。");

  const parsed = await Promise.all(
    csvFiles.map(async (file) => ({ file, rows: parseCsv(await file.text()) })),
  );
  const businessCandidates = parsed.filter(({ rows }) => rows[0]?.["业务属性"] !== undefined && rows[0]?.["月平均计量"] !== undefined);
  const business = businessCandidates.find(({ file }) => file.name.includes("2期")) || businessCandidates[0];
  if (!business) throw new Error("未识别到业务数据表，需要包含“业务属性”和“月平均计量”字段。");

  const provider = parsed.find(({ rows }) => rows[0]?.["服务编号"] !== undefined && rows[0]?.["服务状态"] !== undefined);
  const providers = new Map((provider?.rows || []).map((row) => [row["服务编号"], row]));
  const rows = business.rows;
  const isInstall = (row: CsvRow) => row["业务属性"] === "新装";
  const isRemoval = (row: CsvRow) => row["业务属性"] === "拆机";
  const isActive = (row: CsvRow) => row["活跃状态"] === "活跃";

  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: String(index + 1).padStart(2, "0"), installs: 0, removals: 0, amount: 0,
  }));
  const ruleCounts = new Map<string, number>();
  for (const row of rows) {
    const completed = dateValue(row["完工日期"] || row["初始完工日期"]);
    if (completed.startsWith("2026-")) {
      const item = monthly[Number(completed.slice(5, 7)) - 1];
      if (item) {
        if (isInstall(row)) item.installs += 1;
        if (isRemoval(row)) item.removals += 1;
        item.amount += numeric(row["月平均计量"]);
      }
    }
    const rule = row["计量规则"] || "待确认";
    ruleCounts.set(rule, (ruleCounts.get(rule) || 0) + 1);
  }

  const ruleColors: Record<string, string> = {
    新增量: "#2764e7", 新量: "#27a184", 存量: "#d89a3b", 超期: "#ad6788", 待确认: "#8d98a7",
  };
  const review = rows.filter((row) => {
    const providerRow = providers.get(row["I 服务编号"]);
    const mayCalculate =
      isInstall(row) && row["付费周期"] === "月" && isActive(row) &&
      !!providerRow && ["服务中", "激活服务"].includes(providerRow["服务状态"]) && providerRow["计算状态"] === "计算中";
    return !mayCalculate;
  }).length;

  return {
    mode: "local",
    generatedAt: new Date().toISOString(),
    source: { label: "浏览器本地导入", files: csvFiles.map((file) => file.name), currentFile: business.file.name },
    summary: {
      total: rows.length,
      active: rows.filter(isActive).length,
      installs: rows.filter(isInstall).length,
      removals: rows.filter(isRemoval).length,
      monthlyMetering: rows.reduce((sum, row) => sum + numeric(row["月平均计量"]), 0),
      review,
    },
    monthly,
    meteringRules: [...ruleCounts.entries()].map(([label, value]) => ({ label, value, color: ruleColors[label] || ruleColors.待确认 })),
    owners: ranking(rows, "负责人", "负责人"),
    providers: ranking(rows, "I 服务编号", "I 服务简称", "I 服务编号").map((item) => ({ ...item, secondary: item.secondary || item.key })),
    rows: rows.slice(0, 1000).map((row) => ({
      businessType: row["业务属性"], businessName: row["业务名称"], owner: row["负责人"],
      serviceCode: row["I 服务编号"], serviceName: row["I 服务简称"],
      completedDate: dateValue(row["完工日期"] || row["初始完工日期"]), activeStatus: row["活跃状态"],
      meteringRule: row["计量规则"], lines: 1, monthlyMetering: numeric(row["月平均计量"]),
    })),
  };
}

export function ImportDialog({ open, onClose, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("支持 1期、2期和服务商信息 CSV；同时选择时优先采用 2期作为当前快照。");

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [open, onClose]);

  async function importFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setStatus("working");
    setMessage(`正在读取 ${fileList.length} 个文件并建立分析视图…`);
    try {
      const next = await createSnapshot([...fileList]);
      onImported(next);
      setStatus("idle");
      setMessage("导入完成。");
      onClose();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "导入失败，请检查文件格式。");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void importFiles(event.dataTransfer.files);
  }

  if (!open) return null;
  return (
    <div className="import-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="import-header">
          <div><span className="section-label">DATA IMPORT</span><h2 id="import-title">导入业务数据</h2></div>
          <button className="dialog-close" onClick={onClose} aria-label="关闭导入窗口">×</button>
        </header>
        <div className="import-notice"><strong>数据不会上传</strong><span>文件直接在当前浏览器中解析，关闭或刷新页面后恢复为演示数据。</span></div>
        <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <span className="drop-icon">表</span>
          <h3>拖入 CSV 文件，或选择导入方式</h3>
          <p>建议同时选择“2期.csv”和“服务商信息.csv”，便于复核结算资格。</p>
          <div className="import-actions">
            <button className="primary-button" disabled={status === "working"} onClick={() => fileInput.current?.click()}>选择 CSV 文件</button>
            <button className="ghost-button" disabled={status === "working"} onClick={() => folderInput.current?.click()}>选择整个目录</button>
          </div>
          <input ref={fileInput} className="hidden-input" type="file" accept=".csv,text/csv" multiple onChange={(event) => void importFiles(event.target.files)} />
          <input ref={(node) => { folderInput.current = node; node?.setAttribute("webkitdirectory", ""); }} className="hidden-input" type="file" multiple onChange={(event) => void importFiles(event.target.files)} />
        </div>
        <div className={`import-status ${status}`}><i />{message}</div>
        <footer className="import-footer"><span>原始 Excel 公式文件不会被修改或回写。</span><button className="text-button" onClick={onClose}>暂不导入</button></footer>
      </section>
    </div>
  );
}
