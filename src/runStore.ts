import type { ResponsesResponse } from './types';

export interface RunRecord {
  id: string;
  query: string;
  timestamp: number;
  status: 'completed' | 'failed';
  toolsUsed: string[];
  response: ResponsesResponse;
}

const STORAGE_KEY = 'uaip-runs';

export function saveRun(run: RunRecord): void {
  const runs = getRuns();
  runs.unshift(run);
  // Keep last 50 runs
  if (runs.length > 50) runs.length = 50;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

export function getRuns(): RunRecord[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
