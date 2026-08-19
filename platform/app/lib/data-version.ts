import type { Snapshot } from "./data-model";

export type DataMappingQuality = {
  status: "ready" | "warning" | "unusable";
  mappedRows: number;
  unmappedRows: number;
};

const BUSINESS_MAPPING_FIELDS = [
  "deviceCode", "businessType", "businessName", "owner", "provider", "serviceCode", "serviceName",
  "completedDate", "activeStatus", "meteringRule", "monthlyMetering", "paymentCycle",
] as const;

function isMeaningful(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return Boolean(normalized) && !/^(?:-|--|待确认|未知)$/.test(normalized);
}

export function assessDataMappingQuality(snapshot: Pick<Snapshot, "rows">): DataMappingQuality {
  const mappedRows = snapshot.rows.filter((row) => BUSINESS_MAPPING_FIELDS.some((field) => isMeaningful(row[field]))).length;
  const unmappedRows = snapshot.rows.length - mappedRows;
  return {
    mappedRows,
    unmappedRows,
    status: unmappedRows === 0 ? "ready" : unmappedRows > mappedRows ? "unusable" : "warning",
  };
}

export type DataVersionFile = {
  name: string;
  storedName: string;
  size: number;
  sha256: string;
};

export type DataVersionManifest = {
  schemaVersion: 1;
  kind?: "upload" | "composed";
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  files: DataVersionFile[];
  selectedBusinessSheets: string[];
  selectedProviderSheet: string | null;
  rowCount: number;
  deduplication: Snapshot["source"]["deduplication"] | null;
  snapshotSha256: string;
  sourceVersionIds?: string[];
  quality?: DataMappingQuality;
};

export type CurrentDataResponse = { version: DataVersionManifest; snapshot: Snapshot };
