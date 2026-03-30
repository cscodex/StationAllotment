import { useState, useMemo, useEffect } from "react";
import { useSidebarToggle } from "@/components/layout/main-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useCounseling } from "@/hooks/useCounseling";
import {
  Search,
  UserCog,
  Edit,
  Save,
  X,
  Clock,
  AlertTriangle,
  CheckCircle,
  Eye,
  Lock,
  Unlock,
  XCircle,
  Loader2,
  Camera,
  UploadCloud,
  DownloadCloud,
  FileText,
  ChevronDown,
  ChevronUp,
  Filter,
  RefreshCw,
  UserCheck,
  UserX,
  UserMinus,
  MoreVertical,
  HelpCircle,
  Info,
  BarChart3
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Student } from "@shared/schema";
import { SCHOOL_DISTRICTS, COUNSELING_DISTRICTS } from "@shared/schema";
import OMRScannerModal from "@/components/dashboard/omr-scanner-modal";
import { BulkScannerModal, type ScannedPageInfo } from "@/components/dashboard/bulk-scanner-modal";
import { LiveOMRScannerModal } from "@/components/dashboard/live-omr-scanner";
import { LifecycleStatsOverlay } from "@/components/LifecycleStatsOverlay";

const DISTRICTS = SCHOOL_DISTRICTS;
const STREAMS = ["NA", "Medical", "Non-Medical", "Commerce"];

// Map display names to DB-stored values
const STREAM_DB_MAP: Record<string, string> = { "NA": "NA", "Medical": "Medical", "Non-Medical": "NonMedical", "Commerce": "Commerce" };
const STREAM_DISPLAY_MAP: Record<string, string> = { "NA": "NA", "Medical": "Medical", "NonMedical": "Non-Medical", "Commerce": "Commerce" };

// Normalize district display: 'Mohali' → 'SAS Nagar (Mohali)'
const normalizeDistrict = (d: string | null | undefined) => {
  if (!d) return null;
  if (d === 'Mohali') return 'SAS Nagar (Mohali)';
  return d;
};

const updatePreferencesSchema = z.object({
  stream: z.enum(['NA', 'Medical', 'Commerce', 'NonMedical', 'Non-Medical']).transform(v => v === 'Non-Medical' ? 'NonMedical' : v),
  choice1: z.string().transform(val => val === " " ? "" : val).optional(),
  choice2: z.string().transform(val => val === " " ? "" : val).optional(),
  choice3: z.string().transform(val => val === " " ? "" : val).optional(),
  choice4: z.string().transform(val => val === " " ? "" : val).optional(),
  choice5: z.string().transform(val => val === " " ? "" : val).optional(),
  choice6: z.string().transform(val => val === " " ? "" : val).optional(),
  choice7: z.string().transform(val => val === " " ? "" : val).optional(),
  choice8: z.string().transform(val => val === " " ? "" : val).optional(),
  choice9: z.string().transform(val => val === " " ? "" : val).optional(),
  choice10: z.string().transform(val => val === " " ? "" : val).optional(),
});

