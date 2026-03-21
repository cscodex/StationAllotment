import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ResetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId?: string | null;
  roundName: string | null;
  roundNumber: number;
}

export default function ResetModal({ open, onOpenChange, roundId, roundName, roundNumber }: ResetModalProps) {
  const [progress, setProgress] = useState(0);
  const [resetCompleted, setResetCompleted] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [liveProgress, setLiveProgress] = useState<{
    status: string;
    processed: number;
    total: number;
    bucket: string;
    currentStudent?: {
      name: string;
      meritNumber: number;
      appNo: string;
      gender: string;
      category: string;
      result: string;
      allottedDistrict?: string;
    } | null;
  } | null>(null);

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!roundId) throw new Error("Round not selected");
      setIsPolling(true);
      const res = await apiRequest("POST", `/api/counseling-rounds/${roundId}/reset-allocation`);
      const data = await res.json();
      return data;
    },
    onSuccess: (data) => {
      setResetCompleted(true);
      setIsPolling(false);
      setProgress(100);
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/allocation/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "✅ Reset Completed",
        description: `Cleared ${data.clearedStudents} student allocations and restored ${data.restoredVacancies} vacancies.`,
        duration: 8000,
      });
    },
    onError: (error) => {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsPolling(false);
      setProgress(0);
    },
  });

  useEffect(() => {
    if (!isPolling || !roundId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/allocation/progress/${roundId}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setLiveProgress(data);
          if (data.total > 0) {
            setProgress(Math.round((data.processed / data.total) * 100));
          }
        }
      } catch (e) { /* ignore polling errors */ }
    }, 500);
    return () => clearInterval(interval);
  }, [isPolling, roundId]);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setProgress(0);
      setResetCompleted(false);
      setLiveProgress(null);
    }, 300);
  };

  const handleStartReset = () => {
    resetMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {resetCompleted ? "✅ Reset Successful" : "Reset Allocation Data"}
          </DialogTitle>
          <DialogDescription>
            {resetCompleted 
              ? `Counseling Round ${roundNumber} has been successfully reset.` 
              : `This will clear all allotted district/stream data for students and restore vacancy seats.`}
          </DialogDescription>
        </DialogHeader>

        {progress === 0 && !resetCompleted && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              <p className="font-semibold mb-2">Are you sure you want to reset?</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>All students with an allocated seat will be marked as "Pending"</li>
                <li>Allotted district, stream, and school data will be cleared</li>
                <li>All vacancy counts will be restored to their original total seats</li>
                <li>The round status will be reverted to pre-allocation</li>
              </ul>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button variant="destructive" onClick={handleStartReset} disabled={resetMutation.isPending}>
                Yes, Reset Data
              </Button>
            </div>
          </div>
        )}

        {progress > 0 && !resetCompleted && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{liveProgress?.bucket || 'Processing...'}</span>
                <span className="font-mono font-bold">{progress}%</span>
              </div>
              <Progress value={progress} className="w-full h-3" />
            </div>
            {liveProgress?.currentStudent && (
              <div className="p-3 mt-4 rounded-lg bg-red-50 border-2 border-red-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-red-800 font-bold mb-0.5 tracking-wide">CLEARING RECORD</div>
                    <div className="font-semibold text-sm text-gray-900">{liveProgress.currentStudent.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Merit #{liveProgress.currentStudent.meritNumber} • {liveProgress.currentStudent.appNo}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${
                        liveProgress.currentStudent.category === 'WHH' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                        liveProgress.currentStudent.category === 'Disabled' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                        liveProgress.currentStudent.category === 'Private' ? 'bg-teal-100 text-teal-800 border-teal-300' :
                        'bg-blue-100 text-blue-800 border-blue-300'
                      }`}
                    >
                      {liveProgress.currentStudent.gender === 'Female' ? '♀' : '♂'} {liveProgress.currentStudent.category}
                    </span>
                    <div className="mt-2 text-xs font-semibold text-red-600">
                      ✗ Releasing: {liveProgress.currentStudent.allottedDistrict || 'Seat'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {resetCompleted && (
          <div className="space-y-4 py-4 text-center">
            <div className="text-lg font-semibold text-green-700">All data cleared successfully</div>
            <p className="text-sm text-muted-foreground">The counseling round is now ready to be re-run.</p>
            <div className="flex justify-center pt-4">
              <Button onClick={handleClose}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
