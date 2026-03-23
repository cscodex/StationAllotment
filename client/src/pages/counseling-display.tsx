import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp } from "lucide-react";

// --- Types ---
interface LiveProgress {
  status: string;
  processed: number;
  total: number;
  seatsFilled: number;
  totalSeats: number;
  notAllottedCount: number;
  isPaused: boolean;
  delayMs: number;
  startedAt?: number;
  districtCounters: DistrictCounter[];
  queues: Record<string, {
    currentStudent: any;
    previousStudent: any;
    nextStudent: any;
    processedCount: number;
    allottedCount: number;
    deniedCount: number;
    message?: string;
  }>;
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

const getCategoryColor = (cat: string) => {
  switch (cat) {
    case "Open": return { bg: "bg-blue-600", text: "text-blue-800", light: "bg-blue-50 border-blue-200" };
    case "Disabled": return { bg: "bg-amber-500", text: "text-amber-800", light: "bg-amber-50 border-amber-200" };
    case "WHH": return { bg: "bg-purple-600", text: "text-purple-800", light: "bg-purple-50 border-purple-200" };
    case "Private": return { bg: "bg-green-600", text: "text-green-800", light: "bg-green-50 border-green-200" };
    default: return { bg: "bg-gray-600", text: "text-gray-800", light: "bg-gray-50 border-gray-200" };
  }
};

const renderStudentCard = (student: any, label: string, variant: 'previous' | 'current' | 'next') => {
  const borderClass = variant === 'current' ? 'border-2 border-primary bg-blue-50/50' :
    variant === 'next' ? 'border border-dashed border-slate-300 bg-slate-50/50' :
      'border border-slate-200 bg-slate-50 opacity-80';
  const labelClass = variant === 'current' ? 'text-primary' :
    variant === 'next' ? 'text-slate-500' : 'text-slate-500';

  if (!student) {
    return (
      <div className={`p-2 rounded h-[90px] flex flex-col items-center justify-center ${borderClass}`}>
         <span className="text-xs text-slate-400 italic">...</span>
      </div>
    );
  }

  return (
    <div className={`p-2 rounded h-[90px] flex flex-col justify-between ${borderClass} overflow-hidden shadow-sm`}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className={`text-[10px] font-bold mb-0.5 tracking-wide uppercase ${labelClass}`}>{label}</div>
          <div className="font-semibold text-xs truncate" title={student.name}>{student.name}</div>
          <div className="text-[9px] text-slate-500 truncate mt-0.5 font-medium">
            M:{student.meritNumber} • {student.gender === 'Female' ? '♀' : '♂'} • {student.category}
            {student.stream && ` • ${student.stream}`}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {variant === 'current' && (
            <span className="text-[10px] text-primary font-bold flex items-center justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Scanning
            </span>
          )}
          {variant === 'previous' && student.result === 'allotted' && (
            <span className="text-[9px] text-green-700 font-bold bg-green-50 px-1 py-0.5 rounded border border-green-200">
              ✓ ALLOTTED
            </span>
          )}
          {variant === 'previous' && student.result === 'not_allotted' && (
            <span className="text-[9px] text-red-700 font-bold bg-red-50 px-1 py-0.5 rounded border border-red-200" title={student.reason}>
              ✗ DENIED
            </span>
          )}
        </div>
      </div>
      
      {/* Choices Display */}
      {student.choices && student.choices.length > 0 ? (
        <div className="text-[9px] text-slate-600 mt-1.5 truncate border-t border-slate-200/60 pt-1">
          <span className="font-semibold text-slate-400 mr-1">PREF:</span>
          {student.choices.slice(0, 3).map((c: string, i: number) => `[${i + 1}] ${c}`).join(' ')}
          {student.choices.length > 3 ? ' ...' : ''}
        </div>
      ) : (
         <div className="text-[9px] text-slate-400 mt-1.5 italic border-t border-slate-200/60 pt-1">No preferences</div>
      )}
    </div>
  );
};

export default function CounselingDisplay() {
  const [roundId, setRoundId] = useState<string | null>(null);
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");

  useQuery({
    queryKey: ["/api/allocation/status"],
    queryFn: async () => {
      const res = await fetch("/api/allocation/status", { credentials: "include" });
      const data = await res.json();
      if (data?.roundId) setRoundId(data.roundId);
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: round } = useQuery({
    queryKey: ["/api/counseling-rounds", roundId],
    enabled: !!roundId,
    queryFn: async () => {
      const res = await fetch(`/api/counseling-rounds/${roundId}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: liveProgress } = useQuery<LiveProgress>({
    queryKey: ["/api/allocation/progress", roundId],
    enabled: !!roundId,
    queryFn: async () => {
      const res = await fetch(`/api/allocation/progress/${roundId}`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 500, // 500ms for buttery animation
  });

  useEffect(() => {
    if (!liveProgress?.startedAt) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - liveProgress.startedAt!;
      const hrs = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
      const mins = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
      const secs = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
      setElapsedTime(`${hrs}:${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [liveProgress?.startedAt]);

  const getCategoryBreakdown = (gender: string) => {
    const categories = gender === 'Female' ? ['WHH', 'Open', 'Disabled', 'Private'] : ['Open', 'Disabled', 'Private'];
    return categories.map(cat => {
      const key = `${gender}_${cat}`;
      const q = liveProgress?.queues?.[key];
      return { category: cat, processed: q?.processedCount || 0, allotted: q?.allottedCount || 0, denied: q?.deniedCount || 0 };
    });
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  if (!roundId || !round) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">Waiting for Active Counseling Session...</p>
      </div>
    </div>
  );

  let progress = 0;
  if (liveProgress) {
    if (liveProgress.totalSeats > 0) {
      progress = Math.round((liveProgress.seatsFilled / liveProgress.totalSeats) * 100);
    } else if (liveProgress.total > 0) {
      progress = Math.round((liveProgress.processed / liveProgress.total) * 100);
    }
  }

  const allocationCompleted = liveProgress?.status === 'completed';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col p-4 md:p-8 space-y-4 max-w-7xl mx-auto">
      {/* Header matching Modal */}
      {(progress > 0 && !allocationCompleted) && liveProgress && (
        <div className="bg-slate-800 text-white px-4 py-3 rounded-lg flex justify-between items-center text-sm shadow">
          <span className="font-semibold text-base uppercase tracking-wider">
            Counseling: {round?.roundName || `Round ${round?.roundNumber}`} | Round #{round?.roundNumber}
          </span>
          <span className="text-slate-300 text-xs">
            Started: {liveProgress.startedAt ? formatTimestamp(liveProgress.startedAt) : '—'} | <span className="font-bold text-white">Elapsed: {elapsedTime}</span>
          </span>
        </div>
      )}

      {/* ═══ LIVE PROGRESS STATE ═══ */}
      {progress > 0 && !allocationCompleted && (
        <div className="space-y-4">
          {/* Progress bar - seat-based */}
          <div
            className="space-y-1 cursor-pointer group bg-white shadow-sm rounded-lg p-4 border border-slate-200"
            onClick={() => setShowCategoryBreakdown(!showCategoryBreakdown)}
          >
            <div className="flex justify-between text-sm">
              <span className="font-bold text-slate-700 flex items-center gap-1 uppercase tracking-wider">
                SEAT ALLOCATION PROGRESS
                {showCategoryBreakdown ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
              </span>
              <span className="font-mono font-bold text-base text-primary">
                {liveProgress?.seatsFilled || 0} / {liveProgress?.totalSeats || '...'} seats filled ({progress}%)
              </span>
            </div>
            <Progress value={progress} className="w-full h-3 group-hover:ring-2 ring-blue-300 transition-all mt-2" />
            <p className="text-[10px] text-muted-foreground mt-1 text-center">Click progress bar to expand category-wise breakdown</p>
          </div>

          {/* Category breakdown (expandable) */}
          {showCategoryBreakdown && (
            <div className="space-y-2 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              {getCategoryBreakdown(liveProgress?.queues && Object.keys(liveProgress.queues).find((k: string) => k.startsWith('Male')) ? 'Male' : 'Female').map(cb => (
                <div key={cb.category} className="flex items-center gap-3 text-sm">
                  <span className="w-24 font-bold text-slate-700">{cb.category}:</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${getCategoryColor(cb.category).bg}`}
                      style={{ width: `${cb.processed > 0 ? Math.min(100, (cb.allotted / Math.max(1, cb.processed)) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-40 text-right font-medium">✓ {cb.allotted} &nbsp;|&nbsp; ✗ {cb.denied} &nbsp;|&nbsp; {cb.processed} done</span>
                </div>
              ))}
            </div>
          )}

          {/* Gender Tabs with parallel category cards */}
          <Tabs defaultValue="Female" className="w-full">
            <TabsList className="w-full grid grid-cols-2 shadow-sm rounded-lg mb-4 h-12">
              <TabsTrigger value="Male" className="text-base font-bold tracking-widest uppercase">👦 BOYS QUEUES</TabsTrigger>
              <TabsTrigger value="Female" className="text-base font-bold tracking-widest uppercase">👧 GIRLS QUEUES</TabsTrigger>
            </TabsList>

            {["Male", "Female"].map(gender => (
              <TabsContent key={gender} value={gender}>
                <div className={`grid gap-4 ${gender === 'Female' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  {(gender === 'Female' ? ['WHH', 'Open', 'Disabled', 'Private'] : ['Open', 'Disabled', 'Private']).map(category => {
                    const queueKey = `${gender}_${category}`;
                    const queueData = liveProgress?.queues?.[queueKey];
                    const colors = getCategoryColor(category);
                    const qs = queueData || {} as any;

                    return (
                      <div key={queueKey} className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm flex flex-col min-h-[350px]">
                        {/* Category header */}
                        <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider text-white ${colors.bg}`}>
                          {category} Queue
                        </div>

                        <div className="p-2 space-y-2 flex-grow flex flex-col">
                          {/* Previous */}
                          <div className="flex-grow">
                            {renderStudentCard(qs.previousStudent, 'PREVIOUS', 'previous')}
                          </div>

                          {/* Current */}
                          <div className="flex-grow">
                            {renderStudentCard(qs.currentStudent, 'CURRENT', 'current')}
                          </div>

                          {/* Next */}
                          <div className="flex-grow">
                            {renderStudentCard(qs.nextStudent, 'NEXT', 'next')}
                          </div>

                          {/* Queue message */}
                          {qs.message && !qs.currentStudent && (
                            <div className="text-[10px] text-muted-foreground animate-pulse text-center p-2 bg-slate-50 border border-slate-100 rounded mt-2">
                              {qs.message}
                            </div>
                          )}
                        </div>

                        {/* Per-queue stats footer */}
                        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs font-medium text-slate-600 flex justify-between">
                          <span>Processed: {qs.processedCount || 0}</span>
                          <div>
                            <span className="text-green-600 font-bold mr-2">✓ {qs.allottedCount || 0}</span>
                            <span className="text-red-500 font-bold">✗ {qs.deniedCount || 0}</span>
                          </div>
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
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <h4 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider">REMAINING VACANT SEATS — All {liveProgress.districtCounters.length} Counseling Stations</h4>
              <ScrollArea className="h-44 border border-slate-200 rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100">
                      <TableHead className="text-xs py-2 font-bold text-slate-800">District</TableHead>
                      <TableHead className="text-xs py-2 text-right font-bold text-slate-700">M-Open</TableHead>
                      <TableHead className="text-xs py-2 text-right font-bold text-slate-700">M-Dis</TableHead>
                      <TableHead className="text-xs py-2 text-right font-bold text-slate-700">M-Pvt</TableHead>
                      <TableHead className="text-xs py-2 text-right font-bold text-slate-700">F-Open</TableHead>
                      <TableHead className="text-xs py-2 text-right font-bold text-slate-700">F-Dis</TableHead>
                      <TableHead className="text-xs py-2 text-right font-bold text-slate-700">F-WHH</TableHead>
                      <TableHead className="text-xs py-2 text-right font-bold text-slate-700">F-Pvt</TableHead>
                      <TableHead className="text-xs py-2 text-right font-black text-slate-900 border-l border-slate-300">TOTAL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveProgress.districtCounters.map((dc: DistrictCounter, i: number) => (
                      <TableRow key={dc.district} className={i % 2 === 0 ? '' : 'bg-slate-50/70 hover:bg-slate-100'}>
                        <TableCell className="text-xs py-1.5 font-bold text-slate-800">{dc.district}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{dc.mOpen || <span className="text-slate-300">0</span>}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{dc.mDisabled || <span className="text-slate-300">0</span>}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{dc.mPrivate || <span className="text-slate-300">0</span>}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{dc.fOpen || <span className="text-slate-300">0</span>}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{dc.fDisabled || <span className="text-slate-300">0</span>}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{dc.fWHH || <span className="text-slate-300">0</span>}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{dc.fPrivate || <span className="text-slate-300">0</span>}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-black border-l border-slate-200">{dc.total || <span className="text-red-500">0</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Global stats bar — vacancy focused */}
          <div className="grid grid-cols-3 gap-4 text-center mt-4">
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 shadow-sm transition-transform hover:scale-105">
              <div className="text-3xl font-black text-green-700">{liveProgress?.seatsFilled || 0}</div>
              <div className="text-xs font-bold text-green-600 tracking-widest uppercase mt-1">Seats Filled</div>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 border border-orange-200 shadow-sm transition-transform hover:scale-105">
              <div className="text-3xl font-black text-orange-600">{(liveProgress?.totalSeats || 0) - (liveProgress?.seatsFilled || 0)}</div>
              <div className="text-xs font-bold text-orange-600 tracking-widest uppercase mt-1">Vacant Seats</div>
            </div>
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 shadow-sm transition-transform hover:scale-105">
              <div className="text-3xl font-black text-red-700">{liveProgress?.notAllottedCount || 0}</div>
              <div className="text-xs font-bold text-red-600 tracking-widest uppercase mt-1">Students Denied</div>
            </div>
          </div>
        </div>
      )}

      {allocationCompleted && (
        <div className="text-center py-20 bg-slate-100 border rounded-xl shadow-inner my-10 space-y-4">
          <div className="text-5xl">🎉</div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-widest">Allocation Completed</h2>
          <p className="text-slate-500 text-lg">Results are ready for review by the Central Administrator!</p>
        </div>
      )}
    </div>
  );
}