export default function StudentPreferenceManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isChoicesModalOpen, setIsChoicesModalOpen] = useState(false);
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<Student | null>(null);
  const [selectedStudentForChoices, setSelectedStudentForChoices] = useState<Student | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Confirmation dialog states
  const [isLockConfirmDialogOpen, setIsLockConfirmDialogOpen] = useState(false);
  const [isUnlockConfirmDialogOpen, setIsUnlockConfirmDialogOpen] = useState(false);
  const [isReleaseConfirmDialogOpen, setIsReleaseConfirmDialogOpen] = useState(false);
  const [selectedStudentForLock, setSelectedStudentForLock] = useState<Student | null>(null);

  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  const [statusFilter, setStatusFilter] = useState<"all" | "locked" | "unlocked">("all");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [allocationStatusFilter, setAllocationStatusFilter] = useState<string>("all");
  const [roundFilter, setRoundFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("All");

  // Finalize dialog state
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);

  // Vacate dialog state
  const [isVacateDialogOpen, setIsVacateDialogOpen] = useState(false);
  const [vacateReason, setVacateReason] = useState("");
  const [vacateComment, setVacateComment] = useState("");
  const [vacateTargetId, setVacateTargetId] = useState<string | null>(null);

  // Bulk scanner state
  const [omrProgress, setOmrProgress] = useState<{current: number, total: number} | null>(null);
  const [isGeneratingOMR, setIsGeneratingOMR] = useState(false);
  const [isBulkScannerOpen, setIsBulkScannerOpen] = useState(false);
  const [isLiveScannerOpen, setIsLiveScannerOpen] = useState(false);
  const [isGlobalImageScanOpen, setIsGlobalImageScanOpen] = useState(false);
  const [isHelpFlowOpen, setIsHelpFlowOpen] = useState(false);
  const [isLifecycleStatsOpen, setIsLifecycleStatsOpen] = useState(false);

  const handleBulkSave = async (pages: ScannedPageInfo[]) => {
    let successCount = 0;
    for (const page of pages) {
      if (!page.studentId || !page.stream || (page.status !== 'success' && page.status !== 'warning')) continue;
      try {
        const payload: Record<string, any> = { stream: page.stream };
        page.choices.forEach((choice, index) => {
          if (index < 10) {
            payload[`choice${index + 1}`] = choice || null;
          }
        });

        await apiRequest("PUT", `/api/students/${page.studentId}/preferences`, payload);
        if (page.imageBlob) {
          const formData = new FormData();
          formData.append('image', page.imageBlob, `omr_bulk_${page.studentId}.jpg`);
          await fetch(`/api/students/${page.studentId}/omr-image`, {
            method: 'POST',
            body: formData,
          });
        }
        successCount++;
      } catch (err) {
        console.error("Failed to save student", page.studentId, err);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['/api/students'] });
  };
  const [selectedStudentForUnlock, setSelectedStudentForUnlock] = useState<Student | null>(null);
  const [selectedStudentForRelease, setSelectedStudentForRelease] = useState<Student | null>(null);

  // Scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerStudent, setScannerStudent] = useState<Student | undefined>(undefined);

  // Per-student live camera scanner state
  const [perStudentLiveScanStudent, setPerStudentLiveScanStudent] = useState<Student | null>(null);

  // Mobile: expanded card IDs for collapsible records
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) => {
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { toggleMobile: toggleSidebar } = useSidebarToggle();
  const { user } = useAuth();
  const { activeTitle, titles } = useCounseling();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper function to check if student preferences are complete
  const areAllPreferencesFilled = (student: Student) => {
    if (!student.stream || !student.stream.trim()) return false;

    const choices = [
      student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
      student.choice6, student.choice7, student.choice8, student.choice9, student.choice10
    ];

    return choices.every(choice => choice && choice.trim());
  };

  // Form setup for edit modal
  const form = useForm({
    resolver: zodResolver(updatePreferencesSchema),
    defaultValues: {
      stream: "NA" as const,
      choice1: "",
      choice2: "",
      choice3: "",
      choice4: "",
      choice5: "",
      choice6: "",
      choice7: "",
      choice8: "",
      choice9: "",
      choice10: "",
    },
  });

  // Lock student for editing mutation
  const lockForEditMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const response = await apiRequest('PUT', `/api/students/${studentId}/lock`, { isLocked: true });
      return await response.json();
    },
    onSuccess: (updatedStudent: Student) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: "Success",
        description: "Student locked for editing",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to lock student",
        variant: "destructive",
      });
    }
  });

  // Unlock student mutation  
  const unlockEditMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const response = await apiRequest('PUT', `/api/students/${studentId}/lock`, { isLocked: false });
      return await response.json();
    },
    onSuccess: (updatedStudent: Student) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: "Success",
        description: "Student unlocked",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unlock student",
        variant: "destructive",
      });
    }
  });

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["/api/students", { counselingTitleId: activeTitle?.id, limit: 50000 }],
    staleTime: 60000,
    enabled: !!activeTitle?.id,
  });

  const { data: roundsData } = useQuery<any[]>({
    queryKey: ["/api/counseling-rounds"],
    staleTime: 60000,
  });

  // Derived state: Filtered students based on search term & status toggle
  const filteredStudents = useMemo(() => {
    if (!(studentsData as any)?.students) return [];
    
    let filtered = (studentsData as any).students;

    // 1. Status Filter
    if (statusFilter === "locked") {
      filtered = filtered.filter((s: Student) => s.lockedBy);
    } else if (statusFilter === "unlocked") {
      filtered = filtered.filter((s: Student) => !s.lockedBy && s.choice1 && s.stream);
    }

    // 2. Allocation Status Filter
    if (allocationStatusFilter !== "all") {
      if (allocationStatusFilter === "pending") {
        filtered = filtered.filter((s: Student) => !s.allocationStatus || s.allocationStatus === "pending");
      } else {
        filtered = filtered.filter((s: Student) => s.allocationStatus === allocationStatusFilter);
      }
    }

    // 3. Round Filter
    if (roundFilter !== "all") {
      filtered = filtered.filter((s: Student) => s.counselingRoundId === roundFilter);
    }

    // 4. District Filter (For Central Admin)
    if (user?.role === 'central_admin' && districtFilter !== "all") {
      filtered = filtered.filter((s: Student) => {
        if (districtFilter === "unassigned") return !s.counselingDistrict;
        return s.counselingDistrict === districtFilter;
      });
    }

    // 3. Category/Gender Tab Filter
    if (activeTab !== "All") {
      const [tabGender, tabCategory] = activeTab.split(" - ");
      filtered = filtered.filter((s: any) => s.gender === tabGender && s.category === tabCategory);
    }

    // 4. Search Filter
    if (!searchTerm) return filtered;
    
    const lowerSearch = searchTerm.toLowerCase();
    return filtered.filter((s: Student) => 
      s.name?.toLowerCase().includes(lowerSearch) ||
      s.meritNumber?.toString().includes(lowerSearch) ||
      s.appNo?.toLowerCase().includes(lowerSearch) ||
      s.stream?.toLowerCase().includes(lowerSearch)
    );
  }, [(studentsData as any)?.students, searchTerm, statusFilter, allocationStatusFilter, roundFilter, districtFilter, activeTab]);

  // Derived state: Paginated students
  const totalPages = Math.ceil(filteredStudents.length / recordsPerPage);
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * recordsPerPage;
    return filteredStudents.slice(startIndex, startIndex + recordsPerPage);
  }, [filteredStudents, currentPage, recordsPerPage]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, allocationStatusFilter, roundFilter, districtFilter, activeTab, recordsPerPage]);

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { studentId: string, preferences: any }) => {
      const response = await apiRequest('PUT', `/api/students/${data.studentId}/preferences`, data.preferences);
      return await response.json();
    },
    onSuccess: (updatedStudent: Student) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setIsEditModalOpen(false);
      setSelectedStudentForEdit(null);
      form.reset();
      toast({
        title: "Success",
        description: "Student preferences updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    }
  });

  // Query settings to check if allocation is finalized
  const { data: settingsData } = useQuery({
    queryKey: ["/api/settings"],
  });

  // Check if allocation is finalized
  const isAllocationFinalized = Array.isArray(settingsData) && settingsData.some((setting: any) =>
    setting.key === 'allocation_finalized' && setting.value === 'true'
  );


  // Release assignment mutation
  const releaseAssignmentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const response = await apiRequest('POST', `/api/students/${studentId}/release-assignment`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/students'] });
      toast({
        title: "Assignment Released",
        description: "Student assignment has been cleared successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Release Failed",
        description: error.message || "Failed to release assignment",
        variant: "destructive",
      });
    }
  });

  // Finalize allocation mutation
  const finalizeAllocationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/allocation/finalize');
      return await response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Success",
        description: "Allocation process finalized successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to finalize allocation",
        variant: "destructive",
      });
    }
  });

  // Bulk lock mutation
  const bulkLockMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      await Promise.all(
        studentIds.map(id => apiRequest('PUT', `/api/students/${id}/lock`, { isLocked: true }).then(r => r.json()))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setSelectedStudentIds([]);
      toast({ title: "Success", description: "Selected students locked successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Bulk lock failed", variant: "destructive" });
    }
  });

  const bulkUnlockMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      const response = await apiRequest('POST', `/api/students/bulk-unlock-choices`, { studentIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Success", description: data.message });
      setSelectedStudentIds([]);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to unlock choices", variant: "destructive" });
    }
  });

  const markAdmittedMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const response = await apiRequest('POST', `/api/students/${studentId}/mark-admitted`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Success", description: "Student admitted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to mark admitted", variant: "destructive" });
    }
  });

  const markNotAdmittedMutation = useMutation({
    mutationFn: async ({ studentId, reason, comment }: { studentId: string, reason: string, comment: string }) => {
      const response = await apiRequest('POST', `/api/students/${studentId}/mark-not-admitted`, { reason, comment });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Success", description: "Student marked as not admitted and seat vacated." });
      setIsVacateDialogOpen(false);
      setVacateReason("");
      setVacateComment("");
      setVacateTargetId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to mark not admitted", variant: "destructive" });
    }
  });

  const resetStatusMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const response = await apiRequest('POST', `/api/students/${studentId}/reset-status`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Success", description: "Student status reset to pending." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reset status", variant: "destructive" });
    }
  });

  const forceStatusMutation = useMutation({
    mutationFn: async ({ studentId, status }: { studentId: string, status: string }) => {
      const response = await apiRequest('PUT', `/api/students/${studentId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Success", description: "Status updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    }
  });

  const bulkForceStatusMutation = useMutation({
    mutationFn: async ({ studentIds, status }: { studentIds: string[], status: string }) => {
      const response = await apiRequest('PUT', `/api/students/bulk-status`, { studentIds, status });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Success", description: data.message });
      setSelectedStudentIds([]);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update bulk status", variant: "destructive" });
    }
  });

  const handleOpenNotAdmittedDialog = (id: string | null = null) => {
    setVacateTargetId(id);
    setVacateReason("");
    setVacateComment("");
    setIsVacateDialogOpen(true);
  };

  const handleConfirmNotAdmitted = () => {
    if (!vacateReason) {
      toast({ title: "Error", description: "Reason is explicitly required.", variant: "destructive" });
      return;
    }
    if (vacateTargetId) {
      markNotAdmittedMutation.mutate({ studentId: vacateTargetId, reason: vacateReason, comment: vacateComment });
    }
  };

  // Confirmation functions for actions
  const confirmLockStudent = () => {
    if (!selectedStudentForLock) return;

    lockForEditMutation.mutate(selectedStudentForLock.id);
    setIsLockConfirmDialogOpen(false);
    setSelectedStudentForLock(null);
  };

  const confirmUnlockStudent = () => {
    if (!selectedStudentForUnlock) return;

    unlockEditMutation.mutate(selectedStudentForUnlock.id);
    setIsUnlockConfirmDialogOpen(false);
    setSelectedStudentForUnlock(null);
  };

  const confirmReleaseAssignment = () => {
    if (!selectedStudentForRelease) return;

    releaseAssignmentMutation.mutate(selectedStudentForRelease.id);
    setIsReleaseConfirmDialogOpen(false);
    setSelectedStudentForRelease(null);
  };

  const openEditModal = (student: Student) => {
    // Directly open edit modal without locking
    setSelectedStudentForEdit(student);
    form.reset({
      stream: (STREAM_DISPLAY_MAP[student.stream || 'NA'] || student.stream || 'NA') as any,
      choice1: student.choice1 || '',
      choice2: student.choice2 || '',
      choice3: student.choice3 || '',
      choice4: student.choice4 || '',
      choice5: student.choice5 || '',
      choice6: student.choice6 || '',
      choice7: student.choice7 || '',
      choice8: student.choice8 || '',
      choice9: student.choice9 || '',
      choice10: student.choice10 || '',
    });
    setIsEditModalOpen(true);
  };

  const openChoicesModal = (student: Student) => {
    setSelectedStudentForChoices(student);
    setIsChoicesModalOpen(true);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudentIds(filteredStudents.map((s: Student) => s.id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    setSelectedStudentIds(prev =>
      checked ? [...prev, studentId] : prev.filter(id => id !== studentId)
    );
  };

  const handleBulkDownloadOMR = async () => {
    if (selectedStudentIds.length === 0) return;
    let intervalId: any = null;
    try {
      setIsGeneratingOMR(true);
      const jobId = `pdf_job_${Date.now()}`;
      setOmrProgress({ current: 0, total: selectedStudentIds.length });
      
      intervalId = setInterval(async () => {
         try {
            const progRes = await fetch(`/api/omr/progress/${jobId}`, {
               headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
            });
            if (progRes.ok) {
               const data = await progRes.json();
               if (data) setOmrProgress({current: data.current, total: data.total});
            }
         } catch(e){}
      }, 1000);

      const response = await fetch(`/api/students/bulk-omr-form?jobId=${jobId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ studentIds: selectedStudentIds })
      });
      if (!response.ok) throw new Error("Failed to generate bulk OMR forms");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);

      toast({
        title: "Success",
        description: `Successfully generated OMR forms for ${selectedStudentIds.length} students`,
      });
      setSelectedStudentIds([]); // Clear selection after successful download
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not download bulk OMR forms",
        variant: "destructive",
      });
    } finally {
      if (intervalId) clearInterval(intervalId);
      setIsGeneratingOMR(false);
      setOmrProgress(null);
    }
  };

  const handleTestScenariosDownload = async () => {
    if (selectedStudentIds.length === 0) return;
    let intervalId: any = null;
    try {
      setIsGeneratingOMR(true);
      const jobId = `pdf_job_${Date.now()}`;
      setOmrProgress({ current: 0, total: selectedStudentIds.length });
      
      intervalId = setInterval(async () => {
         try {
            const progRes = await fetch(`/api/omr/progress/${jobId}`, {
               headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
            });
            if (progRes.ok) {
               const data = await progRes.json();
               if (data) setOmrProgress({current: data.current, total: data.total});
            }
         } catch(e){}
      }, 1000);

      const response = await fetch(`/api/omr/test-scenarios?jobId=${jobId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ studentIds: selectedStudentIds })
      });
      if (!response.ok) throw new Error("Failed to generate test mock forms");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);

      toast({
        title: "Success",
        description: `Successfully generated random populated mock OMR forms for ${selectedStudentIds.length} students for optical testing`,
      });
      setSelectedStudentIds([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not download mock testing forms",
        variant: "destructive",
      });
    } finally {
      if (intervalId) clearInterval(intervalId);
      setIsGeneratingOMR(false);
      setOmrProgress(null);
    }
  };

  const handleModalSave = (data: any) => {
    if (!selectedStudentForEdit) return;
    updatePreferencesMutation.mutate({
      studentId: selectedStudentForEdit.id,
      preferences: data
    });
  };

  const getStatusBadge = (student: Student) => {
    let status = student.allocationStatus || 'registered';

    // Auto-escalate the visual status before allocation matches
    if (status === 'registered' || status === 'pending') {
      if (student.lockedBy) {
        return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">Locked</Badge>;
      } else if (student.choice1 && student.stream) {
        status = 'pending';
      } else {
        status = 'registered';
      }
    }

    switch (status) {
      case 'registered':
        return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">Registered</Badge>;
      case 'allotted':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Allotted</Badge>;
      case 'not_allotted':
        return <Badge variant="destructive">Not Allotted</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">Pending</Badge>;
      case 'admitted':
        return <Badge variant="default" className="bg-emerald-600">Admitted</Badge>;
      case 'not_admitted':
        return <Badge variant="destructive" className="bg-red-700">Not Admitted</Badge>;
      case 'vacated':
        return <Badge variant="secondary" className="bg-gray-200 text-gray-700">Vacated</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper function to determine if current user can edit a specific student
  const canEditStudent = (student: Student) => {
    if (!user) return false;

    // Central admin can edit all students
    if (user.role === 'central_admin') return true;

    // District admins can interact with any unlocked student in the pipeline 
    // to assign them their district or scan their preferences
    if (user.role === 'district_admin') return true;

    return false;
  };

  const hasRegisteredStudents = selectedStudentIds.length > 0 && selectedStudentIds.some(id => {
    const s = (studentsData as any)?.students?.find((st: Student) => st.id === id);
    return s?.allocationStatus === 'registered';
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Student Preference Management"
        breadcrumbs={[
          { name: "Home" },
          { name: "Student Preference Management" }
        ]}
      />

      <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto">
        <div className="space-y-6">
          {/* Header with Search */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center">
                  <UserCog className="w-5 h-5 mr-2 text-primary" />
                  <span className="text-base sm:text-lg">Student Preferences - {user?.role === 'central_admin' ? 'Central Admin' : 'District Admin'}</span>
                </div>
                {user?.role === 'central_admin' && (
                  <Button
                    variant={isAllocationFinalized ? "outline" : "default"}
                    size="icon"
                    onClick={() => {
                      if (!isAllocationFinalized) setIsFinalizeDialogOpen(true);
                    }}
                    disabled={finalizeAllocationMutation.isPending || isAllocationFinalized}
                    title={isAllocationFinalized ? "Phase 1 Finalized" : "Finalize Central"}
                    data-testid="button-finalize-allocation"
                    className={isAllocationFinalized
                      ? "bg-gray-100 text-gray-600 cursor-not-allowed h-10 w-10"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white h-10 w-10"
                    }
                  >
                    {finalizeAllocationMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                  </Button>
                )}

                {/* BULK SCAN BUTTON */}
                <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <Button
                    variant="outline"
                    size="icon"
                    title="Lifecycle Stats Tracker"
                    onClick={() => setIsLifecycleStatsOpen(true)}
                  >
                    <BarChart3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Live Scan"
                    onClick={() => setIsLiveScannerOpen(true)}
                    className="text-orange-500 border-orange-500 hover:bg-orange-50 h-10 w-10"
                  >
                    <Camera className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Bulk OMR Scan"
                    onClick={() => setIsBulkScannerOpen(true)}
                    className="text-primary border-primary hover:bg-primary/10 h-10 w-10"
                  >
                    <UploadCloud className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Upload Image"
                    onClick={() => { setScannerStudent(undefined); setIsGlobalImageScanOpen(true); }}
                    className="text-violet-600 border-violet-500 hover:bg-violet-50 h-10 w-10"
                  >
                    <FileText className="w-5 h-5" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search by name, merit, app no..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-students"
                  />
                </div>
                <div className="w-full sm:w-[150px]">
                  <Select value={statusFilter} onValueChange={(v: "all"|"locked"|"unlocked") => setStatusFilter(v)}>
                    <SelectTrigger>
                      <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Lock Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locks</SelectItem>
                      <SelectItem value="locked">Locked</SelectItem>
                      <SelectItem value="unlocked">Unlocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-[160px]">
                  <Select value={allocationStatusFilter} onValueChange={(v: string) => setAllocationStatusFilter(v)}>
                    <SelectTrigger>
                      <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Allocation Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="registered">Registered</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="allotted">Allotted</SelectItem>
                      <SelectItem value="not_allotted">Not Allotted</SelectItem>
                      <SelectItem value="admitted">Admitted</SelectItem>
                      <SelectItem value="not_admitted">Not Admitted</SelectItem>
                      <SelectItem value="vacated">Vacated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {roundsData && roundsData.length > 0 && (
                  <div className="w-full sm:w-[160px]">
                    <Select value={roundFilter} onValueChange={(v: string) => setRoundFilter(v)}>
                      <SelectTrigger>
                        <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Counseling Round" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Rounds</SelectItem>
                        {roundsData.map((r: any) => (
                          <SelectItem key={r.id} value={r.id}>
                            Round {r.roundNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {user?.role === 'central_admin' && (
                  <div className="w-full sm:w-[160px]">
                    <Select value={districtFilter} onValueChange={(v: string) => setDistrictFilter(v)}>
                      <SelectTrigger>
                        <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Filter by district" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Districts</SelectItem>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {COUNSELING_DISTRICTS.map((district) => (
                          <SelectItem key={district} value={district}>
                            {district}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Students Table */}
          <Card>
            <CardHeader className="flex flex-col items-start gap-4 pb-2 p-4 md:p-6 text-base sm:text-lg font-semibold">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center w-full gap-4">
                <span className="flex items-center gap-2">
                  Students ({filteredStudents.length})
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:bg-muted" onClick={() => setIsHelpFlowOpen(true)} title="View Lifecycle Help Flow">
                    <HelpCircle className="w-4 h-4" />
                  </Button>
                </span>
                {selectedStudentIds.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button onClick={handleTestScenariosDownload} disabled={isGeneratingOMR} variant="secondary" size="icon" title={`Mock OMRs (${selectedStudentIds.length})`} className="border-primary/20 text-primary">
                      <DownloadCloud className="w-4 h-4" />
                    </Button>
                    <Button onClick={handleBulkDownloadOMR} disabled={isGeneratingOMR} size="icon" title={`Blank OMRs (${selectedStudentIds.length})`} variant="outline" className="text-primary border-primary hover:bg-primary/10">
                      <DownloadCloud className="w-4 h-4" />
                    </Button>
                    {user?.role === 'central_admin' && !hasRegisteredStudents && (
                      <>
                        <Button 
                          onClick={() => bulkLockMutation.mutate(selectedStudentIds)} 
                          size="icon" 
                          variant="default"
                          title={`Lock Selected (${selectedStudentIds.length})`}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          disabled={bulkLockMutation.isPending || selectedStudentIds.every(id => {
                            const s = (studentsData as any)?.students?.find((s: Student) => s.id === id);
                            return s?.lockedBy || !areAllPreferencesFilled(s as Student);
                          })}
                        >
                          <Lock className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => bulkUnlockMutation.mutate(selectedStudentIds)}
                          size="icon"
                          title={`Unlock Selected (${selectedStudentIds.length})`}
                          variant="outline"
                          className="text-orange-500 border-orange-500 hover:bg-orange-50"
                          disabled={bulkUnlockMutation.isPending}
                        >
                          <Unlock className="w-4 h-4" />
                        </Button>
                        <div className="w-px h-6 bg-border mx-1 my-auto" />
                        <Button
                          onClick={() => bulkForceStatusMutation.mutate({ studentIds: selectedStudentIds, status: 'admitted' })}
                          size="icon"
                          title={`Mark Selected as Admitted (${selectedStudentIds.length})`}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={bulkForceStatusMutation.isPending}
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => bulkForceStatusMutation.mutate({ studentIds: selectedStudentIds, status: 'not_admitted' })}
                          size="icon"
                          title={`Mark Selected as Not Admitted (${selectedStudentIds.length})`}
                          variant="destructive"
                          className="bg-red-700 hover:bg-red-800"
                          disabled={bulkForceStatusMutation.isPending}
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => bulkForceStatusMutation.mutate({ studentIds: selectedStudentIds, status: 'pending' })}
                          size="icon"
                          title={`Reset Selected to Pending (${selectedStudentIds.length})`}
                          variant="outline"
                          className="text-amber-600 border-amber-300 hover:bg-amber-50"
                          disabled={bulkForceStatusMutation.isPending}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 7 Gender Category Tabs — color-coded pill buttons */}
              <div className="w-full mt-2 flex flex-wrap gap-2 pb-1">
                {([
                  { value: 'All',              label: 'All',        bg: 'bg-slate-200', activeBg: 'bg-slate-700',   text: 'text-slate-700', activeText: 'text-white', border: 'border-slate-300' },
                  { value: 'Female - WHH',     label: '♀ WHH',      bg: 'bg-purple-100', activeBg: 'bg-purple-600', text: 'text-purple-700', activeText: 'text-white', border: 'border-purple-300' },
                  { value: 'Female - Disabled', label: '♀ Disabled', bg: 'bg-amber-100',  activeBg: 'bg-amber-600',  text: 'text-amber-700',  activeText: 'text-white', border: 'border-amber-300' },
                  { value: 'Female - Private', label: '♀ Private',  bg: 'bg-pink-100',   activeBg: 'bg-pink-600',   text: 'text-pink-700',   activeText: 'text-white', border: 'border-pink-300' },
                  { value: 'Female - Open',    label: '♀ Open',     bg: 'bg-rose-100',   activeBg: 'bg-rose-600',   text: 'text-rose-700',   activeText: 'text-white', border: 'border-rose-300' },
                  { value: 'Male - Disabled',  label: '♂ Disabled', bg: 'bg-sky-100',    activeBg: 'bg-sky-600',    text: 'text-sky-700',    activeText: 'text-white', border: 'border-sky-300' },
                  { value: 'Male - Private',   label: '♂ Private',  bg: 'bg-teal-100',   activeBg: 'bg-teal-600',   text: 'text-teal-700',   activeText: 'text-white', border: 'border-teal-300' },
                  { value: 'Male - Open',      label: '♂ Open',     bg: 'bg-blue-100',   activeBg: 'bg-blue-600',   text: 'text-blue-700',   activeText: 'text-white', border: 'border-blue-300' },
                ] as const).map(tab => {
                  const isActive = activeTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${tab.border} ${
                        isActive
                          ? `${tab.activeBg} ${tab.activeText} shadow-md ring-2 ring-offset-1 ring-current scale-105`
                          : `${tab.bg} ${tab.text} hover:shadow-sm hover:scale-105`
                      }`}
                      type="button"
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </CardHeader>

            <div className="max-h-[65vh] overflow-y-auto border-t border-b custom-scrollbar">
              <CardContent className="p-0 md:p-6 md:pt-0">
                {/* ── MOBILE CARD VIEW (<md) ── */}
                <div className="md:hidden divide-y">
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  ) : paginatedStudents.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No students found</p>
                  ) : (
                    paginatedStudents.map((student: Student) => {
                      const isExpanded = expandedCardIds.has(student.id);
                    return (
                      <div key={student.id} className="p-3">
                        {/* Collapsed: Name, stream badge, actions */}
                        <div className="flex items-center justify-between gap-2">
                          <button
                            className="flex-1 text-left flex items-center gap-2 min-w-0"
                            onClick={() => toggleCard(student.id)}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{student.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{student.appNo}</p>
                            </div>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            {student.stream && <Badge variant="outline" className="text-xs px-1.5 py-0">{student.stream}</Badge>}
                            {/* Primary actions: Scan + Edit */}
                            {(user?.role === 'central_admin' ? !student.lockedBy : canEditStudent(student) && !student.lockedBy) && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-emerald-600 border-emerald-300"
                                  onClick={() => { setPerStudentLiveScanStudent(student); }}
                                >
                                  <Camera className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-violet-600 border-violet-300"
                                  onClick={() => { setScannerStudent(student); setIsScannerOpen(true); }}
                                  title="Upload OMR Image"
                                >
                                  <UploadCloud className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2"
                                  onClick={() => openEditModal(student)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {student.lockedBy && (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0">
                                <Lock className="w-3 h-3" />
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Expanded: Full details */}
                        {isExpanded && (
                          <div className="mt-3 ml-6 space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                              <div><span className="text-muted-foreground">Merit #:</span> <span className="font-mono">{student.meritNumber}</span></div>
                              <div><span className="text-muted-foreground">Status:</span> {getStatusBadge(student)}</div>
                              <div><span className="text-muted-foreground">District:</span> {normalizeDistrict(student.counselingDistrict) || 'N/A'}</div>
                              <div><span className="text-muted-foreground">Admin:</span> {student.districtAdmin || 'N/A'}</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openChoicesModal(student)}>
                                <Eye className="w-3 h-3 mr-1" /> Choices
                              </Button>
                              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                                <a href={`/api/students/${student.id}/omr-form?t=${new Date().getTime()}`} target="_blank" rel="noopener noreferrer">
                                  <FileText className="w-3 h-3 mr-1" /> OMR PDF
                                </a>
                              </Button>
                              {user?.role === 'central_admin' && student.lockedBy && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-xs" title="Unlock" onClick={() => { setSelectedStudentForUnlock(student); setIsUnlockConfirmDialogOpen(true); }}>
                                  <Unlock className="w-4 h-4" />
                                </Button>
                              )}
                              {user?.role === 'central_admin' && !student.lockedBy && areAllPreferencesFilled(student) && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-xs" title="Lock" onClick={() => { setSelectedStudentForLock(student); setIsLockConfirmDialogOpen(true); }}>
                                    <Lock className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-xs text-red-600" title="Release" onClick={() => { setSelectedStudentForRelease(student); setIsReleaseConfirmDialogOpen(true); }}>
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {user?.role === 'central_admin' && (student.allocationStatus === 'vacated' || student.allocationStatus === 'not_admitted') && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-xs text-amber-600" title="Reset to Pending" onClick={() => resetStatusMutation.mutate(student.id)}>
                                  <RefreshCw className="w-4 h-4" />
                                </Button>
                              )}
                              {user?.role === 'central_admin' && student.allocationStatus === 'allotted' && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-xs text-emerald-600" title="Mark Admitted" onClick={() => markAdmittedMutation.mutate(student.id)}>
                                    <UserCheck className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-xs text-red-600" title="Mark Not Admitted" onClick={() => handleOpenNotAdmittedDialog(student.id)}>
                                    <UserX className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* ── DESKTOP/TABLET TABLE (≥md) ── */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            filteredStudents.length > 0 &&
                            selectedStudentIds.length === filteredStudents.length
                          }
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Merit #</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>App No</TableHead>
                      <TableHead>Stream</TableHead>
                      <TableHead>Current District</TableHead>
                      <TableHead className="hidden lg:table-cell">District Admin</TableHead>
                      <TableHead className="hidden lg:table-cell">Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Round #</TableHead>
                      <TableHead className="hidden lg:table-cell">Lock Status</TableHead>
                      <TableHead>Choices</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                        </TableCell>
                      </TableRow>
                    ) : paginatedStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No students found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedStudents.map((student: Student) => (
                        <TableRow key={student.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedStudentIds.includes(student.id)}
                              onCheckedChange={(checked) => handleSelectStudent(student.id, checked as boolean)}
                              aria-label={`Select student ${student.name}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono">
                            {student.meritNumber}
                          </TableCell>
                          <TableCell className="font-medium">
                            {student.name}
                          </TableCell>
                          <TableCell className="font-mono">
                            {student.appNo}
                          </TableCell>
                          <TableCell>
                            {student.stream ? (
                              <Badge variant="outline">{student.stream}</Badge>
                            ) : (
                              <Badge variant="destructive">Not Set</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {normalizeDistrict(student.counselingDistrict) || (
                              <span className="text-muted-foreground">Not Assigned</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {student.districtAdmin || (
                              <span className="text-muted-foreground">Not Assigned</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {getStatusBadge(student)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {student.counselingRoundNumber ? (
                              <Badge variant="outline" className="font-mono">
                                R{student.counselingRoundNumber}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {student.lockedBy ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                <Lock className="w-3 h-3 mr-1" />
                                Locked
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <Unlock className="w-3 h-3 mr-1" />
                                Unlocked
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openChoicesModal(student)}
                              className="p-1 h-6 w-6"
                              data-testid={`button-view-choices-${student.id}`}
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              {/* Admin Action Buttons rendering based on permission matrix */}
                              {user?.role === 'central_admin' ? (
                                // --- CENTRAL ADMIN VIEW ---
                                <>
                                  {student.lockedBy ? (
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => {
                                        setSelectedStudentForUnlock(student);
                                        setIsUnlockConfirmDialogOpen(true);
                                      }}
                                      disabled={unlockEditMutation.isPending}
                                      data-testid={`button-unlock-${student.id}`}
                                      className="h-8 w-8"
                                      title="Unlock Form"
                                    >
                                      <Unlock className="w-4 h-4" />
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => openEditModal(student)}
                                        data-testid={`button-edit-${student.id}`}
                                        className="h-8 w-8"
                                        title="Edit Document"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>

                                      <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => {
                                          setPerStudentLiveScanStudent(student);
                                        }}
                                        className="h-8 w-8 text-emerald-600 border-emerald-300 hover:bg-emerald-50 ml-2"
                                        title="Scan OMR Form"
                                      >
                                        <Camera className="w-4 h-4" />
                                      </Button>

                                      <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => { setScannerStudent(student); setIsScannerOpen(true); }}
                                        className="h-8 w-8 text-violet-600 border-violet-300 hover:bg-violet-50 ml-2"
                                        title="Upload OMR Image"
                                      >
                                        <UploadCloud className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        asChild
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 ml-2"
                                        title="Download Unfilled OMR"
                                      >
                                        <a href={`/api/students/${student.id}/omr-form?t=${new Date().getTime()}`} target="_blank" rel="noopener noreferrer">
                                          <FileText className="w-4 h-4" />
                                        </a>
                                      </Button>

                                      {/* Release Assignment button for fully filled forms */}
                                      {areAllPreferencesFilled(student) && (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => {
                                              setSelectedStudentForLock(student);
                                              setIsLockConfirmDialogOpen(true);
                                            }}
                                            disabled={lockForEditMutation.isPending}
                                            data-testid={`button-lock-${student.id}`}
                                            className="h-8 w-8 ml-2"
                                            title="Lock Form"
                                          >
                                            <Lock className="w-4 h-4" />
                                          </Button>

                                          <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => {
                                              setSelectedStudentForRelease(student);
                                              setIsReleaseConfirmDialogOpen(true);
                                            }}
                                            disabled={releaseAssignmentMutation.isPending}
                                            data-testid={`button-release-${student.id}`}
                                            className="h-8 w-8 text-red-600 border-red-300 hover:bg-red-50 ml-2"
                                            title="Release Assignment"
                                          >
                                            <XCircle className="w-4 h-4" />
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}

                                  {(student.allocationStatus === 'vacated' || student.allocationStatus === 'not_admitted') && (
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => resetStatusMutation.mutate(student.id)}
                                      className="h-8 w-8 text-amber-600 border-amber-300 hover:bg-amber-50 ml-2"
                                      title="Reset to Pending"
                                      disabled={resetStatusMutation.isPending}
                                    >
                                      <RefreshCw className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {student.allocationStatus === 'allotted' && (
                                    <>
                                      <Button
                                        variant="default"
                                        size="icon"
                                        onClick={() => markAdmittedMutation.mutate(student.id)}
                                        className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 ml-2"
                                        title="Mark Admitted"
                                        disabled={markAdmittedMutation.isPending}
                                      >
                                        <UserCheck className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="icon"
                                        onClick={() => handleOpenNotAdmittedDialog(student.id)}
                                        className="h-8 w-8 bg-red-700 hover:bg-red-800 ml-2 text-white"
                                        title="Mark Not Admitted"
                                      >
                                        <UserX className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                </>
                              ) : (
                                // --- DISTRICT ADMIN VIEW ---
                                <>
                                  {canEditStudent(student) && !student.lockedBy ? (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEditModal(student)}
                                        data-testid={`button-edit-${student.id}`}
                                      >
                                        <Edit className="w-4 h-4 mr-1" />
                                        Edit
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setPerStudentLiveScanStudent(student);
                                        }}
                                        className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 ml-2"
                                        title="Scan OMR Form"
                                      >
                                        <Camera className="w-4 h-4 mr-1" />
                                        Scan
                                      </Button>

                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => { setScannerStudent(student); setIsScannerOpen(true); }}
                                        className="text-violet-600 border-violet-300 hover:bg-violet-50 ml-2"
                                        title="Upload OMR Image"
                                      >
                                        <UploadCloud className="w-4 h-4 mr-1" />
                                        Upload
                                      </Button>
                                      <Button
                                        asChild
                                        variant="outline"
                                        size="sm"
                                        className="ml-2"
                                        title="Download Unfilled OMR"
                                      >
                                        <a href={`/api/students/${student.id}/omr-form?t=${new Date().getTime()}`} target="_blank" rel="noopener noreferrer">
                                          <FileText className="w-4 h-4 mr-1" />
                                          OMR
                                        </a>
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled
                                      data-testid={`button-edit-disabled-${student.id}`}
                                      className="text-muted-foreground"
                                    >
                                      <Edit className="w-4 h-4 mr-1" />
                                      {student.lockedBy ? "Locked" : "Edit"}
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </div>
          
          {/* Pagination Controls */}
          {filteredStudents.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-muted/20 border-t gap-4">
              <div className="flex items-center text-sm text-muted-foreground">
                Showing {(currentPage - 1) * recordsPerPage + 1} to {Math.min(currentPage * recordsPerPage, filteredStudents.length)} of {filteredStudents.length} entries
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Records per page:</span>
                  <Select
                    value={recordsPerPage.toString()}
                    onValueChange={(val) => setRecordsPerPage(Number(val))}
                  >
                    <SelectTrigger className="w-[80px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm font-medium px-2">Page {currentPage} of {Math.max(1, totalPages)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
        </div>
      </main >

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen} >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Student Preferences</DialogTitle>
          </DialogHeader>

          {selectedStudentForEdit && (
            <div className={selectedStudentForEdit.omrImageUrl ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : ""}>
              {/* OMR Image Preview Column */}
              {selectedStudentForEdit.omrImageUrl && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">OMR Scan Preview</h3>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        Stream: {selectedStudentForEdit.stream || "N/A"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Choices: {Array.from({ length: 10 }, (_, i) => selectedStudentForEdit[`choice${i + 1}` as keyof typeof selectedStudentForEdit]).filter(Boolean).length}/10 Detected
                      </Badge>
                    </div>
                  </div>
                  <div className="border border-input rounded-md overflow-hidden bg-muted/30 flex-1 flex items-center justify-center p-2 min-h-[300px]">
                    <img
                      src={selectedStudentForEdit.omrImageUrl as string}
                      alt="OMR Scan Overlay"
                      className="max-w-full max-h-[50vh] object-contain drop-shadow-md bg-white"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-sm text-muted-foreground">Image unavailable — file may have been lost. Re-scan to restore.</p>'; }}
                    />
                  </div>
                </div>
              )}

              {/* Form Column */}
              <div>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleModalSave)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Student Name</p>
                        <p className="text-lg">{selectedStudentForEdit.name}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Merit Number</p>
                        <p className="text-lg font-mono">{selectedStudentForEdit.meritNumber}</p>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="stream"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stream</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select stream" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {STREAMS.map((stream) => (
                                <SelectItem key={stream} value={stream}>
                                  {stream}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((choiceNum) => (
                        <FormField
                          key={choiceNum}
                          control={form.control}
                          name={`choice${choiceNum}` as any}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Choice {choiceNum}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={`Select choice ${choiceNum}`} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value=" ">
                                    <span className="text-muted-foreground">No selection</span>
                                  </SelectItem>
                                  {DISTRICTS.map((district) => (
                                    <SelectItem key={district} value={district}>
                                      {district}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditModalOpen(false)}
                        data-testid="button-cancel-edit"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={updatePreferencesMutation.isPending}
                      >
                        {updatePreferencesMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Vacate Confirmation Dialog */}
      <Dialog open={isVacateDialogOpen} onOpenChange={setIsVacateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Not Admitted</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (Required)</label>
              <Input
                placeholder="e.g., Student rejected seat, Document verification failed"
                value={vacateReason}
                onChange={(e) => setVacateReason(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Additional Comments (Optional)</label>
              <Input
                placeholder="Any other details..."
                value={vacateComment}
                onChange={(e) => setVacateComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsVacateDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!vacateReason || markNotAdmittedMutation.isPending}
              onClick={handleConfirmNotAdmitted}
            >
              {markNotAdmittedMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Not Admitted
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Choices View Modal */}
      <Dialog open={isChoicesModalOpen} onOpenChange={setIsChoicesModalOpen} >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>District Choices - {selectedStudentForChoices?.name}</DialogTitle>
          </DialogHeader>

          {selectedStudentForChoices && (
            <div className={selectedStudentForChoices.omrImageUrl ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : ""}>

              {/* OMR Image Preview Column */}
              {selectedStudentForChoices.omrImageUrl && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">OMR Scan Preview</h3>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        Stream: {selectedStudentForChoices.stream || "N/A"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Choices: {Array.from({ length: 10 }, (_, i) => selectedStudentForChoices[`choice${i + 1}` as keyof typeof selectedStudentForChoices]).filter(Boolean).length}/10 Detected
                      </Badge>
                    </div>
                  </div>
                  <div className="border border-input rounded-md overflow-hidden bg-muted/30 flex-1 flex items-center justify-center p-2 min-h-[300px]">
                    <img
                      src={selectedStudentForChoices.omrImageUrl as string}
                      alt="OMR Scan Overlay"
                      className="max-w-full max-h-[50vh] object-contain drop-shadow-md bg-white"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-sm text-muted-foreground">Image unavailable — file may have been lost. Re-scan to restore.</p>'; }}
                    />
                  </div>
                </div>
              )}

              {/* Data Column */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground">Stream</p>
                    <p className="font-semibold">{selectedStudentForChoices.stream || "Not set"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Status</p>
                    <p className="font-semibold">{selectedStudentForChoices.lockedBy ? "🔒 Locked" : "🔓 Unlocked"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Merit Number</p>
                    <p className="font-mono">{selectedStudentForChoices.meritNumber}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">App Number</p>
                    <p className="font-mono">{selectedStudentForChoices.appNo || "N/A"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="font-medium text-muted-foreground">Current District / Admin</p>
                    <p>{normalizeDistrict(selectedStudentForChoices.counselingDistrict) || "Not assigned"} / {selectedStudentForChoices.districtAdmin || "N/A"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm border-b pb-1">Preferences</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      selectedStudentForChoices.choice1, selectedStudentForChoices.choice2,
                      selectedStudentForChoices.choice3, selectedStudentForChoices.choice4,
                      selectedStudentForChoices.choice5, selectedStudentForChoices.choice6,
                      selectedStudentForChoices.choice7, selectedStudentForChoices.choice8,
                      selectedStudentForChoices.choice9, selectedStudentForChoices.choice10
                    ].map((choice, index) => (
                      <div key={index} className="flex items-center justify-between p-2 lg:p-3 border rounded bg-card text-sm">
                        <span className="font-medium text-muted-foreground w-20">Choice {index + 1}</span>
                        <span className={choice ? "font-semibold" : "text-muted-foreground italic"}>
                          {choice || "Not set"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsChoicesModalOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Confirmation Dialog */}
      <AlertDialog open={isLockConfirmDialogOpen} onOpenChange={setIsLockConfirmDialogOpen} >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock Student Preferences</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to lock {selectedStudentForLock?.name}'s preferences?
              This will prevent further edits to their district choices until unlocked by a central administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedStudentForLock && (
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Student Name</p>
                  <p className="font-semibold" data-testid="text-lock-student-name">
                    {selectedStudentForLock.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Merit Number</p>
                  <p className="font-mono" data-testid="text-lock-student-merit">
                    {selectedStudentForLock.meritNumber}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Stream</p>
                  <p className="font-semibold" data-testid="text-lock-student-stream">
                    {selectedStudentForLock.stream}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Choices</p>
                  <p className="font-semibold">
                    {[selectedStudentForLock.choice1, selectedStudentForLock.choice2, selectedStudentForLock.choice3,
                    selectedStudentForLock.choice4, selectedStudentForLock.choice5, selectedStudentForLock.choice6,
                    selectedStudentForLock.choice7, selectedStudentForLock.choice8, selectedStudentForLock.choice9,
                    selectedStudentForLock.choice10].filter(Boolean).length} / 10
                  </p>
                </div>
              </div>

              <div className="p-3 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>⚠️ Important:</strong> Once locked, only central administrators can unlock this student's preferences for further editing.
                </p>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLockStudent}
              disabled={lockForEditMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {lockForEditMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Locking...</>
              ) : "🔒 Lock Student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unlock Confirmation Dialog */}
      <AlertDialog open={isUnlockConfirmDialogOpen} onOpenChange={setIsUnlockConfirmDialogOpen} >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock Student Preferences</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlock {selectedStudentForUnlock?.name}'s preferences?
              This will allow them or district administrators to edit their district choices again.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedStudentForUnlock && (
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Student Name</p>
                  <p className="font-semibold" data-testid="text-unlock-student-name">
                    {selectedStudentForUnlock.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Merit Number</p>
                  <p className="font-mono" data-testid="text-unlock-student-merit">
                    {selectedStudentForUnlock.meritNumber}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Stream</p>
                  <p className="font-semibold" data-testid="text-unlock-student-stream">
                    {selectedStudentForUnlock.stream}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Locked By</p>
                  <p className="font-semibold text-blue-600">
                    {selectedStudentForUnlock.lockedBy || "System"}
                  </p>
                </div>
              </div>

              <div className="p-3 border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20">
                <p className="text-sm text-green-800 dark:text-green-200">
                  <strong>✅ Note:</strong> Unlocking will allow the student's preferences to be edited again by authorized users.
                </p>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnlockStudent}
              disabled={unlockEditMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {unlockEditMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Unlocking...</>
              ) : "🔓 Unlock Student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Release Assignment Confirmation Dialog */}
      <AlertDialog open={isReleaseConfirmDialogOpen} onOpenChange={setIsReleaseConfirmDialogOpen} >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release Student Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to release {selectedStudentForRelease?.name}'s assignment?
              This will clear their district and district admin assignment and make them available for reassignment.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedStudentForRelease && (
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Student Name</p>
                  <p className="font-semibold" data-testid="text-release-student-name">
                    {selectedStudentForRelease.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Merit Number</p>
                  <p className="font-mono" data-testid="text-release-student-merit">
                    {selectedStudentForRelease.meritNumber}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Current District</p>
                  <p className="font-semibold text-blue-600">
                    {normalizeDistrict(selectedStudentForRelease.counselingDistrict) || "None"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">District Admin</p>
                  <p className="font-semibold text-blue-600">
                    {selectedStudentForRelease.districtAdmin || "None"}
                  </p>
                </div>
              </div>

              <div className="p-3 border-l-4 border-red-500 bg-red-50 dark:bg-red-950/20">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>⚠️ Warning:</strong> This action will remove the student's current district assignment and make them available for reassignment. Their preferences will remain intact.
                </p>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReleaseAssignment}
              disabled={releaseAssignmentMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {releaseAssignmentMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Releasing...</>
              ) : "🔄 Release Assignment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* OMR Scanner Modal (Student-Level) */}
      < OMRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)
        }
        expectedStudent={scannerStudent || undefined}
        allStudents={(studentsData as any)?.students || []}
        onScanComplete={(scannedStudentId, parsedData) => {
          if (scannerStudent && scannerStudent.id === scannedStudentId) {
            form.setValue('stream', (STREAM_DISPLAY_MAP[parsedData.stream] || parsedData.stream) as any);
            parsedData.choices.forEach((choice, idx) => {
              form.setValue(`choice${idx + 1}` as any, choice);
            });
            setSelectedStudentForEdit(scannerStudent);
            setIsEditModalOpen(true);
            setIsScannerOpen(false);
          }
        }}
      />

      {/* OMR Scanner Modal (Global Image Upload - auto-detect student via QR/Barcode) */}
      <OMRScannerModal
        isOpen={isGlobalImageScanOpen}
        onClose={() => setIsGlobalImageScanOpen(false)}
        allStudents={(studentsData as any)?.students || []}
        onScanComplete={(scannedStudentId, parsedData) => {
          // Find the student from the scanned student ID
          const allStudents = (studentsData as any)?.students || [];
          const matchedStudent = allStudents.find((s: Student) => s.id.toString() === scannedStudentId.toString());
          if (matchedStudent) {
            const preferences: any = { stream: parsedData.stream };
            for (let i = 0; i < 10; i++) {
              preferences[`choice${i + 1}`] = parsedData.choices[i] || "";
            }
            updatePreferencesMutation.mutate({ studentId: scannedStudentId.toString(), preferences });
            toast({ title: "Scan Complete", description: `Preferences saved for ${matchedStudent.name} (${matchedStudent.appNo}).` });
          } else {
            toast({ title: "Student Not Found", description: `No student matched with ID ${scannedStudentId}. Please verify the OMR form.`, variant: "destructive" });
          }
          setIsGlobalImageScanOpen(false);
        }}
      />

      <BulkScannerModal
        isOpen={isBulkScannerOpen}
        onClose={() => setIsBulkScannerOpen(false)}
        students={(studentsData as any)?.students || []}
        onSaveSelected={handleBulkSave}
      />
      
      <LiveOMRScannerModal 
        isOpen={isLiveScannerOpen}
        onClose={() => setIsLiveScannerOpen(false)}
        students={(studentsData as any)?.students || []}
        onSaveData={(studentId, stream, choices, imageUrl) => {
          const preferences: any = { stream };
          for (let i = 0; i < 10; i++) {
              preferences[`choice${i + 1}`] = choices[i] || "";
          }
          if (imageUrl) preferences.imageUrl = imageUrl;
          updatePreferencesMutation.mutate({ studentId: studentId.toString(), preferences });
        }}
      />

      {/* Per-Student Live Camera Scanner */}
      <LiveOMRScannerModal 
        isOpen={!!perStudentLiveScanStudent}
        onClose={() => setPerStudentLiveScanStudent(null)}
        students={(studentsData as any)?.students || []}
        prelockedStudent={perStudentLiveScanStudent || undefined}
        onSaveData={(studentId, stream, choices, imageUrl) => {
          const preferences: any = { stream };
          for (let i = 0; i < 10; i++) {
              preferences[`choice${i + 1}`] = choices[i] || "";
          }
          if (imageUrl) preferences.imageUrl = imageUrl;
          updatePreferencesMutation.mutate({ studentId: studentId.toString(), preferences });
          setPerStudentLiveScanStudent(null);
        }}
      />

      {/* Finalize Allocation Dialog */}
      <AlertDialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize Allocation Process</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-4 mt-4 text-foreground">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-md text-amber-800">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> 
                    Warning: Irreversible Action
                  </h4>
                  <p className="mt-2 text-sm">
                    Finalizing the allocation will process all locked student preferences and assign stations. This action <strong>cannot be undone</strong>.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-md border text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {(studentsData as any)?.students?.filter((s: Student) => s.choice1 && s.stream).length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Students w/ Preferences</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md border text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {(studentsData as any)?.students?.filter((s: Student) => s.lockedBy).length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Locked Students</div>
                  </div>
                </div>

                {(() => {
                  const unlockedCount = (studentsData as any)?.students?.filter((s: Student) => s.choice1 && s.stream && !s.lockedBy).length || 0;
                  if (unlockedCount > 0) {
                    return (
                      <div className="bg-red-50 border border-red-200 p-3 rounded-md text-red-800 text-sm flex items-start gap-2">
                        <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <strong>Cannot Finalize:</strong> There are {unlockedCount} unlocked students who have filled their preferences. All students with preferences must be locked before finalizing.
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-green-50 border border-green-200 p-3 rounded-md text-green-800 text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      All students with preferences are locked and ready.
                    </div>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
              disabled={
                finalizeAllocationMutation.isPending || 
                ((studentsData as any)?.students || []).filter((s: Student) => s.choice1 && s.stream && !s.lockedBy).length > 0
              }
              onClick={(e) => {
                e.preventDefault();
                finalizeAllocationMutation.mutate(undefined, {
                  onSuccess: () => setIsFinalizeDialogOpen(false)
                });
              }}
            >
              {finalizeAllocationMutation.isPending ? "Finalizing..." : "Confirm Finalization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Help Flow Dialog */}
      <Dialog open={isHelpFlowOpen} onOpenChange={setIsHelpFlowOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" />
              Student Status Lifecycle & Actions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm mt-4">
            <p className="text-muted-foreground">This diagram explains the 7 states a student can be in and which actions are available over their lifecycle.</p>
            
            <div className="space-y-3 bg-muted/30 p-4 rounded-md border">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 w-28 shrink-0 justify-center">Registered</Badge>
                <div className="flex-1">Newly imported students. They haven't filled their preferences yet. Once they fill all 10 choices, they move to <strong>Pending</strong>.</div>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="text-amber-600 border-amber-300 w-28 shrink-0 justify-center">Pending</Badge>
                <div className="flex-1">Preferences are filled and locked. The allocation algorithm <em>only</em> processes students in this state.</div>
              </div>

              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="bg-green-100 text-green-800 w-28 shrink-0 justify-center">Allotted</Badge>
                <div className="flex-1">Seat has been allocated by the engine. The Central Admin can then update their final outcome: <br/>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="px-1.5 py-1 bg-background border rounded text-xs inline-flex items-center text-emerald-600"><UserCheck className="w-3.5 h-3.5 mr-1"/> Admit</span>
                    <span className="px-1.5 py-1 bg-background border rounded text-xs inline-flex items-center text-orange-600"><XCircle className="w-3.5 h-3.5 mr-1"/> Vacate</span>
                    <span className="px-1.5 py-1 bg-background border rounded text-xs inline-flex items-center text-red-600"><UserX className="w-3.5 h-3.5 mr-1"/> No Show</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Badge variant="destructive" className="w-28 shrink-0 justify-center">Not Allotted</Badge>
                <div className="flex-1">Run through algorithm but no seat was available based on preferences and merit.</div>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge variant="default" className="bg-emerald-600 w-28 shrink-0 justify-center">Admitted</Badge>
                <div className="flex-1">Student has successfully reported and taken the seat. Final state.</div>
              </div>

              <div className="flex items-start gap-3">
                <Badge variant="destructive" className="bg-red-700 w-28 shrink-0 justify-center">Not Admitted</Badge>
                <div className="flex-1">Student was allotted a seat but failed to show up (No Show).</div>
              </div>

              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="bg-gray-200 text-gray-700 w-28 shrink-0 justify-center">Vacated</Badge>
                <div className="flex-1">Student was allotted but subsequently surrendered their seat explicitly.</div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-amber-800 mt-4 flex gap-3">
              <RefreshCw className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p><strong>Reset to Pending</strong></p>
                <p className="text-xs opacity-90 mt-1">Available for Not Allotted, Vacated, and Not Admitted students. This action "re-enters" them into the pool so they can be processed in the next allocation round.</p>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-md text-blue-800 flex gap-3">
              <Unlock className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p><strong>Unlock Action</strong></p>
                <p className="text-xs opacity-90 mt-1">Allows district admins to fix errors on a student's preferences. It pulls them out of the <em>Pending</em> state temporarily until re-locked.</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
              Tip: You can use the buttons at the top of the table to perform these actions in bulk for multiple selected students.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* OMR Generation Loading Overlay */}
      {isGeneratingOMR && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <h2 className="text-xl font-semibold">Generating OMR PDFs...</h2>
          {omrProgress && omrProgress.total > 0 && (
             <div className="w-64 mt-4">
               <div className="flex justify-between text-sm mb-1 font-medium">
                 <span>{Math.round((omrProgress.current / omrProgress.total) * 100)}%</span>
                 <span>{omrProgress.current} / {omrProgress.total}</span>
               </div>
               <div className="w-full bg-muted rounded-full h-2">
                 <div 
                   className="bg-primary h-2 rounded-full transition-all duration-300" 
                   style={{ width: `${Math.min((omrProgress.current / omrProgress.total) * 100, 100)}%` }}
                 ></div>
               </div>
             </div>
          )}
          <p className="text-muted-foreground mt-4">Please wait while the documents are compiled.</p>
        </div>
      )}
      <LifecycleStatsOverlay
        open={isLifecycleStatsOpen}
        onOpenChange={setIsLifecycleStatsOpen}
        counselingTitles={titles}
        defaultTitleId={activeTitle?.id || "current"}
      />
    </div>
  );
}