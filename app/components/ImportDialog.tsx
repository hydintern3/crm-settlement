"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Snapshot } from "../lib/data-model";
import { inspectWorkbookFiles, snapshotFromSheets, type InspectedSheet } from "../lib/workbook-import";

type Props = { open: boolean; onClose: () => void; onImported: (snapshot: Snapshot) => void };

const ACCEPT = ".csv,.xls,.xlsx,.xlsm,.xlsb,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ImportDialog({ open, onClose, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("支持多个文件和多工作表；所有解析均在当前浏览器完成。");
  const [sheets, setSheets] = useState<InspectedSheet[]>([]);
  const [businessIds, setBusinessIds] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");

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
      const next = await inspectWorkbookFiles([...fileList]);
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

  function confirm() {
    try {
      const snapshot = snapshotFromSheets(sheets, businessIds, providerId || undefined);
      onImported(snapshot);
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
        <div className="import-notice"><strong>本地解析</strong><span>不会上传文件，不修改原始 Excel，也不会把 CSV 结果回写为公式。</span></div>
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
          <fieldset className="business-sheet-fieldset"><legend>业务工作表（可多选汇总）</legend>
            <div className="business-sheet-options">{businessSheets.map((sheet) => <label key={sheet.id} className={businessIds.includes(sheet.id) ? "selected" : ""}><input type="checkbox" checked={businessIds.includes(sheet.id)} onChange={() => toggleBusiness(sheet.id)} /><span><strong>{sheet.fileName} / {sheet.sheetName}</strong><small>{sheet.rowCount} 行</small></span></label>)}</div>
            {businessIds.length > 1 && <p className="merge-warning">将合并 {businessIds.length} 个业务工作表、共 {businessSheets.filter((sheet) => businessIds.includes(sheet.id)).reduce((sum, sheet) => sum + sheet.rowCount, 0)} 行。请确认这些 sheet 可以按当前统计口径相加。</p>}
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
          <span>加密工作簿需先另存为未加密副本；密码不会保存到网站。</span>
          <div className="footer-actions"><button className="text-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!businessIds.length || status === "working"} onClick={confirm}>汇总所选工作表</button></div>
        </footer>
      </section>
    </div>
  );
}
