import type { Snapshot } from "./data-model";

export type DataVersionFile = {
  name: string;
  storedName: string;
  size: number;
  sha256: string;
};

export type DataVersionManifest = {
  schemaVersion: 1;
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
};

export type CurrentDataResponse = { version: DataVersionManifest; snapshot: Snapshot };
