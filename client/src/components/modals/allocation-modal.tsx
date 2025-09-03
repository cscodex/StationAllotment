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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Clock, Settings } from "lucide-react";

interface AllocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AllocationModal({ open, onOpenChange }: AllocationModalProps) {
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const allocationMutation = useMutation({
    mutationFn: async () => {
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

      const result = await apiRequest("POST", "/api/allocation/run");
      clearInterval(progressInterval);
      setProgress(100);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allocation/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Allocation Completed",
        description: "Seat allocation has been completed successfully",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Running Seat Allocation</DialogTitle>
          <DialogDescription>
            Processing student choices and vacancy data
          </DialogDescription>
        </DialogHeader>
        
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
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span data-testid="allocation-progress">{progress}%</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>

        {!allocationMutation.isPending && progress === 0 && (
          <div className="flex space-x-2">
            <Button 
              onClick={() => allocationMutation.mutate()}
              className="flex-1"
              data-testid="button-start-allocation"
            >
              Start Allocation
            </Button>
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
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
