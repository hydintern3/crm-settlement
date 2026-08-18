"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Snapshot } from "../lib/data-model";
import { inspectWorkbookFiles, snapshotFromSheets, type InspectedSheet } from "../lib/workbook-import";
import { BASE_PATH } from "../lib/deployment";

type Props = { open: boolean; onClose: () => void; onImported: (snapshot: Snapshot) => void };

const ACCEPT = ".csv,.xls,.xlsx,.xlsm,.xlsb,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ImportDialog({ open, onClose, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("支持多个文件和多工作表；所有解析均在当前浏览器完成。");
  const [sheets, setSheets] = useState<InspectedSheet[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [businessIds, setBusinessIds] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");
  const [label, setLabel] = useState("");

  const businessSheets = useMemo(() => sheets.filter((sheet) => sheet.kind === "business"), [sheets]);
  const providerSheets = useMemo(() => sheets.filter((sheet) => sheet.kind === "provider"), [sheets]);

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [open, onClose]);

  async function inspect(fileList: FileList | null) {
    if (!fileList?.length) return;
    setStatus("working");
    setMessage(`正在读取 ${fileList.length} 个文件并识别工作表…`);
    try {
      const selectedFiles = [...fileList].filter((file) => /\.(csv|xls|xlsx|xlsm|xlsb|ods)$/i.test(file.name));
      if (new Set(selectedFiles.map((file) => file.name.toLowerCase())).size !== selectedFiles.length) throw new Error("同一次上传不能包含同名文件，请先重命名。 ");
      const next = await inspectWorkbookFiles(selectedFiles);
      setFiles(selectedFiles);
      setSheets(next);
      const business = next.find((sheet) => sheet.kind === "business" && /2期/.test(`${sheet.fileName}${sheet.sheetName}`)) ?? next.find((sheet) => sheet.kind === "business");
      const provider = next.find((sheet) => sheet.kind === "provider");
      setBusinessIds(business ? [business.id] : []);
      setProviderId(provider?.id ?? "");
      setStatus("idle");
      setMessage(`已识别 ${next.length} 个工作表：业务表 ${next.filter((sheet) => sheet.kind === "business").length} 个，服务商表 ${next.filter((sheet) => sheet.kind === "provider").length} 个。`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "导入失败，请检查文件格式。");
    }
  }

  function toggleBusiness(id: string) {
    setBusinessIds((selected) => selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  async function confirm() {
    try {
      snapshotFromSheets(sheets, businessIds, providerId || undefined);
      setStatus("working");
      setMessage("正在上传、由服务器复核并发布不可变数据版本…");
      const form = new FormData();
      files.forEach((file) => form.append("files", file, file.name));
      form.set("businessIds", JSON.stringify(businessIds));
      form.set("providerId", providerId);
      form.set("label", label);
      const response = await fetch(`${BASE_PATH}/api/data/upload`, { method: "POST", body: form });
      const result = await response.json() as { snapshot?: Snapshot; version?: { id: string }; error?: string };
      if (!response.ok || !result.snapshot) throw new Error(result.error || "服务器未能发布数据版本");
      onImported(result.snapshot);
      setStatus("idle");
      onClose();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "无法建立数据快照。");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void inspect(event.dataTransfer.files);
  }

  if (!open) return null;
  return (
    <div className="import-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="import-header">
          <div><span className="section-label">DATA IMPORT</span><h2 id="import-title">导入业务数据</h2></div>
          <button className="dialog-close" onClick={onClose} aria-label="关闭导入窗口">×</button>
        </header>
        <div className="import-notice"><strong>服务器版本发布</strong><span>浏览器先预检工作表；确认后原文件和分析快照上传到受保护的数据卷，不修改原始 Excel，也不回写公式。</span></div>
        <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <span className="drop-icon">表</span>
          <h3>拖入 Excel / CSV，或选择文件与目录</h3>
          <p>支持 CSV、XLS、XLSX、XLSM、XLSB、ODS；一个工作簿中的多个 sheet 会分别识别。</p>
          <div className="import-actions">
            <button className="primary-button" disabled={status === "working"} onClick={() => fileInput.current?.click()}>选择文件</button>
            <button className="ghost-button" disabled={status === "working"} onClick={() => folderInput.current?.click()}>选择目录</button>
          </div>
          <input ref={fileInput} className="hidden-input" type="file" accept={ACCEPT} multiple onChange={(event) => void inspect(event.target.files)} />
          <input ref={(node) => { folderInput.current = node; node?.setAttribute("webkitdirectory", ""); }} className="hidden-input" type="file" accept={ACCEPT} multiple onChange={(event) => void inspect(event.target.files)} />
        </div>

        {sheets.length > 0 && <div className="sheet-picker">
          <label>版本名称（可选）
            <input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="例如：2026年8月财务确认版" />
          </label>
          <fieldset className="business-sheet-fieldset"><legend>业务工作表（可多选汇总）</legend>
            <div className="business-sheet-options">{businessSheets.map((sheet) => <label key={sheet.id} className={businessIds.includes(sheet.id) ? "selected" : ""}><input type="checkbox" checked={businessIds.includes(sheet.id)} onChange={() => toggleBusiness(sheet.id)} /><span><strong>{sheet.fileName} / {sheet.sheetName}</strong><small>{sheet.rowCount} 行</small></span></label>)}</div>
            {businessIds.length > 1 && <p className="merge-warning">将合并 {businessIds.length} 个业务工作表、共 {businessSheets.filter((sheet) => businessIds.includes(sheet.id)).reduce((sum, sheet) => sum + sheet.rowCount, 0)} 行，并按设备编号自动去重；重复时优先保留较高期次。请确认这些 sheet 可以按当前统计口径合并。</p>}
          </fieldset>
          <label>服务商工作表（可选）
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
              <option value="">暂不选择</option>
              {providerSheets.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.fileName} / {sheet.sheetName}（{sheet.rowCount} 行）</option>)}
            </select>
          </label>
          <div className="sheet-summary">
            {sheets.map((sheet) => <span key={sheet.id} className={`sheet-chip ${sheet.kind}`}>{sheet.sheetName} · {sheet.kind === "business" ? "业务" : sheet.kind === "provider" ? "服务商" : "未识别"} · {sheet.rowCount} 行</span>)}
          </div>
        </div>}

        <div className={`import-status ${status}`}><i />{message}</div>
        <footer className="import-footer">
          <span>加密工作簿需先另存为未加密副本；密码不会保存到网站。发布后可从版本历史回滚。</span>
          <div className="footer-actions"><button className="text-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!businessIds.length || status === "working"} onClick={() => void confirm()}>发布数据版本</button></div>
        </footer>
      </section>
    </div>
  );
}
