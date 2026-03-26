import { useCounseling } from "@/hooks/useCounseling";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, GraduationCap, Loader2 } from "lucide-react";

export function GlobalCounselingSelector() {
  const { 
    sessions, activeSession, setActiveSession, isLoadingSessions,
    titles, activeTitle, setActiveTitleId, isLoadingTitles
  } = useCounseling();

  // If no sessions or titles, don't optionally render yet or render loading state
  if (isLoadingSessions) {
    return (
      <div className="flex items-center space-x-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading session context...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-4 bg-white/50 px-4 py-2 rounded-lg border border-slate-200">
      
      {/* Session Selector */}
      <div className="flex items-center space-x-2">
        <div className="bg-primary/10 p-1.5 rounded-md">
          <CalendarDays className="w-4 h-4 text-primary" />
        </div>
        <Select
          value={activeSession || ""}
          onValueChange={setActiveSession}
          disabled={isLoadingSessions || sessions.length === 0}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs font-medium border-0 bg-transparent shadow-none focus:ring-0 px-2 hover:bg-slate-100 transition-colors">
            <SelectValue placeholder="Select Year" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.sessionName} className="text-xs">
                {session.sessionName} {session.isActive ? "(Current)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-px h-6 bg-slate-300"></div>

      {/* Title Selector */}
      <div className="flex items-center space-x-2">
        <div className="bg-blue-100 p-1.5 rounded-md">
          <GraduationCap className="w-4 h-4 text-blue-600" />
        </div>
        <Select
          value={activeTitle?.id || ""}
          onValueChange={setActiveTitleId}
          disabled={isLoadingTitles || titles.length === 0}
        >
          <SelectTrigger className="w-[220px] h-8 text-xs font-medium border-0 bg-transparent shadow-none focus:ring-0 px-2 hover:bg-slate-100 transition-colors">
            {isLoadingTitles ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading titles...</span>
              </div>
            ) : (
              <SelectValue placeholder={titles.length > 0 ? "Select Title" : "No Titles Available"} />
            )}
          </SelectTrigger>
          <SelectContent>
            {titles.map((title) => (
              <SelectItem key={title.id} value={title.id} className="text-xs">
                {title.displayName || title.titleName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
