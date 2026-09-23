import { config } from '../config';
import { StoredAnalysis } from '../types';

/**
 * In-memory store of analyzed images + results, keyed by analysis_id.
 * Entries expire after config.analysisTtlMs. Not shared across processes.
 */
const analyses = new Map<string, StoredAnalysis>();

export function saveAnalysis(entry: StoredAnalysis): void {
  const id = entry.result.analysis_id;
  analyses.set(id, entry);
  // unref so pending TTL timers don't keep the process alive on shutdown
  setTimeout(() => analyses.delete(id), config.analysisTtlMs).unref();
}

export function getAnalysis(analysisId: string): StoredAnalysis | undefined {
  return analyses.get(analysisId);
}
