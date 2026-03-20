import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

// --- Types ---
interface PlaybackStudent {
  id: string;
  meritNumber: number;
  name: string;
  gender: string;
  category: string;
  counselingDistrict: string;
  choice1: string | null;
  choice2: string | null;
  choice3: string | null;
  choice4: string | null;
  choice5: string | null;
  allottedStream: string | null;
  allottedDistrict: string | null;
  allottedSchoolUdise: string | null;
  allocationStatus: string;
}
interface CategoryProgress { category: string; filled: number; total: number; }
interface DistrictSeat { district: string; total: number; [key: string]: any; }
interface LiveData {
  round: { id: string; roundName: string | null; roundNumber: number; academicYear: string; startedAt: string };
  gender: string;
  categoryProgress: CategoryProgress[];
  students: PlaybackStudent[];
  districtSeats: DistrictSeat[];
  totalStudents: number;
}

// --- Helpers ---
const CATEGORY_COLORS: Record<string, { bar: string; badge: string; label: string }> = {
  WHH:      { bar: "bg-purple-500", badge: "bg-purple-100 text-purple-800 border-purple-300", label: "text-purple-700" },
  Disabled: { bar: "bg-amber-500",  badge: "bg-amber-100 text-amber-800 border-amber-300",   label: "text-amber-700" },
  Private:  { bar: "bg-teal-500",   badge: "bg-teal-100 text-teal-800 border-teal-300",       label: "text-teal-700" },
  Open:     { bar: "bg-blue-500",   badge: "bg-blue-100 text-blue-800 border-blue-300",       label: "text-blue-700" },
};

function seatColor(n: number | undefined) {
  if (n === undefined || n === null) return "text-gray-400";
  if (n === 0) return "text-red-600 font-bold";
  if (n < 10) return "text-amber-600 font-bold";
  return "text-green-600 font-bold";
}

