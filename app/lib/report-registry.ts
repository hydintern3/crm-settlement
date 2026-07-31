export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  dataset: "business" | "provider" | "settlement" | "target";
  dimensions: string[];
  metrics: string[];
  status: "ready" | "pending" | "planned";
  short: string;
  tone: "blue" | "green" | "amber" | "rose" | "violet" | "navy";
};

export const REPORTS: ReportDefinition[] = [
  {
    id: "annual-install-removal",
    name: "全年业务拆装情况",
    description: "月度新装、拆机、活跃、计量与拆装比",
    dataset: "business",
    dimensions: ["完工年月", "负责人", "计量规则"],
    metrics: ["线数", "月平均计量", "拆装比"],
    status: "ready",
    short: "拆装",
    tone: "blue",
  },
  {
    id: "sales-performance",
    name: "销售完成情况",
    description: "负责人线数、业务额、均值、贡献率与排名",
    dataset: "business",
    dimensions: ["负责人", "业务名称"],
    metrics: ["线数", "业务额", "业务均值", "贡献率"],
    status: "ready",
    short: "销售",
    tone: "green",
  },
  {
    id: "provider-ranking",
    name: "服务商进单排名",
    description: "服务商线数、月平均计量、占比与排名",
    dataset: "provider",
    dimensions: ["服务编号", "服务简称", "负责人"],
    metrics: ["线数", "月平均计量", "占比"],
    status: "ready",
    short: "进单",
    tone: "navy",
  },
  {
    id: "gross-margin-first-year",
    name: "新增量首年毛利",
    description: "按负责人分析已完成与未完成业务毛利",
    dataset: "settlement",
    dimensions: ["首年完工月", "负责人"],
    metrics: ["运营有效金额", "结算有效金额", "业务毛利"],
    status: "pending",
    short: "首年",
    tone: "amber",
  },
  {
    id: "gross-margin-second-year",
    name: "新增量次年毛利",
    description: "奖励与达量标准确认后启用正式计算",
    dataset: "settlement",
    dimensions: ["次年完工月", "负责人"],
    metrics: ["运营有效金额", "结算有效金额", "业务毛利"],
    status: "pending",
    short: "次年",
    tone: "violet",
  },
  {
    id: "settlement-by-business",
    name: "结算按业务汇总",
    description: "运营商业务子项、审核差异、开票与付款批次",
    dataset: "settlement",
    dimensions: ["服务编号", "服务名称", "付款批次"],
    metrics: ["业务金额", "支付金额", "审核差异", "开票金额"],
    status: "planned",
    short: "结算",
    tone: "rose",
  },
  {
    id: "provider-removal",
    name: "服务商拆机排名",
    description: "年度拆机线数、业务量、占比与分类",
    dataset: "provider",
    dimensions: ["拆机年月", "服务商", "负责人"],
    metrics: ["拆机线数", "月平均计量", "拆机率"],
    status: "ready",
    short: "拆机",
    tone: "rose",
  },
  {
    id: "monthly-payment",
    name: "预计支付及发票跟踪",
    description: "预计支付、已付未付、收票与前期结转",
    dataset: "settlement",
    dimensions: ["结算方式", "预计支付期间"],
    metrics: ["支付金额", "待收发票", "已支付", "未支付"],
    status: "planned",
    short: "发票",
    tone: "violet",
  },
  {
    id: "target-progress",
    name: "年度目标进度",
    description: "年度目标、季度分解、完成率和年度对比",
    dataset: "target",
    dimensions: ["年度", "季度", "业务", "负责人"],
    metrics: ["目标", "完成额", "完成率"],
    status: "pending",
    short: "目标",
    tone: "green",
  },
];
