import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AcademicYearSelector } from "@/components/ui/academic-year-selector";
import AllocationModal from "@/components/modals/allocation-modal";
import ResetModal from "@/components/modals/reset-modal";
import {
  Calendar,
  Plus,
  Play,
  CheckCircle,
  Clock,
  Edit,
  AlertTriangle,
  Trash2,
  Rocket,
  Pause,
  PlayCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { format } from "date-fns";

const createTitleSchema = z.object({
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, "Format: YYYY-YYYY (e.g., 2024-2025)"),
  roundName: z.string().min(1, "Counseling title is required"),
});

type CreateTitleForm = z.infer<typeof createTitleSchema>;

interface CounselingRound {
  id: string;
  academicYear: string;
  roundNumber: number;
  roundName: string | null;
  startDate: string;
  isActive: boolean;
  isCompleted: boolean;
  isSuspended?: boolean;
  isAllocationCompleted?: boolean;
  isAllocationFinalized?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PrerequisitesStatus {
  hasVacancyData: boolean;
  vacancyCount: number;
  totalAvailableSeats: number;
  hasEntranceResults: boolean;
  entranceResultsCount: number;
  hasStudentChoices: boolean;
  studentsWithChoicesCount: number;
  lockedStudentsCount: number;
  studentsWithMeritDataCount: number;
  allDistrictsFinalized: boolean;
  totalDistrictsCount: number;
  finalizedDistrictsCount: number;
  isAllocationFinalized: boolean;
  allPrerequisitesMet: boolean;
}

// Component to handle prerequisites checking and display for Run Allocation button
function PrerequisitesButton({
  round,
  onRunAllocation,
  isPending
}: {
  round: CounselingRound;
  onRunAllocation: (round: CounselingRound) => void;
  isPending: boolean;
}) {
  const { data: prerequisites, isLoading } = useQuery<PrerequisitesStatus>({
    queryKey: ["/api/counseling-rounds", round.id, "prerequisites"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/counseling-rounds/${round.id}/prerequisites`);
      return await res.json();
    },
    enabled: round.isActive && !round.isCompleted,
  });

  const canRunAllocation = prerequisites?.allPrerequisitesMet ?? false;
  const missingPrerequisites: string[] = [];

  if (prerequisites) {
    if (!prerequisites.hasVacancyData) {
      missingPrerequisites.push(`Vacancy data (${prerequisites.totalAvailableSeats} seats)`);
    }
    if (!prerequisites.hasEntranceResults) {
      missingPrerequisites.push(`Entrance results (${prerequisites.entranceResultsCount} found)`);
    }
    if (!prerequisites.hasStudentChoices) {
      missingPrerequisites.push(`Student choices (${prerequisites.studentsWithChoicesCount} students)`);
    }
    if (prerequisites.hasStudentChoices && prerequisites.hasEntranceResults && prerequisites.studentsWithMeritDataCount === 0) {
      missingPrerequisites.push(`Merit matching failed`);
    }
    if (!prerequisites.allDistrictsFinalized) {
      missingPrerequisites.push(`District finalizations (${prerequisites.finalizedDistrictsCount}/${prerequisites.totalDistrictsCount})`);
    }
    if (!prerequisites.isAllocationFinalized) {
      missingPrerequisites.push(`Central Data Lock`);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="icon"
        variant="default"
        onClick={() => onRunAllocation(round)}
        disabled={isPending || isLoading || !canRunAllocation || round.isAllocationCompleted}
        className="bg-green-600 hover:bg-green-700 h-8 w-8"
        title={
          round.isAllocationCompleted
            ? "Allocation is already completed for this round. Please reset it first."
            : isLoading
              ? "Checking prerequisites..."
              : !canRunAllocation
                ? `Prerequisites not met: ${missingPrerequisites.join(", ")}`
                : "Run allocation"
        }
      >
        <Rocket className="w-4 h-4" />
      </Button>
      {prerequisites && !canRunAllocation && (
        <div className="text-xs text-muted-foreground max-w-[200px]">
          Missing: {missingPrerequisites.join(", ")}
        </div>
      )}
    </div>
  );
}

/**
 * Shared component to show the readiness status of a round
 */
const PrerequisitesCell = ({ round }: { round: CounselingRound }) => {
  const { data: prerequisites, isLoading: isLoadingPrerequisites } = useQuery<PrerequisitesStatus>({
    queryKey: ["/api/counseling-rounds", round.id, "prerequisites"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/counseling-rounds/${round.id}/prerequisites`);
      return await res.json();
    },
    enabled: round.isActive && !round.isCompleted,
  });

