// 批量操作的预检分类；不读写文件、不发请求。

export type BatchOp = "install" | "uninstall" | "update" | "rollback";
export type BatchStatus = "ok" | "failed" | "skipped" | "notRun";
export type PreviewBucket = "updatable" | "unchanged" | "local-modified";

export interface BatchOutcome {
  status: BatchStatus;
  error?: unknown;
  /** skipped 时的原因码，例如 "conflict" / "localModified" / "upstreamRemoved"。 */
  reason?: string;
}

/** 根据 preview 结果把更新项归入三类；localModified 优先于 updatable。 */
export function classifyPreview(preview: { changes?: unknown[]; localModified?: boolean } | null | undefined): PreviewBucket {
  if (!preview || !Array.isArray(preview.changes) || preview.changes.length === 0) return "unchanged";
  return preview.localModified ? "local-modified" : "updatable";
}