function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORY_COLORS[category] || { badge: "bg-gray-100 text-gray-700 border-gray-300" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${c.badge}`}>
      {category}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "allotted")
    return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-300 font-semibold">✅ Allotted</span>;
  if (status === "not_allotted")
    return <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-300 font-semibold">✗ Not Allotted</span>;
  return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-300">— Pending</span>;
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
}

// --- Main Page ---
export default function CounselingDisplay() {
  const [gender, setGender] = useState<"Female" | "Male">("Female");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1); // seconds per student
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, error } = useQuery<LiveData>({
    queryKey: ["/api/counseling-display/live", gender],
    queryFn: async () => {
      const res = await fetch(`/api/counseling-display/live?gender=${gender}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load data");
      return res.json();
    },
    refetchInterval: 30000, // re-fetch every 30s to get updated allotment status
    staleTime: 10000,
  });

  // Reset to index 0 when gender changes
  useEffect(() => { setCurrentIndex(0); }, [gender]);

  // 1-student-per-N-seconds auto-advance
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isPlaying && data && data.students.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= data.students.length - 1) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, speed * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, data, speed]);

  const students = data?.students || [];
  const prev = students[currentIndex - 1] ?? null;
  const curr = students[currentIndex] ?? null;
  const next = students[currentIndex + 1] ?? null;

  const elapsed = useElapsed(data?.round?.startedAt);

  // Female columns for district table
  const femaleCategories = ["WHH", "Disabled", "Private", "Open"];
  const maleCategories = ["Disabled", "Private", "Open"];
  const districtCats = gender === "Female" ? femaleCategories : maleCategories;

  if (isLoading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">Loading counseling data...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center text-red-600">
        <p className="text-xl font-bold">Error loading data</p>
        <p className="text-sm mt-2">{String(error)}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 overflow-hidden print:bg-white" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── SECTION 1: HEADER ── */}
      <div className="bg-white border-b-2 border-blue-700 px-4 py-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700 leading-tight">
          <span className="text-blue-700 font-bold text-base">{data?.round?.roundName || "—"}</span>
          <span className="mx-2 text-gray-400">|</span>
          Round #{data?.round?.roundNumber}
          <span className="mx-2 text-gray-400">|</span>
          {data?.round?.academicYear}
          <span className="mx-2 text-gray-400">|</span>
          Elapsed: <span className="font-mono font-bold text-blue-700">{elapsed}</span>
        </div>

        {/* Gender toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">VIEWING:</span>
          <button
            onClick={() => setGender("Female")}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border-2 transition-all ${
              gender === "Female"
                ? "bg-rose-500 border-rose-500 text-white shadow-md"
                : "bg-white border-gray-300 text-gray-600 hover:border-rose-400"
            }`}
          >
            ♀ FEMALE
          </button>
          <button
            onClick={() => setGender("Male")}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border-2 transition-all ${
              gender === "Male"
                ? "bg-blue-600 border-blue-600 text-white shadow-md"
                : "bg-white border-gray-300 text-gray-600 hover:border-blue-400"
            }`}
          >
            ♂ MALE
          </button>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 font-semibold">
            {currentIndex + 1} / {students.length}
          </span>
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 font-bold text-gray-600"
            title="Previous"
          >◀</button>
          <button
            onClick={() => setIsPlaying(p => !p)}
            className={`px-3 py-1 rounded border font-bold text-sm ${isPlaying ? "bg-amber-100 border-amber-400 text-amber-800" : "bg-green-100 border-green-400 text-green-800"}`}
          >
            {isPlaying ? "⏸ PAUSE" : "▶ PLAY"}
          </button>
          <button
            onClick={() => setCurrentIndex(i => Math.min(students.length - 1, i + 1))}
            className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 font-bold text-gray-600"
            title="Next"
          >▶</button>
          <select
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-1 py-1 bg-white"
            title="Speed (seconds per student)"
          >
            <option value={0.5}>0.5s/student</option>
            <option value={1}>1s/student</option>
            <option value={2}>2s/student</option>
            <option value={3}>3s/student</option>
            <option value={5}>5s/student</option>
          </select>
        </div>
      </div>

      {/* ── SECTION 2: CATEGORY PROGRESS BARS ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
          SEAT ALLOCATION PROGRESS — {gender}
        </div>
        <div className="grid gap-1.5">
          {(data?.categoryProgress || []).map(cp => {
            const pct = cp.total > 0 ? Math.round((cp.filled / cp.total) * 100) : 0;
            const c = CATEGORY_COLORS[cp.category] || { bar: "bg-gray-400", label: "text-gray-600" };
            return (
              <div key={cp.category} className="flex items-center gap-2">
                <span className={`text-xs font-bold w-14 text-right ${c.label}`}>{cp.category}</span>
                <span className="text-xs text-gray-500 w-28 text-right font-mono">
                  {cp.filled} / {cp.total}
                </span>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-10 ${c.label}`}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 3: STUDENT COMPARISON TABLE ── */}
      <div className="px-4 py-2">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
          STUDENT COMPARISON — {gender} Counseling · Previous · Current · Next
        </div>
        <table className="w-full text-sm border-collapse border border-gray-300 bg-white">
          <thead>
            <tr>
              <th className="border border-gray-300 bg-gray-700 text-white text-left px-2 py-1.5 text-xs font-bold uppercase w-32">DETAILS</th>
              <th className="border border-gray-300 bg-blue-100 text-blue-800 px-2 py-1.5 text-xs font-bold uppercase text-center">◀ PREVIOUS</th>
              <th className="border-2 border-amber-400 bg-amber-50 text-amber-900 px-2 py-1.5 text-xs font-bold uppercase text-center">▶ CURRENT</th>
              <th className="border border-gray-300 bg-green-100 text-green-800 px-2 py-1.5 text-xs font-bold uppercase text-center">⏭ NEXT</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["MERIT NO",
                prev?.meritNumber, curr?.meritNumber, next?.meritNumber],
              ["NAME",
                prev?.name, curr?.name, next?.name],
              ["GENDER",
                prev?.gender, curr?.gender, next?.gender],
              ["CATEGORY",
                prev ? <CategoryBadge category={prev.category} /> : null,
                curr ? <CategoryBadge category={curr.category} /> : null,
                next ? <CategoryBadge category={next.category} /> : null],
              ["COUNSELING DIST.",
                prev?.counselingDistrict, curr?.counselingDistrict, next?.counselingDistrict],
              ["PREFERENCE 1", prev?.choice1, curr?.choice1, next?.choice1],
              ["PREFERENCE 2", prev?.choice2, curr?.choice2, next?.choice2],
              ["PREFERENCE 3", prev?.choice3, curr?.choice3, next?.choice3],
              ["ALLOTTED STREAM",
                prev?.allottedStream || "—", curr?.allottedStream ? curr.allottedStream : curr ? "— pending" : "—", next?.allottedStream || (next ? "— pending" : "—")],
              ["ALLOTTED STATION",
                prev?.allottedDistrict
                  ? <span className="text-green-700 font-semibold">{prev.allottedDistrict} ✅</span>
                  : prev ? "—" : null,
                curr?.allottedDistrict
                  ? <span className="text-green-700 font-semibold">{curr.allottedDistrict} ✅</span>
                  : curr ? <span className="text-gray-400">— pending</span> : null,
                next ? <span className="text-gray-400">— pending</span> : null],
              ["STATUS",
                prev ? <StatusBadge status={prev.allocationStatus} /> : null,
                curr ? <StatusBadge status={curr.allocationStatus} /> : null,
                next ? <StatusBadge status={next.allocationStatus} /> : null],
            ].map(([label, pVal, cVal, nVal], i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="border border-gray-300 px-2 py-1 text-xs font-bold text-gray-600 uppercase">{label}</td>
                <td className="border border-gray-300 px-2 py-1 text-center text-xs text-gray-500">{pVal ?? "—"}</td>
                <td className="border-2 border-amber-300 bg-amber-50 px-2 py-1 text-center text-sm font-bold text-gray-900">{cVal ?? "—"}</td>
                <td className="border border-gray-300 px-2 py-1 text-center text-xs text-gray-600">{nVal ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── SECTION 4: DISTRICT REMAINING SEATS ── */}
      <div className="px-4 py-2 pb-4">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
          REMAINING SEATS — {gender} Counseling Stations
        </div>
        <table className="w-full text-xs border-collapse border border-gray-300 bg-white">
          <thead>
            <tr className="bg-gray-700 text-white">
              <th className="border border-gray-400 px-2 py-1.5 text-left font-bold">District / Station</th>
              {districtCats.map(cat => (
                <th key={cat} className={`border border-gray-400 px-2 py-1.5 text-center font-bold ${CATEGORY_COLORS[cat]?.label.replace("text-", "text-") || ""}`}>
                  <span className={`text-xs px-1 py-0.5 rounded ${CATEGORY_COLORS[cat]?.badge || ""}`}>{cat}</span>
                </th>
              ))}
              <th className="border border-gray-400 px-2 py-1.5 text-center font-bold text-white">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {(data?.districtSeats || []).map((row, i) => (
              <tr key={row.district} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="border border-gray-200 px-2 py-1 font-semibold text-gray-800">{row.district}</td>
                {districtCats.map(cat => (
                  <td key={cat} className={`border border-gray-200 px-2 py-1 text-center font-mono ${seatColor(row[cat])}`}>
                    {row[cat] ?? <span className="text-red-600 font-bold">0</span>}
                  </td>
                ))}
                <td className="border border-gray-200 px-2 py-1 text-center font-bold text-blue-800">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
