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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, AlertTriangle, Trophy, BarChart3, Users, Pause, Play, Square, XSquare, ChevronDown, ChevronUp } from "lucide-react";

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

interface DistrictCounter {
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

export default function AllocationModal({ open, onOpenChange, roundId }: AllocationModalProps) {
  const [progress, setProgress] = useState(0);
  const [allocationCompleted, setAllocationCompleted] = useState(false);
  const [runRoundId, setRunRoundId] = useState<string | null>(null);
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false);
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
  const [liveProgress, setLiveProgress] = useState<any>(null);
  const [speedDelay, setSpeedDelay] = useState(100);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");

  // Elapsed time timer
  useEffect(() => {
    if (!isPolling || !liveProgress?.startedAt) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - liveProgress.startedAt;
      const hrs = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
      const mins = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
      const secs = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
      setElapsedTime(`${hrs}:${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPolling, liveProgress?.startedAt]);

  useEffect(() => {
    if (!isPolling || !roundId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/allocation/progress/${roundId}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setLiveProgress(data);
          if (data.delayMs !== undefined) setSpeedDelay(data.delayMs);
          // Progress based on seats filled / total seats
          if (data.totalSeats > 0) {
            setProgress(Math.round((data.seatsFilled / data.totalSeats) * 100));
          } else if (data.total > 0) {
            setProgress(Math.round((data.processed / data.total) * 100));
          }
          if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
            setIsPolling(false);
            if (data.status === 'cancelled') {
              toast({ title: "Allocation Cancelled", description: "The allocation process was physically halted.", variant: "destructive" });
            }
          }
        }
      } catch (e) { /* ignore polling errors */ }
    }, 500);
    return () => clearInterval(interval);
  }, [isPolling, roundId]);

  const controlAllocation = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!roundId) return;
    await apiRequest("POST", `/api/allocation/${roundId}/${action}`);
  };

  const updateSpeed = async (delayMs: number) => {
    if (!roundId) return;
    setSpeedDelay(delayMs);
    await apiRequest("POST", `/api/allocation/${roundId}/speed`, { delayMs });
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setProgress(0);
      setAllocationCompleted(false);
      setRunRoundId(null);
      setShowCategoryBreakdown(false);
    }, 300);
  };

  const canStart = roundId && round && round.isActive && !round.isCompleted;

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "Open": return { bg: "bg-blue-600", text: "text-blue-800", light: "bg-blue-50 border-blue-200" };
      case "Disabled": return { bg: "bg-amber-500", text: "text-amber-800", light: "bg-amber-50 border-amber-200" };
      case "WHH": return { bg: "bg-purple-600", text: "text-purple-800", light: "bg-purple-50 border-purple-200" };
      case "Private": return { bg: "bg-green-600", text: "text-green-800", light: "bg-green-50 border-green-200" };
      default: return { bg: "bg-gray-600", text: "text-gray-800", light: "bg-gray-50 border-gray-200" };
    }
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  // Category breakdown per selected gender
  const getCategoryBreakdown = (gender: string) => {
    const categories = gender === 'Female' ? ['WHH', 'Open', 'Disabled', 'Private'] : ['Open', 'Disabled', 'Private'];
    return categories.map(cat => {
      const key = `${gender}_${cat}`;
      const q = liveProgress?.queues?.[key];
      return { category: cat, processed: q?.processedCount || 0, allotted: q?.allottedCount || 0, denied: q?.deniedCount || 0 };
    });
  };

  const renderStudentCard = (student: any, label: string, variant: 'previous' | 'current' | 'next') => {
    if (!student) return null;
    const borderClass = variant === 'current' ? 'border-2 border-blue-400 bg-blue-50' :
      variant === 'next' ? 'border border-dashed border-gray-300 bg-gray-50/50' :
        'border border-gray-200 bg-gray-50 opacity-70';
    const labelClass = variant === 'current' ? 'text-blue-800' :
      variant === 'next' ? 'text-gray-500' : 'text-muted-foreground';

    return (
      <div className={`p-2 rounded ${borderClass}`}>
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <div className={`text-[10px] font-bold mb-0.5 tracking-wide uppercase ${labelClass}`}>{label}</div>
            <div className="font-semibold text-xs truncate">{student.name}</div>
            <div className="text-[10px] text-muted-foreground">
              Merit #{student.meritNumber} • {student.gender === 'Female' ? '♀' : '♂'} {student.gender} | {student.category}
              {student.counselingDistrict && ` | ${student.counselingDistrict}`}
            </div>
            {variant === 'current' && student.choices && student.choices.length > 0 && (
              <div className="text-[10px] text-blue-700 mt-0.5">
                {student.choices.slice(0, 3).map((c: string, i: number) => `Pref ${i + 1}: ${c}`).join(' • ')}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            {variant === 'current' && (
              <span className="text-[10px] text-blue-700 font-bold flex items-center justify-end gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                Scanning...
              </span>
            )}
            {variant === 'previous' && student.result === 'allotted' && (
              <span className="text-[10px] font-semibold text-green-700">✓ Choice {student.choiceNumber}: {student.allottedDistrict}</span>
            )}
            {variant === 'previous' && student.result === 'not_allotted' && (
              <span className="text-[10px] font-semibold text-red-600">✗ {student.reason}</span>
            )}
            {variant === 'next' && (
              <span className="text-[10px] text-gray-400">Waiting...</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        {(progress > 0 && !allocationCompleted) && liveProgress && (
          <div className="bg-slate-800 text-white px-4 py-2 -mx-6 -mt-6 rounded-t-lg flex justify-between items-center text-sm">
            <span className="font-semibold">
              Counseling: {round?.roundName || `Round ${round?.roundNumber}`} | Round #{round?.roundNumber}
            </span>
            <span className="text-slate-300 text-xs">
              Started: {liveProgress.startedAt ? formatTimestamp(liveProgress.startedAt) : '—'} | Elapsed: {elapsedTime}
            </span>
          </div>
        )}

        <DialogHeader className={progress > 0 && !allocationCompleted ? "pt-4" : ""}>
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

        {/* ═══ LIVE PROGRESS STATE ═══ */}
        {progress > 0 && !allocationCompleted && (
          <div className="space-y-3">
            {/* Progress bar - seat-based */}
            <div
              className="space-y-1 cursor-pointer group"
              onClick={() => setShowCategoryBreakdown(!showCategoryBreakdown)}
            >
              <div className="flex justify-between text-sm">
                <span className="font-medium flex items-center gap-1">
                  SEAT ALLOCATION PROGRESS
                  {showCategoryBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </span>
                <span className="font-mono font-bold">
                  {liveProgress?.seatsFilled || 0} / {liveProgress?.totalSeats || '...'} seats filled ({progress}%)
                </span>
              </div>
              <Progress value={progress} className="w-full h-3 group-hover:ring-2 ring-blue-300 transition-all" />
              <p className="text-[10px] text-muted-foreground">Click progress bar to expand category-wise breakdown</p>
            </div>

            {/* Category breakdown (expandable) */}
            {showCategoryBreakdown && (
              <div className="space-y-1 bg-slate-50 border rounded-md p-2">
                {getCategoryBreakdown(liveProgress?.queues && Object.keys(liveProgress.queues).find((k: string) => k.startsWith('Male')) ? 'Male' : 'Female').map(cb => (
                  <div key={cb.category} className="flex items-center gap-2 text-xs">
                    <span className="w-20 font-medium">{cb.category}:</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getCategoryColor(cb.category).bg}`}
                        style={{ width: `${cb.processed > 0 ? Math.min(100, (cb.allotted / Math.max(1, cb.processed)) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-32 text-right">✓ {cb.allotted} | ✗ {cb.denied} | {cb.processed} done</span>
                  </div>
                ))}
              </div>
            )}

            {/* Icon-only controls */}
            <div className="flex items-center gap-2 px-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={liveProgress?.isPaused ? "default" : "secondary"}
                      className="h-8 w-8 rounded-full"
                      onClick={() => controlAllocation(liveProgress?.isPaused ? 'resume' : 'pause')}
                    >
                      {liveProgress?.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{liveProgress?.isPaused ? 'Resume' : 'Pause'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full" onClick={() => controlAllocation('cancel')}>
                      <Square className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cancel Allocation</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex-1 flex items-center justify-end gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Speed: {speedDelay}ms</span>
                <input
                  type="range"
                  min="0" max="5000" step="100"
                  value={speedDelay}
                  onChange={(e) => updateSpeed(Number(e.target.value))}
                  className="w-28 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Gender Tabs with parallel category cards */}
            <Tabs defaultValue="Male" className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="Male">👦 BOYS</TabsTrigger>
                <TabsTrigger value="Female">👧 GIRLS</TabsTrigger>
              </TabsList>

              {["Male", "Female"].map(gender => (
                <TabsContent key={gender} value={gender}>
                  <div className={`grid gap-2 ${gender === 'Female' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {(gender === 'Female' ? ['WHH', 'Open', 'Disabled', 'Private'] : ['Open', 'Disabled', 'Private']).map(category => {
                      const queueKey = `${gender}_${category}`;
                      const queueData = liveProgress?.queues?.[queueKey];
                      const colors = getCategoryColor(category);
                      const qs = queueData || {};

                      return (
                        <div key={queueKey} className="border rounded-md bg-white overflow-hidden shadow-sm">
                          {/* Category header */}
                          <div className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white ${colors.bg}`}>
                            {category} Queue
                          </div>

                          <div className="p-1.5 space-y-1">
                            {/* Previous */}
                            {renderStudentCard(qs.previousStudent, 'PREVIOUS', 'previous')}

                            {/* Current */}
                            {renderStudentCard(qs.currentStudent, 'CURRENT', 'current')}

                            {/* Next */}
                            {renderStudentCard(qs.nextStudent, 'NEXT', 'next')}

                            {/* Queue message */}
                            {qs.message && !qs.currentStudent && (
                              <div className="text-[10px] text-muted-foreground animate-pulse text-center p-2 bg-slate-50 border border-slate-100 rounded">
                                {qs.message}
                              </div>
                            )}
                          </div>

                          {/* Per-queue stats footer */}
                          <div className="px-2 py-1 bg-slate-50 border-t text-[10px] text-muted-foreground">
                            Processed: {qs.processedCount || 0} | ✓ {qs.allottedCount || 0} | ✗ {qs.deniedCount || 0}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            {/* District remaining seats table */}
            {liveProgress?.districtCounters && liveProgress.districtCounters.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-1">REMAINING VACANT SEATS — All {liveProgress.districtCounters.length} Counseling Stations</h4>
                <ScrollArea className="h-44">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] py-1">District</TableHead>
                        <TableHead className="text-[10px] py-1 text-right">M-Open</TableHead>
                        <TableHead className="text-[10px] py-1 text-right">M-Dis</TableHead>
                        <TableHead className="text-[10px] py-1 text-right">M-Pvt</TableHead>
                        <TableHead className="text-[10px] py-1 text-right">F-Open</TableHead>
                        <TableHead className="text-[10px] py-1 text-right">F-Dis</TableHead>
                        <TableHead className="text-[10px] py-1 text-right">F-WHH</TableHead>
                        <TableHead className="text-[10px] py-1 text-right">F-Pvt</TableHead>
                        <TableHead className="text-[10px] py-1 text-right font-bold">TOTAL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liveProgress.districtCounters.map((dc: DistrictCounter, i: number) => (
                        <TableRow key={dc.district} className={i % 2 === 0 ? '' : 'bg-slate-50/50'}>
                          <TableCell className="text-[10px] py-1 font-medium">{dc.district}</TableCell>
                          <TableCell className="text-[10px] py-1 text-right">{dc.mOpen}</TableCell>
                          <TableCell className="text-[10px] py-1 text-right">{dc.mDisabled}</TableCell>
                          <TableCell className="text-[10px] py-1 text-right">{dc.mPrivate}</TableCell>
                          <TableCell className="text-[10px] py-1 text-right">{dc.fOpen}</TableCell>
                          <TableCell className="text-[10px] py-1 text-right">{dc.fDisabled}</TableCell>
                          <TableCell className="text-[10px] py-1 text-right">{dc.fWHH}</TableCell>
                          <TableCell className="text-[10px] py-1 text-right">{dc.fPrivate}</TableCell>
                          <TableCell className="text-[10px] py-1 text-right font-bold">{dc.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            {/* Global stats bar — vacancy focused */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-green-50 border border-green-200">
                <div className="text-lg font-bold text-green-700">{liveProgress?.seatsFilled || 0}</div>
                <div className="text-[10px] text-green-600">Seats Filled</div>
              </div>
              <div className="p-2 rounded bg-orange-50 border border-orange-200">
                <div className="text-lg font-bold text-orange-600">{(liveProgress?.totalSeats || 0) - (liveProgress?.seatsFilled || 0)}</div>
                <div className="text-[10px] text-orange-500">Vacant Seats</div>
              </div>
              <div className="p-2 rounded bg-red-50 border border-red-200">
                <div className="text-lg font-bold text-red-700">{liveProgress?.notAllottedCount || 0}</div>
                <div className="text-[10px] text-red-600">Students Denied</div>
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
                      <Trophy className="w-3 h-3 mr-1" /> Cutoffs
                    </TabsTrigger>
                    <TabsTrigger value="students" className="flex-1">
                      <Users className="w-3 h-3 mr-1" /> Allotted Students
                    </TabsTrigger>
                    <TabsTrigger value="districts" className="flex-1">
                      <BarChart3 className="w-3 h-3 mr-1" /> By District
                    </TabsTrigger>
                  </TabsList>

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
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getCategoryColor(row.category).light} ${getCategoryColor(row.category).text}`}>
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
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getCategoryColor(s.category).light} ${getCategoryColor(s.category).text}`}>
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
