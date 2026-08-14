export function AnalyticsPlaceholder({ onImport }: { onImport: () => void }) {
  return <section className="empty-dashboard"><strong>--</strong><h2>尚未导入业务数据</h2><p>页面不会加载演示或 mock 数据。导入 Excel / CSV 后即可使用图表、筛选、分页和模块分析。</p><button className="primary-button" onClick={onImport}>导入数据</button></section>;
}
