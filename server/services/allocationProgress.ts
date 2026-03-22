// In-memory progress store for allocation runs
// Each allocation writes progress here; the frontend polls it

export interface QueueProgress {
  currentStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
    counselingDistrict?: string;
    result: 'allotted' | 'not_allotted' | 'processing';
    allottedDistrict?: string;
    choiceNumber?: number;
    reason?: string;
    choices?: string[];
  } | null;
  previousStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
    counselingDistrict?: string;
    result: 'allotted' | 'not_allotted';
    allottedDistrict?: string;
    choiceNumber?: number;
    reason?: string;
  } | null;
  nextStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
    counselingDistrict?: string;
  } | null;
  message?: string;
  processedCount: number;
  allottedCount: number;
  deniedCount: number;
}

export interface DistrictCounter {
  district: string;
  mOpen: number;
  mDisabled: number;
  mPrivate: number;
  fOpen: number;
  fDisabled: number;
  fWHH: number;
  fPrivate: number;
  total: number;
}

export interface AllocationProgressData {
  status: 'idle' | 'resetting' | 'running' | 'completed' | 'error' | 'paused' | 'cancelled';
  isPaused: boolean;
  isCancelled: boolean;
  delayMs: number;
  processed: number;
  total: number;
  totalSeats: number;
  seatsFilled: number;
  allottedCount: number;
  notAllottedCount: number;
  queues: Record<string, QueueProgress>;
  districtCounters: DistrictCounter[];
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
      isPaused: false,
      isCancelled: false,
      delayMs: 100,
      processed: 0,
      total: 0,
      totalSeats: 0,
      seatsFilled: 0,
      allottedCount: 0,
      notAllottedCount: 0,
      queues: {},
      districtCounters: [],
      logs: [],
      startedAt: Date.now(),
      ...data,
    });
  }
}

// Helper to update a single queue's progress safely
export function setQueueProgress(roundId: string, queueKey: string, queueData: Partial<QueueProgress>) {
  const existing = progressStore.get(roundId);
  if (existing) {
    if (!existing.queues[queueKey]) {
      existing.queues[queueKey] = { currentStudent: null, previousStudent: null, nextStudent: null, processedCount: 0, allottedCount: 0, deniedCount: 0 };
    }
    Object.assign(existing.queues[queueKey], queueData);
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
