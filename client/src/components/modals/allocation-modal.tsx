import { useState, useEffect, useRef } from "react";
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
import { Check, AlertTriangle, Trophy, BarChart3, Users } from "lucide-react";

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
      setIsPolling(true);
      const res = await apiRequest("POST", `/api/counseling-rounds/${roundId}/run-allocation`);
      const data = await res.json();
      return data;
    },
    onSuccess: (data) => {
      setRunRoundId(roundId!);
      setAllocationCompleted(true);
      setIsPolling(false);
      setProgress(100);
      queryClient.invalidateQueries({ queryKey: ["/api/allocation/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/allocation/stats"] });
      toast({
        title: "✅ Allocation Completed",
        description: `Allotted ${data.allottedStudents} out of ${data.totalStudents} eligible students.`,
        duration: 8000,
      });
    },
    onError: (error) => {
      toast({
        title: "Allocation Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsPolling(false);
      setProgress(0);
    },
  });

  // Poll progress from backend while allocation is running
  const [isPolling, setIsPolling] = useState(false);
  const [liveProgress, setLiveProgress] = useState<{
    status: string;
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
    bucket: string;
  } | null>(null);

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
    // Reset state after dialog closes
    setTimeout(() => {
      setProgress(0);
      setAllocationCompleted(false);
      setRunRoundId(null);
    }, 300);
  };

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

        {/* Progress state — real-time live display */}
        {progress > 0 && !allocationCompleted && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{liveProgress?.status === 'resetting' ? 'Resetting previous data...' : 'Processing students...'}</span>
                <span data-testid="allocation-progress" className="font-mono font-bold">
                  {liveProgress?.processed || 0} / {liveProgress?.total || '...'} ({progress}%)
                </span>
              </div>
              <Progress value={progress} className="w-full h-3" />
            </div>

            {/* Live student queue */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Processing Queue</h4>
              
              {/* Previous Student */}
              {liveProgress?.previousStudent && (
                <div className="p-2 rounded border bg-slate-50 opacity-70">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">PREVIOUSLY PROCESSED</div>
                      <div className="font-semibold text-xs text-muted-foreground">{liveProgress.previousStudent.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Merit #{liveProgress.previousStudent.meritNumber}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold mt-1">
                        {liveProgress.previousStudent.result === 'allotted' ? (
                          <span className="text-green-700">✓ Allotted → {liveProgress.previousStudent.allottedDistrict}</span>
                        ) : (
                          <span className="text-red-600">✗ Not Allotted</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live student card */}
              {liveProgress?.currentStudent && (
                <div className={`p-3 rounded-lg border-2 shadow-sm transition-all ${
                  liveProgress.currentStudent.result === 'allotted'
                    ? 'bg-green-50 border-green-300'
                    : liveProgress.currentStudent.result === 'not_allotted'
                      ? 'bg-red-50 border-red-300'
                      : 'bg-blue-50 border-blue-400 animate-pulse'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-blue-800 font-bold mb-0.5 tracking-wide">PROCESSING CURRENT</div>
                      <div className="font-semibold text-sm">{liveProgress.currentStudent.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Merit #{liveProgress.currentStudent.meritNumber} • {liveProgress.currentStudent.appNo}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={getCategoryColor(liveProgress.currentStudent.category)}>
                        {liveProgress.currentStudent.gender === 'Female' ? '♀' : '♂'} {liveProgress.currentStudent.category}
                      </Badge>
                      <div className="mt-2 text-xs font-semibold">
                        {liveProgress.currentStudent.result === 'allotted' && (
                          <span className="text-green-700">
                            ✓ Allotted → {liveProgress.currentStudent.allottedDistrict} (Choice {liveProgress.currentStudent.choiceNumber})
                          </span>
                        )}
                        {liveProgress.currentStudent.result === 'not_allotted' && (
                          <span className="text-red-600">✗ No seat available</span>
                        )}
                        {liveProgress.currentStudent.result === 'processing' && (
                          <span className="text-blue-600 flex items-center gap-1 justify-end">
                            <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                            Finding seat...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Next Student */}
              {liveProgress?.nextStudent && (
                <div className="p-2 rounded border border-dashed bg-slate-50 opacity-60">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">UP NEXT</div>
                      <div className="font-semibold text-xs text-muted-foreground">{liveProgress.nextStudent.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Merit #{liveProgress.nextStudent.meritNumber}
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-medium text-muted-foreground">
                      Waiting...
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live stats row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-green-50 border border-green-200">
                <div className="text-lg font-bold text-green-700">{liveProgress?.allottedCount || 0}</div>
                <div className="text-xs text-green-600">Allotted</div>
              </div>
              <div className="p-2 rounded bg-red-50 border border-red-200">
                <div className="text-lg font-bold text-red-700">{liveProgress?.notAllottedCount || 0}</div>
                <div className="text-xs text-red-600">Not Allotted</div>
              </div>
              <div className="p-2 rounded bg-blue-50 border border-blue-200">
                <div className="text-lg font-bold text-blue-700">{(liveProgress?.total || 0) - (liveProgress?.processed || 0)}</div>
                <div className="text-xs text-blue-600">Remaining</div>
              </div>
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
