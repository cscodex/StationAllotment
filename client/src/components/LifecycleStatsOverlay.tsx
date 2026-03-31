import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, BarChart3, AlertCircle } from "lucide-react";

interface LifecycleStats {
  total: number;
  registered: number;
  pending: number;
  locked: number;
  allotted: number;
  not_allotted: number;
  admitted: number;
  not_admitted: number;
  vacated: number;
}

const STATUS_ROWS = [
  { key: "total", label: "Total Valid Students [Total Tracked]", color: "text-slate-800", dotColor: "", isBold: true },
  { key: "registered", label: "Registered", hint: "[No Action Taken]", color: "text-blue-700", dotColor: "bg-blue-500" },
  { key: "pending", label: "Pending", hint: "[Preferences Set / Unlocked]", color: "text-amber-700", dotColor: "bg-amber-500" },
  { key: "allotted", label: "Allotted", hint: "[Algorithm Matched Seat]", color: "text-emerald-700", dotColor: "bg-emerald-500" },
  { key: "not_allotted", label: "Not Allotted", hint: "[Algorithm Skipped/Exhausted]", color: "text-slate-700", dotColor: "bg-slate-300" },
  { key: "admitted", label: "Admitted", hint: "[Seat Officially Claimed]", color: "text-green-700", dotColor: "bg-green-600" },
  { key: "not_admitted", label: "Not Admitted", hint: "[No Show Record]", color: "text-red-700", dotColor: "bg-red-600" },
  { key: "vacated", label: "Vacated", hint: "[Seat Formally Discarded]", color: "text-purple-700", dotColor: "bg-purple-600" },
] as const;

export function LifecycleStatsOverlay({
  open,
  onOpenChange,
  counselingTitles = [],
  defaultTitleId = "current"
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counselingTitles: any[];
  defaultTitleId?: string;
}) {
  const [selectedTitleId, setSelectedTitleId] = useState<string>(defaultTitleId !== "current" ? defaultTitleId : "");
  const [selectedRoundId, setSelectedRoundId] = useState<string>("");

  // Fetch rounds for the selected title — only finalized/completed rounds
  const { data: allRounds = [] } = useQuery<any[]>({
    queryKey: ["/api/counseling-rounds", { counselingTitleId: selectedTitleId }],
    enabled: !!selectedTitleId
  });

  // Filter to only show rounds that have been finalized (executed)
  const finalizedRounds = allRounds.filter(r => r.isAllocationFinalized || r.isAllocationCompleted);

  // Auto-select the latest finalized round when title changes
  useEffect(() => {
    if (finalizedRounds.length > 0) {
      // Pick the highest round number
      const latest = finalizedRounds.reduce((a, b) => (b.roundNumber > a.roundNumber ? b : a), finalizedRounds[0]);
      setSelectedRoundId(latest.id);
    } else {
      setSelectedRoundId("");
    }
  }, [selectedTitleId, finalizedRounds.length]);

  // Fetch BEFORE stats (preSnapshotData)
  const { data: beforeStats, isLoading: beforeLoading } = useQuery<LifecycleStats>({
    queryKey: ["/api/allocation/lifecycle-stats", { counselingTitleId: selectedTitleId, roundId: selectedRoundId, timing: "before" }],
    enabled: !!selectedTitleId && !!selectedRoundId,
  });

  // Fetch AFTER stats (snapshotData)
  const { data: afterStats, isLoading: afterLoading } = useQuery<LifecycleStats>({
    queryKey: ["/api/allocation/lifecycle-stats", { counselingTitleId: selectedTitleId, roundId: selectedRoundId, timing: "after" }],
    enabled: !!selectedTitleId && !!selectedRoundId,
  });

  const isLoading = beforeLoading || afterLoading;
  const selectedRound = allRounds.find(r => r.id === selectedRoundId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold"><BarChart3 className="w-5 h-5 text-primary" /> Student Lifecycle Tracking</DialogTitle>
          <DialogDescription>
            Compare student data snapshots before and after allocation execution.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row gap-4 py-4 mb-2 border-b">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Counseling Title</label>
            <Select value={selectedTitleId} onValueChange={setSelectedTitleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Counseling Title" />
              </SelectTrigger>
              <SelectContent>
                {counselingTitles.map(title => (
                  <SelectItem key={title.id} value={title.id}>{title.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Counseling Round (Executed Only)</label>
            <Select value={selectedRoundId} onValueChange={setSelectedRoundId} disabled={!selectedTitleId || finalizedRounds.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={finalizedRounds.length === 0 ? "No executed rounds" : "Select Round"} />
              </SelectTrigger>
              <SelectContent>
                {finalizedRounds.map(round => (
                  <SelectItem key={round.id} value={round.id}>Round {round.roundNumber}: {round.roundName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Show prompt if no title selected */}
        {!selectedTitleId && (
          <div className="mt-4 p-6 border rounded-md text-amber-800 bg-amber-50 text-sm text-center">
            <AlertCircle className="inline w-5 h-5 mr-2 -mt-0.5" />
            <strong>Select a Counseling Title</strong> to view lifecycle statistics.
          </div>
        )}

        {/* Show prompt if title selected but no finalized rounds */}
        {selectedTitleId && finalizedRounds.length === 0 && (
          <div className="mt-4 p-6 border rounded-md text-slate-600 bg-slate-50 text-sm text-center">
            <AlertCircle className="inline w-5 h-5 mr-2 -mt-0.5" />
            No executed/finalized rounds found for this counseling title yet.
          </div>
        )}

        {/* Two-column data table */}
        {selectedTitleId && selectedRoundId && (
          <div className="rounded-md border shadow-sm mt-4">
            <div className="bg-muted/30 px-4 py-3 border-b flex justify-between items-center">
              <h3 className="font-semibold text-sm">
                Round {selectedRound?.roundNumber} Snapshot Comparison
              </h3>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            <div className="p-0">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/20 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Lifecycle Status</th>
                    <th className="px-4 py-3 font-medium text-right border-l">Before Allocation</th>
                    <th className="px-4 py-3 font-medium text-right border-l">After Allocation</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {STATUS_ROWS.map(row => {
                    const beforeVal = (beforeStats as any)?.[row.key];
                    const afterVal = (afterStats as any)?.[row.key];
                    return (
                      <tr key={row.key} className={row.isBold ? "bg-slate-50/50" : ""}>
                        <td className={`px-4 py-3 whitespace-nowrap ${row.isBold ? "font-semibold text-slate-800" : ""}`}>
                          {row.dotColor && <span className={`inline-flex w-3 h-3 rounded-full ${row.dotColor} mr-2`}></span>}
                          {row.label}
                          {row.hint && <span className="text-muted-foreground text-xs ml-2">{row.hint}</span>}
                        </td>
                        <td className={`px-4 py-3 font-medium text-right border-l ${row.isBold ? "font-bold text-base" : ""} ${row.color}`}>
                          {beforeVal?.toLocaleString() ?? "-"}
                        </td>
                        <td className={`px-4 py-3 font-medium text-right border-l ${row.isBold ? "font-bold text-base" : ""} ${row.color}`}>
                          {afterVal?.toLocaleString() ?? "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
