import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

// --- Types ---
interface LiveProgress {
  status: string;
  processed: number;
  total: number;
  isPaused: boolean;
  delayMs: number;
  queues: Record<string, {
    currentStudent: any;
    previousStudent: any;
    nextStudent: any;
    message?: string;
  }>;
}

interface DistrictSeat { district: string; total: number; [key: string]: any; }
interface LiveData {
  round: { id: string; roundName: string | null; roundNumber: number; academicYear: string; startedAt: string };
  districtSeats: DistrictSeat[];
  totalStudents: number;
}

// --- Helpers ---
const CATEGORY_COLORS: Record<string, { badge: string; border: string; bg: string }> = {
  WHH:      { bg: "bg-purple-50", badge: "bg-purple-100 text-purple-800", border: "border-purple-300" },
  Disabled: { bg: "bg-amber-50",  badge: "bg-amber-100 text-amber-800",   border: "border-amber-300" },
  Private:  { bg: "bg-teal-50",   badge: "bg-teal-100 text-teal-800",     border: "border-teal-300" },
  Open:     { bg: "bg-blue-50",   badge: "bg-blue-100 text-blue-800",     border: "border-blue-300" },
};

function seatColor(n: number | undefined) {
  if (n === undefined || n === null) return "text-gray-400";
  if (n === 0) return "text-red-600 font-bold";
  if (n < 10) return "text-amber-600 font-bold";
  return "text-green-600 font-bold";
}

