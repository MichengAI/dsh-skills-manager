// 批量操作的纯逻辑：顺序执行、结果分组、预检分类。
// 不读写文件、不发请求；调用方注入单项执行函数，便于单测。

export type BatchOp = "install" | "uninstall" | "update" | "rollback";
export type BatchStatus = "ok" | "failed" | "skipped" | "notRun";
export type PreviewBucket = "updatable" | "unchanged" | "local-modified";

export interface BatchOutcome {
  status: BatchStatus;
  error?: unknown;
  /** skipped 时的原因码，例如 "conflict" / "localModified" / "upstreamRemoved"。 */
  reason?: string;
}

export interface SequentialResult<T> {
  results: { item: T; outcome: BatchOutcome }[];
  /** 因 shouldStop 提前结束时，已执行的项数。 */
  stoppedAt?: number;
}

export type BatchRunner<T> = (item: T, index: number) => Promise<BatchOutcome | void>;
export type ProgressCallback<T> = (index: number, item: T) => void;
export type StopPredicate<T> = (index: number, item: T, outcome: BatchOutcome) => boolean;

/**
 * 顺序执行每个条目，单项失败不中断。
 * 返回逐项结果；shouldStop 为真时把剩余项标记为 notRun。
 */
export async function runSequential<T>(
  items: T[],
  run: BatchRunner<T>,
  onProgress?: ProgressCallback<T>,
  shouldStop?: StopPredicate<T>
): Promise<SequentialResult<T>> {
  const results: { item: T; outcome: BatchOutcome }[] = [];
  let stoppedAt: number | undefined;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    onProgress?.(index, item);
    let outcome: BatchOutcome;
    try {
      outcome = (await run(item, index)) || { status: "ok" };
    } catch (error) {
      outcome = { status: "failed", error };
    }
    results.push({ item, outcome });
    if (shouldStop?.(index, item, outcome)) {
      stoppedAt = index + 1;
      break;
    }
  }
  const start = stoppedAt === undefined ? items.length : stoppedAt;
  for (let index = start; index < items.length; index++) {
    results.push({ item: items[index], outcome: { status: "notRun" } });
  }
  return stoppedAt === undefined ? { results } : { results, stoppedAt };
}

/** 根据 preview 结果把更新项归入三类；localModified 优先于 updatable。 */
export function classifyPreview(preview: { changes?: unknown[]; localModified?: boolean } | null | undefined): PreviewBucket {
  if (!preview || !Array.isArray(preview.changes) || preview.changes.length === 0) return "unchanged";
  return preview.localModified ? "local-modified" : "updatable";
}

/** 统计结果状态数量，用于结果摘要（不含 notRun 的默认展示）。 */
export function countOutcomes(results: { outcome: BatchOutcome }[]): Record<BatchStatus, number> {
  const counts: Record<BatchStatus, number> = { ok: 0, failed: 0, skipped: 0, notRun: 0 };
  for (const result of results) counts[result.outcome.status]++;
  return counts;
}
