// In-memory progress store for allocation runs
// Each allocation writes progress here; the frontend polls it

export interface AllocationProgressData {
  status: 'idle' | 'resetting' | 'running' | 'completed' | 'error';
  processed: number;
  total: number;
  allottedCount: number;
  notAllottedCount: number;
  currentStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
    result: 'allotted' | 'not_allotted' | 'processing';
    allottedDistrict?: string;
    choiceNumber?: number;
  } | null;
  previousStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
    result: 'allotted' | 'not_allotted';
    allottedDistrict?: string;
    choiceNumber?: number;
  } | null;
  nextStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
  } | null;
  bucket: string; // e.g. "Female - WHH"
  logs: string[];
  startedAt: number;
}

const progressStore = new Map<string, AllocationProgressData>();

export function getProgress(roundId: string): AllocationProgressData | null {
  return progressStore.get(roundId) || null;
}

export function setProgress(roundId: string, data: Partial<AllocationProgressData>) {
  const existing = progressStore.get(roundId);
  if (existing) {
    Object.assign(existing, data);
  } else {
    progressStore.set(roundId, {
      status: 'idle',
      processed: 0,
      total: 0,
      allottedCount: 0,
      notAllottedCount: 0,
      currentStudent: null,
      previousStudent: null,
      nextStudent: null,
      bucket: '',
      logs: [],
      startedAt: Date.now(),
      ...data,
    });
  }
}

export function clearProgress(roundId: string) {
  progressStore.delete(roundId);
}

export function addLog(roundId: string, message: string) {
  const existing = progressStore.get(roundId);
  if (existing) {
    existing.logs.push(`[${new Date().toISOString()}] ${message}`);
    // Keep only last 50 logs to prevent memory bloat
    if (existing.logs.length > 50) {
      existing.logs = existing.logs.slice(-50);
    }
  }
}