// --- Elapsed timer ---
function useElapsed(startedAt: string | undefined) {
  const [elapsed, setElapsed] = useState("00:00:00");
  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      const h = String(Math.floor(diff / 3600)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      const s = String(diff % 60).padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return elapsed;
  return elapsed;
}

// Fixed height cards to prevent UI shifting
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
          <div className="font-semibold text-xs truncate text-gray-900" title={student.name}>{student.name}</div>
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
  const [activeTab, setActiveTab] = useState<"Male" | "Female">("Female");

  // Fetch status to grab active round ID
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

  // Fast interval: Live Queues (Memory)
  const { data: liveProgress } = useQuery<LiveProgress>({
    queryKey: ["/api/allocation/progress", roundId],
    enabled: !!roundId,
    queryFn: async () => {
      const res = await fetch(`/api/allocation/progress/${roundId}`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 500, // 500ms for buttery animation
  });

  // Medium interval: Live Vacancies Matrix (DB)
  const { data: liveData } = useQuery<LiveData>({
    queryKey: ["/api/counseling-display/live", activeTab, roundId],
    queryFn: async () => {
      const res = await fetch(`/api/counseling-display/live?gender=${activeTab}&roundId=${roundId || ''}`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 2000, // DB updates every 2 seconds
  });

  const elapsed = useElapsed(liveData?.round?.startedAt);

  const femaleCategories = ["WHH", "Disabled", "Private", "Open"];
  const maleCategories = ["Disabled", "Private", "Open"];
  const districtCats = activeTab === "Female" ? femaleCategories : maleCategories;

  if (!roundId || !liveData) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">Waiting for Active Counseling Session...</p>
      </div>
    </div>
  );

  const progressPct = liveProgress && liveProgress.total > 0
    ? Math.round((liveProgress.processed / liveProgress.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* HEADER BAR */}
      <div className="bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between z-10">
        <div>
          <h1 className="text-2xl font-black text-blue-900 uppercase tracking-tight">
            {liveData.round.roundName || `Round ${liveData.round.roundNumber}`}
          </h1>
          <div className="text-sm font-semibold text-gray-500 uppercase tracking-widest mt-0.5">
            {liveData.round.academicYear} • Live Live Allotment Display
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Session Uptime</div>
            <div className="font-mono font-bold text-lg text-blue-700">{elapsed}</div>
          </div>
          
          <div className="w-48">
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-gray-500 uppercase">Master Progress</span>
              <span className="text-blue-700">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2.5 bg-gray-200" />
          </div>
        </div>
      </div>

      {/* PAUSE BANNER */}
      {liveProgress?.isPaused && (
        <div className="bg-amber-400 text-amber-900 font-bold text-center py-1.5 uppercase tracking-widest text-sm animate-pulse border-b border-amber-500 shadow-sm z-10">
          ⏸ Allocation engine is currently paused by administrator
        </div>
      )}

      {/* MAIN CONTENT WORKSPACE */}
      <div className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6">
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-6 h-14 bg-white shadow-sm border p-1 rounded-xl">
            <TabsTrigger value="Female" className="text-lg font-bold uppercase tracking-wider data-[state=active]:bg-rose-500 data-[state=active]:text-white transition-all rounded-lg">
              👧 Female Counters & Queues
            </TabsTrigger>
            <TabsTrigger value="Male" className="text-lg font-bold uppercase tracking-wider data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all rounded-lg">
              👦 Male Counters & Queues
            </TabsTrigger>
          </TabsList>

          {["Female", "Male"].map(gender => (
            <TabsContent key={gender} value={gender} className="space-y-6 animate-in fade-in duration-300">
              
              {/* QUEUE TICKETS */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {(gender === "Female" ? femaleCategories : maleCategories).map(category => {
                  const queueKey = `${gender}_${category}`;
                  const queueData = liveProgress?.queues?.[queueKey];
                  const styles = CATEGORY_COLORS[category];
                  
                  return (
                    <div key={category} className={`bg-white rounded-xl shadow-sm border-t-4 ${styles.border} overflow-hidden flex flex-col h-[340px] relative`}>
                      <div className={`px-3 py-1.5 bg-gray-50 border-b flex justify-between items-center`}>
                        <span className="font-black text-gray-700 uppercase tracking-widest text-xs">{category} Queue</span>
                        {queueData?.currentStudent && <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />}
                      </div>

                      <div className="flex-1 p-2 flex flex-col gap-1.5 overflow-hidden justify-between">
                        {/* Previous */}
                        {renderStudentCard(queueData?.previousStudent, 'PREVIOUS', 'previous')}

                        {/* Current */}
                        {renderStudentCard(queueData?.currentStudent, 'CURRENT', 'current')}

                        {/* Next */}
                        {renderStudentCard(queueData?.nextStudent, 'NEXT', 'next')}

                        {/* Queue Message (if idle and has message) */}
                        {queueData?.message && !queueData?.currentStudent && (
                          <div className="text-[10px] text-slate-500 animate-pulse text-center p-2 bg-slate-50 border border-slate-200 rounded absolute inset-x-2 top-1/2 -translate-y-1/2 z-10 shadow-sm">
                            {queueData.message}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* LIVE DISTRICT SEAT MATRIX */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="bg-gray-800 text-white px-5 py-3 flex items-center justify-between">
                  <span className="font-bold uppercase tracking-widest text-sm">Real-time District Availability Matrix</span>
                  <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300 font-mono">Live Sync: 2s</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="px-4 py-3 text-left font-black text-gray-700">DISTRICT / STATION</th>
                        {districtCats.map(cat => (
                          <th key={cat} className="px-4 py-3 text-center">
                            <Badge variant="outline" className={`font-bold uppercase tracking-wider ${CATEGORY_COLORS[cat].badge} border-none`}>
                              {cat} TICKETS
                            </Badge>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center font-black text-gray-900 bg-gray-200 border-l border-gray-300">TOTAL POOL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(liveData.districtSeats || []).map((row, i) => (
                        <tr key={row.district} className={`hover:bg-blue-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                          <td className="px-4 py-2 font-bold text-gray-800 border-r border-gray-100">{row.district}</td>
                          
                          {districtCats.map(cat => (
                            <td key={cat} className={`px-4 py-2 text-center text-base font-mono ${seatColor(row[cat])}`}>
                              {row[cat] ?? <span className="text-red-600 opacity-50">0</span>}
                            </td>
                          ))}
                          
                          <td className="px-4 py-2 text-center text-base font-mono font-black text-blue-900 bg-gray-50 border-l border-gray-100">
                            {row.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
