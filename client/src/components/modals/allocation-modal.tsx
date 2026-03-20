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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Clock, Settings, AlertTriangle, Trophy, BarChart3, Users } from "lucide-react";

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
  isAllocationCompleted: boolean;
  isAllocationFinalized: boolean;
}

interface AllocationResult {
  round: { id: string; roundName: string | null; roundNumber: number; academicYear: string };
  summary: { totalAllotted: number; districtSummary: Record<string, number> };
  cutoffs: Array<{ district: string; stream: string; gender: string; category: string; cutoffMerit: number; studentsAllotted: number }>;
  students: Array<{ id: string; name: string; meritNumber: number; appNo: string | null; allottedDistrict: string | null; allottedStream: string | null; allottedSchoolUdise: string | null; gender: string; category: string }>;
}

export default function AllocationModal({ open, onOpenChange, roundId }: AllocationModalProps) {
  const [progress, setProgress] = useState(0);
  const [allocationCompleted, setAllocationCompleted] = useState(false);
  const [runRoundId, setRunRoundId] = useState<string | null>(null);
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

  // Fetch allocation results once run is done
  const { data: results, isLoading: isLoadingResults } = useQuery<AllocationResult>({
    queryKey: ["/api/allocation/results", runRoundId],
    enabled: !!runRoundId && allocationCompleted,
    queryFn: async () => {
      const res = await fetch(`/api/allocation/results/${runRoundId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch results");
      return res.json();
    },
  });

  const allocationMutation = useMutation({
    mutationFn: async () => {
      if (!roundId || !round) throw new Error("Round not selected");

      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 88) { clearInterval(progressInterval); return 88; }
          return prev + 8;
        });
      }, 400);

      const res = await apiRequest("POST", `/api/counseling-rounds/${roundId}/run-allocation`);
      clearInterval(progressInterval);
      setProgress(100);
      const data = await res.json();
      return data;
    },
    onSuccess: (data) => {
      setRunRoundId(roundId!);
      setAllocationCompleted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/allocation/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/allocation/stats"] });
      toast({
        title: "✅ Allocation Completed",
        description: `Allotted ${data.allottedStudents} out of ${data.totalStudents} eligible students. View Results tab for details.`,
        duration: 8000,
      });
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

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setProgress(0);
      setAllocationCompleted(false);
      setRunRoundId(null);
    }, 300);
  };

  const steps = [
    { title: "Data validation completed", completed: true, icon: Check },
    {
      title: "Processing allocations...",
      completed: progress >= 100,
      icon: allocationMutation.isPending ? Settings : Check,
      loading: allocationMutation.isPending,
    },
    { title: "Generating results", completed: progress === 100, icon: progress === 100 ? Check : Clock },
  ];

  const canStart = roundId && round && round.isActive && !round.isCompleted;

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "Open": return "bg-blue-100 text-blue-800";
      case "Disabled": return "bg-amber-100 text-amber-800";
      case "WHH": return "bg-purple-100 text-purple-800";
      case "Private": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={allocationCompleted ? "max-w-5xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>
            {allocationCompleted ? "📊 Allocation Results" : "Running Seat Allocation"}
          </DialogTitle>
          <DialogDescription>
            {round ? (
              <>
                {allocationCompleted ? "Results for" : "Running allocation for"}{" "}
                <strong>{round.roundName || `Round ${round.roundNumber}`}</strong> ({round.academicYear})
              </>
            ) : (
              "Processing student choices and vacancy data"
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Pre-run state */}
        {progress === 0 && !allocationCompleted && round && (
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
                {(round.isAllocationCompleted || round.isAllocationFinalized) && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Allocation was previously run. Click Start to reset and re-run with fresh data.
                  </div>
                )}
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

        {/* Progress state */}
        {progress > 0 && !allocationCompleted && (
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  step.completed ? "bg-green-500 text-white" : step.loading ? "bg-primary animate-pulse" : "bg-muted"
                }`}>
                  {step.completed && <step.icon className="w-3 h-3" />}
                  {step.loading && <step.icon className="w-3 h-3 text-primary-foreground animate-spin" />}
                </div>
                <span className={`text-sm ${step.completed ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.title}
                </span>
              </div>
            ))}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span data-testid="allocation-progress">{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          </div>
        )}

        {/* Results state */}
        {allocationCompleted && (
          <div className="space-y-4">
            {isLoadingResults ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                Loading results...
              </div>
            ) : results ? (
              <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                    <Trophy className="w-5 h-5 text-green-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-green-700">{results.summary.totalAllotted}</div>
                    <div className="text-xs text-green-600">Total Allotted</div>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                    <BarChart3 className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-blue-700">{Object.keys(results.summary.districtSummary).length}</div>
                    <div className="text-xs text-blue-600">Districts Filled</div>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 text-center">
                    <Users className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-purple-700">{results.cutoffs.length}</div>
                    <div className="text-xs text-purple-600">Category Buckets</div>
                  </div>
                </div>

                <Tabs defaultValue="cutoffs">
                  <TabsList className="w-full">
                    <TabsTrigger value="cutoffs" className="flex-1">
                      <Trophy className="w-3 h-3 mr-1" />
                      Cutoffs
                    </TabsTrigger>
                    <TabsTrigger value="students" className="flex-1">
                      <Users className="w-3 h-3 mr-1" />
                      Allotted Students
                    </TabsTrigger>
                    <TabsTrigger value="districts" className="flex-1">
                      <BarChart3 className="w-3 h-3 mr-1" />
                      By District
                    </TabsTrigger>
                  </TabsList>

                  {/* Cutoffs tab */}
                  <TabsContent value="cutoffs">
                    <ScrollArea className="h-72">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>District</TableHead>
                            <TableHead>Stream</TableHead>
                            <TableHead>Gender</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Cutoff Merit</TableHead>
                            <TableHead className="text-right">Allotted</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.cutoffs.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-xs">{row.district}</TableCell>
                              <TableCell className="text-xs">{row.stream}</TableCell>
                              <TableCell className="text-xs">{row.gender}</TableCell>
                              <TableCell>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getCategoryColor(row.category)}`}>
                                  {row.category}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-sm">{row.cutoffMerit}</TableCell>
                              <TableCell className="text-right text-sm">{row.studentsAllotted}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  {/* Allotted Students tab */}
                  <TabsContent value="students">
                    <ScrollArea className="h-72">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Merit</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Gender</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Allotted District</TableHead>
                            <TableHead>Stream</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.students.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="font-mono font-bold text-sm">{s.meritNumber}</TableCell>
                              <TableCell className="text-xs font-medium">{s.name}</TableCell>
                              <TableCell className="text-xs">{s.gender}</TableCell>
                              <TableCell>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getCategoryColor(s.category)}`}>
                                  {s.category}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">{s.allottedDistrict || "—"}</TableCell>
                              <TableCell className="text-xs">{s.allottedStream || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  {/* District summary tab */}
                  <TabsContent value="districts">
                    <ScrollArea className="h-72">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>District</TableHead>
                            <TableHead className="text-right">Students Allotted</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(results.summary.districtSummary)
                            .sort(([, a], [, b]) => b - a)
                            .map(([district, count]) => (
                              <TableRow key={district}>
                                <TableCell className="font-medium text-sm">{district}</TableCell>
                                <TableCell className="text-right font-bold text-primary">{count}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No results data available.</p>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!allocationMutation.isPending && progress === 0 && !allocationCompleted && (
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
              onClick={handleClose}
              className="flex-1"
              data-testid="button-cancel-allocation"
            >
              Cancel
            </Button>
          </div>
        )}

        {allocationCompleted && (
          <Button onClick={handleClose} className="w-full">
            Close
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
