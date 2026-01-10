import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface YearSession {
  id: string;
  sessionName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isActive: boolean;
}

interface AcademicYearSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  className?: string;
  showLabel?: boolean;
}

export function AcademicYearSelector({
  value,
  onValueChange,
  className,
  showLabel = true,
}: AcademicYearSelectorProps) {
  // Fetch sessions from year_session table
  const { data: sessions, isLoading } = useQuery<YearSession[]>({
    queryKey: ["/api/year-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/year-sessions", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch year sessions");
      }
      return res.json();
    },
  });

  // Get only active sessions, sorted by session name (descending - newest first)
  const activeSessions = (sessions || [])
    .filter((s: YearSession) => s.isActive)
    .sort((a: YearSession, b: YearSession) => b.sessionName.localeCompare(a.sessionName));

  // Find current session
  const currentSession = sessions?.find((s: YearSession) => s.isCurrent);

  // Set default to current session when sessions are loaded
  useEffect(() => {
    if (!value && currentSession) {
      onValueChange(currentSession.sessionName);
    } else if (!value && activeSessions.length > 0) {
      // Fallback to first active session if no current session
      onValueChange(activeSessions[0].sessionName);
    }
  }, [value, currentSession, activeSessions, onValueChange]);

  return (
    <div className={className}>
      {showLabel && (
        <label className="text-sm font-medium mb-2 block">Academic Year</label>
      )}
      <Select value={value} onValueChange={onValueChange} disabled={isLoading}>
        <SelectTrigger className="w-full">
          <Calendar className="w-4 h-4 mr-2" />
          <SelectValue placeholder={isLoading ? "Loading sessions..." : "Select academic year"} />
        </SelectTrigger>
        <SelectContent>
          {activeSessions.length === 0 && !isLoading && (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              No sessions available
            </div>
          )}
          {activeSessions.map((session: YearSession) => (
            <SelectItem key={session.id} value={session.sessionName}>
              <div className="flex items-center gap-2">
                {session.sessionName}
                {session.isCurrent && (
                  <span className="flex items-center text-green-600 text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Current
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
