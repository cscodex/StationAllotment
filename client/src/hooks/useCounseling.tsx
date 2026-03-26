import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CounselingTitle, YearSession } from "@shared/schema";

interface CounselingContextType {
  // Session / Year
  sessions: YearSession[];
  activeSession: string;
  setActiveSession: (year: string) => void;
  isLoadingSessions: boolean;

  // Title
  titles: CounselingTitle[];
  activeTitle: CounselingTitle | null;
  setActiveTitleId: (id: string | null) => void;
  isLoadingTitles: boolean;
}

const CounselingContext = createContext<CounselingContextType | undefined>(undefined);

export function CounselingProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<string>("");
  const [activeTitleId, setActiveTitleId] = useState<string | null>(null);

  // Fetch all sessions
  const { data: sessions = [], isLoading: isLoadingSessions } = useQuery<YearSession[]>({
    queryKey: ['/api/year-sessions'],
    staleTime: 60 * 60 * 1000,
  });

  // Default active session to currently active session from DB
  useEffect(() => {
    if (sessions.length > 0 && !activeSession) {
      const current = sessions.find(s => s.isCurrent) || sessions.find(s => s.isActive);
      if (current) {
        setActiveSession(current.sessionName);
      } else {
        setActiveSession(sessions[0].sessionName);
      }
    }
  }, [sessions, activeSession]);

  // Fetch active counseling titles for the selected academic year
  const { data: titles = [], isLoading: isLoadingTitles } = useQuery<CounselingTitle[]>({
    queryKey: ['/api/counseling-titles/active', { academicYear: activeSession }],
    enabled: !!activeSession,
  });

  // We no longer default active title so that a modal can force selection.
  useEffect(() => {
    if (titles.length === 0) {
      setActiveTitleId(null);
    }
    // Check if current activeTitleId is still valid in the new session's titles
    if (activeTitleId && titles.length > 0 && !titles.find(t => t.id === activeTitleId)) {
      setActiveTitleId(null);
    }
  }, [titles, activeTitleId]);

  const activeTitle = titles.find(t => t.id === activeTitleId) || null;

  return (
    <CounselingContext.Provider value={{
      sessions,
      activeSession,
      setActiveSession,
      isLoadingSessions,
      titles,
      activeTitle,
      setActiveTitleId,
      isLoadingTitles
    }}>
      {children}
    </CounselingContext.Provider>
  );
}

export function useCounseling() {
  const context = useContext(CounselingContext);
  if (context === undefined) {
    throw new Error("useCounseling must be used within a CounselingProvider");
  }
  return context;
}
