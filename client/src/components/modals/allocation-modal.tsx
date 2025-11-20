import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AcademicYearSelector } from "@/components/ui/academic-year-selector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Clock, Settings, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";

interface AllocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId?: string | null;
}

interface CounselingRound {
  id: string;
  academicYear: string;
  roundNumber: number;
  roundName: string | null;
  isActive: boolean;
  isCompleted: boolean;
}

export default function AllocationModal({ open, onOpenChange, roundId }: AllocationModalProps) {
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch round details if roundId is provided
  const { data: round } = useQuery<CounselingRound>({
    queryKey: ["/api/counseling-rounds", roundId],
    enabled: !!roundId,
    queryFn: async () => {
      if (!roundId) return null;
      const res = await fetch(`/api/counseling-rounds/${roundId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch round");
      return res.json();
    },
  });

  const allocationMutation = useMutation({
    mutationFn: async () => {
      if (!roundId || !round) {
        throw new Error("Round not selected");
      }

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);

      const result = await apiRequest("POST", `/api/counseling-rounds/${roundId}/run-allocation`);
      clearInterval(progressInterval);
      setProgress(100);
      return result;
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/allocation/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: "Allocation Completed",
        description: `Seat allocation completed for ${round?.roundName || `Round ${round?.roundNumber}`}. ${data.allottedStudents ? `Allotted ${data.allottedStudents} out of ${data.totalStudents} students.` : 'Allocation completed successfully.'}`,
      });
      setTimeout(() => {
        onOpenChange(false);
        setProgress(0);
      }, 2000);
    },
    onError: (error) => {
      toast({
        title: "Allocation Failed",
        description: error.message,
        variant: "destructive",
      });
      setProgress(0);
    },
  });

  const steps = [
    {
      title: "Data validation completed",
      completed: true,
      icon: Check,
    },
    {
      title: "Processing allocations...",
      completed: allocationMutation.isPending || progress < 100,
      icon: allocationMutation.isPending ? Settings : Check,
      loading: allocationMutation.isPending,
    },
    {
      title: "Generating reports",
      completed: progress === 100,
      icon: progress === 100 ? Check : Clock,
    },
  ];

  const canStart = roundId && round && round.isActive && !round.isCompleted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Running Seat Allocation</DialogTitle>
          <DialogDescription>
            {round ? (
              <>Running allocation for <strong>{round.roundName || `Round ${round.roundNumber}`}</strong> ({round.academicYear})</>
            ) : (
              "Processing student choices and vacancy data"
            )}
          </DialogDescription>
        </DialogHeader>
        
        {progress === 0 && round && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Counseling:</span>
                  <span className="text-sm">{round.roundName || `Round ${round.roundNumber}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Round Number:</span>
                  <span className="text-sm">{round.roundNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Academic Year:</span>
                  <span className="text-sm">{round.academicYear}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Status:</span>
                  <Badge variant={round.isActive ? "default" : "secondary"}>
                    {round.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>
            {!round.isActive && (
              <p className="text-xs text-amber-600 flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3" />
                <span>Round is not active. Round will activate automatically when start date/time is reached.</span>
              </p>
            )}
          </div>
        )}

        {progress > 0 && (
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  step.completed 
                    ? "bg-green-500 text-white" 
                    : step.loading 
                      ? "bg-primary animate-pulse" 
                      : "bg-muted"
                }`}>
                  {step.completed && <step.icon className="w-3 h-3" />}
                  {step.loading && <step.icon className="w-3 h-3 text-primary-foreground animate-spin" />}
                </div>
                <span className={`text-sm ${
                  step.completed ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        )}
        
        {progress > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span data-testid="allocation-progress">{progress}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {!allocationMutation.isPending && progress === 0 && (
          <div className="flex space-x-2">
            <Button 
              onClick={() => allocationMutation.mutate()}
              className="flex-1"
              data-testid="button-start-allocation"
              disabled={!canStart}
            >
              Start Allocation
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                onOpenChange(false);
                setProgress(0);
              }}
              className="flex-1"
              data-testid="button-cancel-allocation"
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