  if (!round.isActive || round.isCompleted) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  if (isLoadingPrerequisites) {
    return <span className="text-xs text-muted-foreground">Checking...</span>;
  }

  if (!prerequisites) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className={`flex items-center gap-1 ${prerequisites.hasVacancyData ? 'text-green-600' : 'text-red-600'}`}>
        {prerequisites.hasVacancyData ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        <span>Vacancies: {prerequisites.totalAvailableSeats}</span>
      </div>
      <div className={`flex items-center gap-1 ${prerequisites.hasEntranceResults ? 'text-green-600' : 'text-red-600'}`}>
        {prerequisites.hasEntranceResults ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        <span>Results: {prerequisites.entranceResultsCount}</span>
      </div>
      <div className={`flex items-center gap-1 ${prerequisites.hasStudentChoices ? 'text-green-600' : 'text-red-600'}`}>
        {prerequisites.hasStudentChoices ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        <span>Choices: {prerequisites.lockedStudentsCount}/{prerequisites.studentsWithChoicesCount}</span>
      </div>
      <div className={`flex items-center gap-1 ${prerequisites.allDistrictsFinalized ? 'text-green-600' : 'text-red-600'}`}>
        {prerequisites.allDistrictsFinalized ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        <span>Districts: {prerequisites.finalizedDistrictsCount}/{prerequisites.totalDistrictsCount}</span>
      </div>
      <div className={`flex items-center gap-1 ${prerequisites.isAllocationFinalized ? 'text-green-600' : 'text-red-600'}`}>
        {prerequisites.isAllocationFinalized ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        <span>Data Locked & Ready</span>
      </div>
    </div>
  );
};

export default function CounselingRounds() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRound, setEditingRound] = useState<CounselingRound | null>(null);
  const [editStartDate, setEditStartDate] = useState<string>("");
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [allocationRoundId, setAllocationRoundId] = useState<string | null>(null);
  const [resetRoundId, setResetRoundId] = useState<string | null>(null);
  const [selectedRoundIds, setSelectedRoundIds] = useState<string[]>([]);
  const [expandedRoundIds, setExpandedRoundIds] = useState<Set<string>>(new Set());

  const toggleRoundExpansion = (id: string) => {
    setExpandedRoundIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // Fetch current session
  const { data: currentSessionData } = useQuery<{ currentSession: string }>({
    queryKey: ["/api/session/current"],
    enabled: true,
  });
  const currentSession = currentSessionData?.currentSession || "";

  // Set selected academic year to current session when loaded
  useEffect(() => {
    if (currentSession && !selectedAcademicYear) {
      setSelectedAcademicYear(currentSession);
    }
  }, [currentSession, selectedAcademicYear]);

  const form = useForm<CreateTitleForm>({
    resolver: zodResolver(createTitleSchema),
    defaultValues: {
      academicYear: selectedAcademicYear || "",
      roundName: "",
    },
  });

  // Sync form when selectedAcademicYear changes
  useEffect(() => {
    if (selectedAcademicYear) {
      form.setValue("academicYear", selectedAcademicYear);
    }
  }, [selectedAcademicYear, form]);

  // Fetch counseling rounds
  const { data: rounds, isLoading, error, refetch } = useQuery<CounselingRound[]>({
    queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }],
    queryFn: async ({ queryKey }) => {
      if (!selectedAcademicYear) return [];
      const url = `/api/counseling-rounds?academicYear=${encodeURIComponent(selectedAcademicYear)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch rounds:", res.status, errorText);
        let errorMessage = `Failed to fetch: ${res.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If parsing fails, use the text as is
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      const data = await res.json();
      console.log(`Fetched ${data.length} rounds for ${selectedAcademicYear}:`, data);
      return data;
    },
    enabled: !!selectedAcademicYear,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Create counseling title mutation (auto-creates first round)
  const createTitleMutation = useMutation({
    mutationFn: async (data: CreateTitleForm) => {
      const res = await apiRequest("POST", "/api/counseling-titles", {
        academicYear: data.academicYear,
        roundName: data.roundName,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      setShowCreateDialog(false);
      form.reset();
      toast({
        title: "Success",
        description: data.message || "Counseling title created successfully. Round 1 has been auto-created.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create counseling title",
        variant: "destructive",
      });
    },
  });

  // Suspend/unsuspend mutation
  const suspendMutation = useMutation({
    mutationFn: async ({ academicYear, roundName, suspend }: { academicYear: string; roundName: string; suspend: boolean }) => {
      const res = await apiRequest("POST", `/api/counseling-titles/${encodeURIComponent(academicYear)}/${encodeURIComponent(roundName)}/suspend`, {
        suspend,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      toast({
        title: "Success",
        description: data.message || (data.suspend ? "Subsequent rounds suspended" : "Subsequent rounds unsuspended"),
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to suspend/unsuspend",
        variant: "destructive",
      });
    },
  });

  // Delete round mutation
  const deleteRoundMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/counseling-rounds/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      toast({
        title: "Success",
        description: "Counseling round deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete counseling round",
        variant: "destructive",
      });
    },
  });

  // Finalize round mutation — marks round as completed, blocks further allocations
  const finalizeRoundMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/counseling-rounds/${id}`, { isCompleted: true, isActive: false });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      toast({
        title: "Round Finalized",
        description: "Counseling round has been finalized. No further allocations can be run for this round.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to finalize round",
        variant: "destructive",
      });
    },
  });


  // Run allocation: open modal instead of native confirm
  const handleRunAllocation = (round: CounselingRound) => {
    setAllocationRoundId(round.id);
    setAllocationModalOpen(true);
  };

  const updateRoundMutation = useMutation({
    mutationFn: async ({ id, startDate }: { id: string; startDate: string }) => {
      const res = await apiRequest("PUT", `/api/counseling-rounds/${id}`, { startDate });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      const wasDeactivated = editingRound?.isActive === true && data?.isActive === false;
      setEditingRound(null);
      setEditStartDate("");
      toast({
        title: "Success",
        description: wasDeactivated
          ? "Start date updated successfully. Round has been deactivated because the new date is in the future."
          : "Start date updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update start date",
        variant: "destructive",
      });
    },
  });

  const handleCreateTitle = (data: CreateTitleForm) => {
    createTitleMutation.mutate(data);
  };

  const handleSuspend = (round: CounselingRound, suspend: boolean) => {
    if (!round.roundName) return;
    suspendMutation.mutate({
      academicYear: round.academicYear,
      roundName: round.roundName,
      suspend,
    });
  };

  const handleDelete = (round: CounselingRound) => {
    if (confirm(`Delete ${round.roundName} - Round ${round.roundNumber}? This action cannot be undone.`)) {
      deleteRoundMutation.mutate(round.id);
    }
  };

  const handleRunAllocation_OLD = (round: CounselingRound) => {
    if (confirm(`Run allocation for ${round.roundName} - Round ${round.roundNumber}? This will assign vacant seats to eligible students.`)) {
      // Run via the mutation (legacy path)
    }
  };

  const canDelete = (round: CounselingRound) => {
    return !round.isActive && !round.isCompleted;
  };

  const isPastRound = (round: CounselingRound) => {
    // Database column is TIMESTAMP type (datetime)
    // Parse ISO timestamp string or Date object
    let startDate: Date;
    if (typeof round.startDate === 'string') {
      startDate = new Date(round.startDate);
    } else if (round.startDate && typeof round.startDate === 'object' && 'getTime' in round.startDate) {
      startDate = round.startDate as Date;
    } else {
      startDate = new Date(round.startDate as string);
    }

    if (isNaN(startDate.getTime())) {
      return false; // Invalid date, don't consider it past
    }

    const now = new Date();
    return startDate < now;
  };

  // Get round status display
  const getRoundStatus = (round: CounselingRound): { text: string; variant: "default" | "secondary" | "destructive"; className: string; icon: any } => {
    // Priority: Completed > Suspended > Active > Inactive
    if (round.isCompleted) {
      return {
        text: "Completed",
        variant: "default",
        className: "bg-green-600",
        icon: CheckCircle
      };
    }

    if (round.isSuspended) {
      return {
        text: "Suspended",
        variant: "destructive",
        className: "bg-orange-600",
        icon: Pause
      };
    }

    if (round.isActive) {
      return {
        text: "Active",
        variant: "default",
        className: "bg-blue-600",
        icon: Play
      };
    }

    return {
      text: "Inactive",
      variant: "secondary",
      className: "",
      icon: Clock
    };
  };

  const handleEdit = (round: CounselingRound) => {
    // Check if startDate exists and is valid
    if (!round.startDate || round.startDate === 'null' || round.startDate === null) {
      console.error('No startDate in round:', round);
      toast({
        title: "Error",
        description: "This round has no start date. Please delete and recreate it with a valid date.",
        variant: "destructive",
      });
      return;
    }

    // Database column is TIMESTAMP type (datetime with time)
    // Handle both ISO timestamp strings and Date objects
    let startDate: Date;

    if (typeof round.startDate === 'string') {
      // Parse ISO timestamp string (e.g., "2024-06-15T10:00:00.000Z" or "2024-06-15T10:00:00")
      startDate = new Date(round.startDate);
    } else if (round.startDate && typeof round.startDate === 'object' && 'getTime' in round.startDate) {
      startDate = round.startDate as Date;
    } else {
      // Try to parse as Date
      startDate = new Date(round.startDate as string);
    }

    // Check if date is valid
    if (isNaN(startDate.getTime()) || startDate.getFullYear() < 2000) {
      console.error('Invalid date received:', {
        roundId: round.id,
        startDate: round.startDate,
        startDateType: typeof round.startDate,
        timestamp: startDate.getTime(),
        year: startDate.getFullYear()
      });
      toast({
        title: "Error",
        description: `Invalid date detected (${round.startDate}). Please delete this round and recreate it with a valid date.`,
        variant: "destructive",
      });
      return;
    }

    // Convert to datetime-local format (YYYY-MM-DDTHH:mm)
    // datetime-local expects local time without timezone
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const hours = String(startDate.getHours()).padStart(2, '0');
    const minutes = String(startDate.getMinutes()).padStart(2, '0');
    const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
    setEditStartDate(datetimeLocal);
    setEditingRound(round);
  };

  const handleSaveEdit = () => {
    if (editingRound && editStartDate) {
      // Validate that the date is not in the past
      const selectedDate = new Date(editStartDate);
      const now = new Date();

      if (selectedDate < now) {
        toast({
          title: "Error",
          description: "Start date cannot be set to a past date. Please select a future date and time.",
          variant: "destructive",
        });
        return;
      }

      updateRoundMutation.mutate({ id: editingRound.id, startDate: editStartDate });
    }
  };

  const toggleRoundSelection = (id: string) => {
    setSelectedRoundIds(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const toggleAllRounds = () => {
    if (!rounds) return;
    if (selectedRoundIds.length === rounds.length) {
      setSelectedRoundIds([]);
    } else {
      setSelectedRoundIds(rounds.map(r => r.id));
    }
  };

  const exportSelectedRounds = (format: 'csv' | 'pdf') => {
    if (selectedRoundIds.length === 0) return;
    const idsParams = selectedRoundIds.join(',');
    window.open(`/api/export/counseling/${format}?roundIds=${idsParams}`, '_blank');
  };

  // Removed restrictive central admin block to allow read-only access for district admins

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Counseling Rounds Management"
        breadcrumbs={[
          { name: "Home" },
          { name: "Operations" },
          { name: "Counseling Rounds" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Academic Year Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                Select Academic Year
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <AcademicYearSelector
                  value={selectedAcademicYear}
                  onValueChange={setSelectedAcademicYear}
                  className="max-w-xs"
                />
                {currentSession && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="w-4 h-4" />
                    <span>
                      <strong>Note:</strong> You can only create counseling rounds and run allocations for the current session ({currentSession}).
                      {selectedAcademicYear && selectedAcademicYear !== currentSession && (
                        <span className="text-destructive ml-1">
                          Selected year is not the current session.
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Rounds List */}
          {selectedAcademicYear && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Counseling Rounds - {selectedAcademicYear}</CardTitle>
                {user?.role === 'central_admin' && (
                  <div className="flex items-center gap-2 border-l pl-4 ml-4 border-slate-200">
                    {selectedRoundIds.length > 0 && (
                      <div className="flex items-center gap-2 mr-2 bg-slate-50 p-1 rounded-md border border-slate-200">
                        <span className="text-sm px-2 text-slate-600 font-medium">{selectedRoundIds.length} selected</span>
                        <Button size="sm" variant="outline" onClick={() => exportSelectedRounds('csv')} className="h-8 bg-white" title="Download CSV">
                          <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" /> Export CSV
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => exportSelectedRounds('pdf')} className="h-8 bg-white" title="Download PDF">
                          <FileText className="w-4 h-4 mr-2 text-red-500" /> Export PDF
                        </Button>
                      </div>
                    )}
                    {(!rounds || rounds.every(r => r.isCompleted)) && (
                      <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Counseling Title
                      </Button>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : error ? (
                  <div className="text-red-600 p-4 border border-red-300 rounded bg-red-50">
                    <p className="font-semibold mb-2">Error loading rounds:</p>
                    <p className="text-sm mb-3">{error instanceof Error ? error.message : String(error)}</p>
                    <Button onClick={() => refetch()} className="mt-2" size="sm" variant="outline">
                      Retry
                    </Button>
                  </div>
                ) : rounds && rounds.length > 0 ? (
                  <>
                    {/* MOBILE LIST VIEW (<md) */}
                    <div className="md:hidden divide-y rounded-md border min-w-full">
                      {rounds.map((round) => {
                        const isExpanded = expandedRoundIds.has(round.id);
                        return (
                          <div key={round.id} className={`p-3 bg-white ${selectedRoundIds.includes(round.id) ? "bg-slate-50" : ""}`}>
                            {/* Collapsed view */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary cursor-pointer shrink-0"
                                  checked={selectedRoundIds.includes(round.id)}
                                  onChange={() => toggleRoundSelection(round.id)}
                                />
                                <button
                                  className="flex-1 text-left flex items-center gap-2 min-w-0"
                                  onClick={() => toggleRoundExpansion(round.id)}
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm truncate">{round.roundName}</p>
                                    <p className="text-xs text-muted-foreground font-mono">Round #{round.roundNumber}</p>
                                  </div>
                                </button>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {(() => {
                                  const status = getRoundStatus(round);
                                  const Icon = status.icon;
                                  return (
                                    <Badge variant={status.variant} className={`text-xs px-1.5 py-0 ${status.className}`}>
                                      <Icon className="w-3 h-3 mr-1" />
                                      {status.text}
                                    </Badge>
                                  );
                                })()}
                              </div>
                            </div>
                            
                            {/* Expanded view */}
                            {isExpanded && (
                              <div className="mt-3 ml-8 space-y-2 text-sm border-t pt-2">
                                <div className="grid grid-cols-1 gap-y-1.5">
                                  <div>
                                    <span className="text-muted-foreground text-xs uppercase font-semibold">Start Date & Time: </span>
                                    <span className="text-sm">
                                      {round.startDate && round.startDate !== 'null' ? (
                                        (() => {
                                          try {
                                            const date = new Date(round.startDate);
                                            if (!isNaN(date.getTime())) {
                                              return format(date, "MMM dd, yyyy HH:mm");
                                            }
                                          } catch (e) {}
                                          return <span className="text-muted-foreground italic">Invalid date</span>;
                                        })()
                                      ) : (
                                        <span className="text-muted-foreground italic">No date set</span>
                                      )}
                                    </span>
                                  </div>
                                  
                                  {user?.role === 'central_admin' && (
                                    <div className="mt-1">
                                      <span className="text-muted-foreground text-xs uppercase font-semibold block mb-1">Readiness & Prerequisites:</span>
                                      <PrerequisitesCell round={round} />
                                    </div>
                                  )}
                                </div>
                                
                                {user?.role === 'central_admin' && (
                                  <div className="flex flex-wrap gap-1.5 pt-2 mt-2 border-t border-slate-100">
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleEdit(round)} disabled={round.isCompleted}>
                                      <Edit className="w-3 h-3 mr-1" /> Edit
                                    </Button>
                                    
                                    {round.roundNumber === 1 && (
                                      <Button
                                        size="sm" variant="outline" className={`h-7 text-xs ${round.isSuspended ? "text-orange-600" : ""}`}
                                        onClick={() => handleSuspend(round, !round.isSuspended)} disabled={suspendMutation.isPending}
                                      >
                                        {round.isSuspended ? <PlayCircle className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
                                        {round.isSuspended ? "Unsuspend" : "Suspend"}
                                      </Button>
                                    )}
                                    
                                    {round.isActive && !round.isCompleted && (
                                      <PrerequisitesButton round={round} onRunAllocation={handleRunAllocation} isPending={false} />
                                    )}

                                    {!round.isCompleted && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200" onClick={() => setResetRoundId(round.id)}>
                                        <Trash2 className="w-3 h-3 mr-1" /> Reset
                                      </Button>
                                    )}

                                    {round.isAllocationCompleted && !round.isCompleted && (
                                      <Button
                                        size="sm" variant="default" className="h-7 text-xs bg-purple-600"
                                        onClick={() => {
                                          if (confirm(`Finalize Counseling Round ${round.roundNumber}?\nThis is permanent.`)) {
                                            finalizeRoundMutation.mutate(round.id);
                                          }
                                        }} disabled={finalizeRoundMutation.isPending}
                                      >
                                        <ShieldCheck className="w-3 h-3 mr-1" /> Finalize
                                      </Button>
                                    )}
                                    
                                    {canDelete(round) && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 ml-auto" onClick={() => handleDelete(round)} disabled={deleteRoundMutation.isPending || isPastRound(round)}>
                                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* DESKTOP TABLE VIEW (>=md) */}
                    <div className="hidden md:block rounded-md overflow-x-auto">
                      <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary mx-2 cursor-pointer"
                            checked={rounds && rounds.length > 0 && selectedRoundIds.length === rounds.length}
                            onChange={toggleAllRounds}
                          />
                        </TableHead>
                        <TableHead>Counseling Title</TableHead>
                        <TableHead>Round No.</TableHead>
                        <TableHead>Start Date & Time</TableHead>
                        <TableHead>Status</TableHead>
                        {user?.role === 'central_admin' && <TableHead>Prerequisites</TableHead>}
                        {user?.role === 'central_admin' && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rounds.map((round) => {

                        return (
                          <TableRow key={round.id} className={selectedRoundIds.includes(round.id) ? "bg-slate-50/50" : ""}>
                            <TableCell>
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary mx-2 cursor-pointer"
                                checked={selectedRoundIds.includes(round.id)}
                                onChange={() => toggleRoundSelection(round.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {round.roundName}
                            </TableCell>
                            <TableCell className="font-medium">
                              {round.roundNumber}
                            </TableCell>
                            <TableCell>
                              {round.startDate && round.startDate !== 'null' ? (
                                (() => {
                                  try {
                                    const date = new Date(round.startDate);
                                    if (!isNaN(date.getTime())) {
                                      return format(date, "MMM dd, yyyy HH:mm");
                                    }
                                  } catch (e) {
                                    console.error('Error formatting date:', round.startDate, e);
                                  }
                                  return <span className="text-muted-foreground italic">Invalid date</span>;
                                })()
                              ) : (
                                <span className="text-muted-foreground italic">No date set</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const status = getRoundStatus(round);
                                const Icon = status.icon;
                                return (
                                  <Badge variant={status.variant} className={status.className}>
                                    <Icon className="w-3 h-3 mr-1" />
                                    {status.text}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            {user?.role === 'central_admin' && (
                              <TableCell>
                                <PrerequisitesCell round={round} />
                              </TableCell>
                            )}
                            {user?.role === 'central_admin' && (
                              <TableCell>
                                <div className="flex items-center space-x-2 flex-wrap gap-1">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={() => handleEdit(round)}
                                    disabled={round.isCompleted}
                                    title="Edit Start Date"
                                    className="h-8 w-8"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  {round.roundNumber === 1 && (
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => handleSuspend(round, !round.isSuspended)}
                                      disabled={suspendMutation.isPending}
                                      className={`h-8 w-8 ${round.isSuspended ? "text-orange-600 hover:text-orange-700" : ""}`}
                                      title={round.isSuspended ? "Unsuspend subsequent rounds" : "Suspend subsequent rounds"}
                                    >
                                      {round.isSuspended ? <PlayCircle className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                    </Button>
                                  )}
                                  {round.isActive && !round.isCompleted && (
                                    <>
                                      <PrerequisitesButton
                                        round={round}
                                        onRunAllocation={handleRunAllocation}
                                        isPending={false}
                                      />
                                    </>
                                  )}
                                   {/* Reset Round: clears allotted data for this round */}
                                   {!round.isCompleted && (
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => setResetRoundId(round.id)}
                                      className="text-red-600 border-red-400 hover:bg-red-50 h-8 w-8"
                                      title="Reset Round Data"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                   )}
                                  {/* Finalize Round: locks the round permanently after allocation is accepted */}
                                  {round.isAllocationCompleted && !round.isCompleted && (
                                    <Button
                                      size="icon"
                                      variant="default"
                                      onClick={() => {
                                        if (confirm(`Finalize Counseling Round ${round.roundNumber} ("${round.roundName}")?\n\nThis will permanently close this round — no further allocations can be run. This cannot be undone.`)) {
                                          finalizeRoundMutation.mutate(round.id);
                                        }
                                      }}
                                      disabled={finalizeRoundMutation.isPending}
                                      className="bg-purple-600 hover:bg-purple-700 text-white h-8 w-8"
                                      title={`Finalize Round ${round.roundNumber}`}
                                    >
                                      <ShieldCheck className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {canDelete(round) && (
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => handleDelete(round)}
                                      disabled={deleteRoundMutation.isPending || isPastRound(round)}
                                      className="text-red-600 hover:text-red-700 h-8 w-8"
                                      title={isPastRound(round) ? "Cannot delete past counseling rounds" : "Delete round"}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">
                      No counseling rounds found for {selectedAcademicYear}
                    </p>
                    {user?.role === 'central_admin' && (
                      <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Counseling Title
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!selectedAcademicYear && (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Please select an academic year to view or create counseling rounds
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Create Counseling Title Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Counseling Title</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateTitle)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="academicYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Academic Year</FormLabel>
                      <FormControl>
                        <AcademicYearSelector
                          value={field.value}
                          onValueChange={field.onChange}
                          showLabel={false}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="roundName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Counseling Title *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Meritorious School, Regular Counseling, Special Counseling" {...field} />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        Create a counseling title (e.g., "Meritorious School", "Regular Counseling").
                        Round 1 will be automatically created with the current date/time. You can edit the start date/time later.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <strong>Note:</strong> Before the first round can run allocation, you must upload:
                        vacancy data, entrance results, and student choices for this counseling title.
                      </p>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateDialog(false);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createTitleMutation.isPending}>
                    {createTitleMutation.isPending ? "Creating..." : "Create Counseling Title"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Edit Start Date Dialog */}
        <Dialog open={!!editingRound} onOpenChange={(open) => !open && setEditingRound(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Start Date & Time</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Start Date & Time</label>
                <Input
                  type="datetime-local"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  min={(() => {
                    // Set min to current date/time
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    return `${year}-${month}-${day}T${hours}:${minutes}`;
                  })()}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Round will automatically activate when this date/time is reached. Date cannot be in the past.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingRound(null);
                  setEditStartDate("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={!editStartDate || updateRoundMutation.isPending}
              >
                {updateRoundMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      {/* Allocation Modal */}
      <AllocationModal
        open={allocationModalOpen}
        onOpenChange={(open) => {
          setAllocationModalOpen(open);
          if (!open) {
            setAllocationRoundId(null);
            // Refresh rounds after modal closes
            queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
            refetch();
          }
        }}
        roundId={allocationRoundId}
      />
      <ResetModal
        open={!!resetRoundId}
        onOpenChange={(open) => !open && setResetRoundId(null)}
        roundId={resetRoundId}
        roundName={rounds?.find(r => r.id === resetRoundId)?.roundName || null}
        roundNumber={rounds?.find(r => r.id === resetRoundId)?.roundNumber || 0}
      />
    </div>
  );
}
