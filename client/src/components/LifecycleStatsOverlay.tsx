import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, BarChart3 } from "lucide-react";

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
  const [selectedRoundId, setSelectedRoundId] = useState<string>("current");
  const [timing, setTiming] = useState<"before" | "after">("after");

  // Fetch rounds for the selected title
  const { data: rounds = [] } = useQuery<any[]>({
    // Counseling rounds API doesn't currently strictly require `?counselingTitleId` but we'll include it for the queryClient standard
    queryKey: ["/api/counseling-rounds", { counselingTitleId: selectedTitleId }],
    enabled: !!selectedTitleId && selectedTitleId !== "current"
  });

  // Determine active title id for query
  const effectiveTitleId = selectedTitleId || defaultTitleId;

  // Fetch metrics data
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/allocation/lifecycle-stats", { counselingTitleId: effectiveTitleId, roundId: selectedRoundId, timing }],
    enabled: !!effectiveTitleId && effectiveTitleId !== "current",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold"><BarChart3 className="w-5 h-5 text-primary" /> Student Lifecycle Tracking</DialogTitle>
          <DialogDescription>
            Filter by academic counseling and view raw historical state dispersion.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row gap-4 py-4 mb-2 border-b">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Counseling Title</label>
            <Select value={selectedTitleId} onValueChange={setSelectedTitleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Counseling" />
              </SelectTrigger>
              <SelectContent>
                {counselingTitles.map(title => (
                  <SelectItem key={title.id} value={title.id}>{title.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Counseling Round</label>
            <Select value={selectedRoundId} onValueChange={setSelectedRoundId} disabled={!selectedTitleId || rounds.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Round (Default: Live Data)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">-- Current Live Data --</SelectItem>
                {rounds.map(round => (
                  <SelectItem key={round.id} value={round.id}>Round {round.roundNumber}: {round.roundName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Timing Filter</label>
            <Select value={timing} onValueChange={(v: any) => setTiming(v)} disabled={selectedRoundId === "current"}>
              <SelectTrigger>
                <SelectValue placeholder="Timing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="before">Before Run (Baseline)</SelectItem>
                <SelectItem value="after">After Finalization</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dynamic Data Table Box */}
        <div className="rounded-md border shadow-sm mt-4">
          <div className="bg-muted/30 px-4 py-3 border-b flex justify-between items-center">
            <h3 className="font-semibold text-sm">
              {selectedRoundId === "current" ? "Realtime Live Students Snapshot" : `Historical View: ${timing === 'before' ? 'Prior to Allocation' : 'Post Allocation Finalize'}`}
            </h3>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          
          <div className="p-0">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/20 uppercase">
                <tr>
                  <th className="px-6 py-3 font-medium">Lifecycle Status</th>
                  <th className="px-6 py-3 font-medium text-right">Student Track Count</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr className="bg-slate-50/50">
                  <td className="px-6 py-3 font-semibold text-slate-800">Total Valid Students [Total Tracked]</td>
                  <td className="px-6 py-3 font-bold text-slate-800 text-right text-base">{stats?.total?.toLocaleString() ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex w-3 h-3 rounded-full bg-blue-500 mr-2"></span>Registered <span className="text-muted-foreground text-xs ml-2">[Awaiting Preference Upload]</span></td>
                  <td className="px-6 py-3 font-medium text-right text-blue-700">{stats?.registered?.toLocaleString() ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex w-3 h-3 rounded-full bg-amber-500 mr-2"></span>Pending <span className="text-muted-foreground text-xs ml-2">[Unlocked Preferences Available]</span></td>
                  <td className="px-6 py-3 font-medium text-right text-amber-700">{stats?.pending?.toLocaleString() ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex w-3 h-3 rounded-full bg-orange-600 mr-2"></span>Locked <span className="text-muted-foreground text-xs ml-2">[Drafts Finalized & Locked]</span></td>
                  <td className="px-6 py-3 font-medium text-right text-orange-700">{stats?.locked?.toLocaleString() ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex w-3 h-3 rounded-full bg-emerald-500 mr-2"></span>Allotted <span className="text-muted-foreground text-xs ml-2">[Algorithm Matched Seat]</span></td>
                  <td className="px-6 py-3 font-medium text-right text-emerald-700">{stats?.allotted?.toLocaleString() ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex w-3 h-3 rounded-full bg-slate-300 mr-2"></span>Not Allotted <span className="text-muted-foreground text-xs ml-2">[Algorithm Skipped/Exhausted]</span></td>
                  <td className="px-6 py-3 font-medium text-right text-slate-700">{stats?.not_allotted?.toLocaleString() ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex w-3 h-3 rounded-full bg-green-600 mr-2"></span>Admitted <span className="text-muted-foreground text-xs ml-2">[Seat Officially Claimed]</span></td>
                  <td className="px-6 py-3 font-medium text-right text-green-700">{stats?.admitted?.toLocaleString() ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex w-3 h-3 rounded-full bg-red-600 mr-2"></span>Not Admitted <span className="text-muted-foreground text-xs ml-2">[No Show Record]</span></td>
                  <td className="px-6 py-3 font-medium text-right text-red-700">{stats?.not_admitted?.toLocaleString() ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex w-3 h-3 rounded-full bg-purple-600 mr-2"></span>Vacated <span className="text-muted-foreground text-xs ml-2">[Seat Formally Discarded]</span></td>
                  <td className="px-6 py-3 font-medium text-right text-purple-700">{stats?.vacated?.toLocaleString() ?? "-"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {(!effectiveTitleId || effectiveTitleId === "current") && (
          <div className="mt-4 p-4 border rounded-md text-amber-800 bg-amber-50 text-sm">
            <TrendingUp className="inline w-4 h-4 mr-2"/>
            <strong>Note:</strong> You must first select an active Counseling Title to evaluate historical data. If 'Round' reads 'Current Live Data', it reflects the immediate live rows mapped to this specific counseling tracking group!
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
