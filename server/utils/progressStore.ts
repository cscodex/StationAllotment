// In-memory progress store for tracking upload progress
interface UploadProgress {
  uploadId: string;
  total: number;
  processed: number;
  percentage: number;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
}

class ProgressStore {
  private progress = new Map<string, UploadProgress>();

  setProgress(uploadId: string, progress: Partial<UploadProgress>) {
    const existing = this.progress.get(uploadId) || {
      uploadId,
      total: 0,
      processed: 0,
      percentage: 0,
      status: 'processing' as const,
    };

    const updated: UploadProgress = {
      ...existing,
      ...progress,
    };

    // Calculate percentage if total and processed are provided
    if (updated.total > 0) {
      updated.percentage = Math.round((updated.processed / updated.total) * 100);
    }

    this.progress.set(uploadId, updated);
  }

  getProgress(uploadId: string): UploadProgress | undefined {
    return this.progress.get(uploadId);
  }

  removeProgress(uploadId: string) {
    this.progress.delete(uploadId);
  }

  // Clean up old progress entries (older than 1 hour)
  cleanup() {
    // For now, we'll keep entries until explicitly removed
    // In production, you might want to add timestamps and auto-cleanup
  }
}

export const progressStore = new ProgressStore();


