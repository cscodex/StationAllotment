import { useState, useMemo, useEffect } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { type Student, type UnfinalizeRequest } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import {
  Search,
  ShieldQuestion,
  Edit,
  Save,
  X,
  Clock,
  AlertTriangle,
  CheckCircle,
  Download,
  Eye,
  Lock,
  Unlock,
  RotateCcw,
  Shield,
  Loader2,
  Camera,
  UploadCloud,
  FileText
} from "lucide-react";
import { SCHOOL_DISTRICTS, COUNSELING_DISTRICTS } from "@shared/schema";
import OMRScannerModal from "@/components/dashboard/omr-scanner-modal";
import { BulkScannerModal, type ScannedPageInfo } from "@/components/dashboard/bulk-scanner-modal";
import { LiveOMRScannerModal } from "@/components/dashboard/live-omr-scanner";

// Use school districts for choice selection (where schools are located)
const DISTRICTS = SCHOOL_DISTRICTS;
const STREAMS = ["Medical", "Non-Medical", "Commerce"];
const STREAM_DISPLAY_MAP: Record<string, string> = { "Medical": "Medical", "NonMedical": "Non-Medical", "Commerce": "Commerce" };

const updatePreferencesSchema = z.object({
  stream: z.enum(['Medical', 'Commerce', 'NonMedical', 'Non-Medical']).transform(v => v === 'Non-Medical' ? 'NonMedical' : v),
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

export default function DistrictAdmin() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isChoicesModalOpen, setIsChoicesModalOpen] = useState(false);
  const [isUnlockRequestModalOpen, setIsUnlockRequestModalOpen] = useState(false);
  const [isLockConfirmDialogOpen, setIsLockConfirmDialogOpen] = useState(false);
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<Student | null>(null);
  const [selectedStudentForChoices, setSelectedStudentForChoices] = useState<Student | null>(null);
  const [selectedStudentForUnlock, setSelectedStudentForUnlock] = useState<Student | null>(null);
  const [selectedStudentForLock, setSelectedStudentForLock] = useState<Student | null>(null);
  const [unlockReason, setUnlockReason] = useState("");

  // Scanner states
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  const [statusFilter, setStatusFilter] = useState<"all" | "locked" | "unlocked">("all");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [scannerStudent, setScannerStudent] = useState<Student | undefined>(undefined);
  const [isBulkScannerOpen, setIsBulkScannerOpen] = useState(false);
  const [isLiveScannerOpen, setIsLiveScannerOpen] = useState(false);
  const [isGlobalImageScanOpen, setIsGlobalImageScanOpen] = useState(false);
  const [perStudentLiveScanStudent, setPerStudentLiveScanStudent] = useState<Student | null>(null);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form setup for edit modal
  const form = useForm({
    resolver: zodResolver(updatePreferencesSchema),
    defaultValues: {
      stream: "Non-Medical" as const,
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

  // Update preferences mutation for modal
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { studentId: string, preferences: any }) => {
      const response = await apiRequest('PUT', `/api/students/${data.studentId}/preferences`, data.preferences);
      return response;
    },
    onSuccess: () => {
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

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["/api/students", { limit: 50000, offset: 0, district: user?.district }],
  });

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const { data: districtStatus } = useQuery({
    queryKey: ["/api/district-status", user?.district],
    enabled: !!user?.district,
    staleTime: 0, // Ensure fresh data
    gcTime: 0, // Don't cache responses
  });

  const { data: activeRound } = useQuery({
    queryKey: ["/api/counseling/active-round"],
  });

  const { data: unfinalizeRequests } = useQuery<UnfinalizeRequest[]>({
    queryKey: ["/api/unfinalize-requests"],
  });

  const pendingRequest = unfinalizeRequests?.find(r => r.status === 'pending');
  const lastRequest = unfinalizeRequests?.[0]; // Assuming ordered by newest

  const deadline = (settings as any)?.find((s: any) => s.key === 'allocation_deadline')?.value;
  const deadlineDate = deadline ? new Date(deadline) : null;
  const isDeadlinePassed = deadlineDate ? new Date() > deadlineDate : false;


  const lockStudentMutation = useMutation({
    mutationFn: async ({ studentId, isLocked }: { studentId: string, isLocked: boolean }) => {
      await apiRequest("PUT", `/api/students/${studentId}/lock`, { isLocked });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: "Student Lock Status Updated",
        description: "Student lock status has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Lock Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const releaseStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      await apiRequest("PUT", `/api/students/${studentId}/release`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/district-status", user?.district] });
      toast({
        title: "Student Released",
        description: "Student has been released from district successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Release Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const batchLockMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      const promises = studentIds.map(id => apiRequest("PUT", `/api/students/${id}/lock`, { isLocked: true }));
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setSelectedStudents(new Set());
      toast({
        title: "Students Locked",
        description: `${selectedStudents.size} students have been locked successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Batch Lock Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const batchUnlockMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      const promises = studentIds.map(id => apiRequest("PUT", `/api/students/${id}/lock`, { isLocked: false }));
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setSelectedStudents(new Set());
      toast({
        title: "Students Unlocked",
        description: `${selectedStudents.size} students have been unlocked successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Batch Unlock Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const finalizeDistrictMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/district-status/${user?.district}/finalize`, {});
    },
    onSuccess: () => {
      // Invalidate all relevant queries with exact key matching
      queryClient.invalidateQueries({ queryKey: ["/api/district-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/district-status", user?.district] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });

      // Force refetch with await to ensure immediate update
      queryClient.refetchQueries({
        queryKey: ["/api/district-status", user?.district],
        type: 'active'
      });

      // Also remove any cached data and force fresh fetch
      queryClient.removeQueries({ queryKey: ["/api/district-status", user?.district] });

      toast({
        title: "🎉 District Finalized Successfully!",
        description: `${user?.district} district data has been finalized at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short', dateStyle: 'short' })} and submitted for allocation processing.`,
        duration: 6000, // Show longer for important success message
      });
    },
    onError: (error) => {
      toast({
        title: "Finalization Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unfinalizeRequestMutation = useMutation({
    mutationFn: async (reason: string) => {
      await apiRequest("POST", `/api/district-status/${user?.district}/unfinalize-request`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unfinalize-requests"] });
      toast({
        title: "Request Submitted",
        description: "Your unfinalize request has been sent to Central Admin for review.",
      });
      setIsUnlockRequestModalOpen(false);
      setUnlockReason("");
    },
    onError: (error) => {
      toast({
        title: "Request Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const autoLoadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/district/${user?.district}/auto-load-students`, {});
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/district-status", user?.district] });
      toast({
        title: "Students Loaded Successfully",
        description: `Loaded ${data.loaded} students from entrance exam results. ${data.skipped} students were already present.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Auto-load Failed",
        description: error.message || "Failed to auto-load students",
        variant: "destructive",
      });
    },
  });

  // Derived state: Filtered students based on search term & status toggle
  const filteredStudents = useMemo(() => {
    if (!(studentsData as any)?.students) return [];

    let filtered = (studentsData as any).students;

    // 1. Status Filter
    if (statusFilter === "locked") {
      filtered = filtered.filter((s: Student) => s.lockedBy || s.isLocked);
    } else if (statusFilter === "unlocked") {
      filtered = filtered.filter((s: Student) => !s.lockedBy && !s.isLocked);
    }

    // 2. District Filter (For Central Admin)
    if (user?.role === 'central_admin' && districtFilter !== "all") {
      filtered = filtered.filter((s: Student) => {
        if (districtFilter === "unassigned") return !s.counselingDistrict;
        return s.counselingDistrict === districtFilter;
      });
    }

    // 2. Search Filter
    if (!searchTerm) return filtered;

    const lowerSearch = searchTerm.toLowerCase();
    return filtered.filter((s: Student) =>
      s.name?.toLowerCase().includes(lowerSearch) ||
      s.meritNumber?.toString().includes(lowerSearch) ||
      s.appNo?.toLowerCase().includes(lowerSearch) ||
      s.stream?.toLowerCase().includes(lowerSearch)
    );
  }, [(studentsData as any)?.students, searchTerm, statusFilter]);

  // Derived state: Paginated students
  const totalPages = Math.ceil(filteredStudents.length / recordsPerPage);
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * recordsPerPage;
    return filteredStudents.slice(startIndex, startIndex + recordsPerPage);
  }, [filteredStudents, currentPage, recordsPerPage]);

  // Selection helpers
  const toggleStudentSelection = (studentId: string) => {
    const newSelection = new Set(selectedStudents);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedStudents(newSelection);
  };

  const selectAll = () => {
    const allIds = new Set<string>(filteredStudents.map((s: Student) => s.id));
    setSelectedStudents(allIds);
  };

  const clearSelection = () => {
    setSelectedStudents(new Set());
  };

  // Batch operations
  const handleBatchLock = () => {
    if (selectedStudents.size === 0) return;

    // Only lock students with current district that belong to this district admin
    const selectedStudentObjects = filteredStudents.filter((s: Student) =>
      selectedStudents.has(s.id) &&
      s.counselingDistrict === user?.district &&
      s.districtAdmin === user?.username
    );

    if (selectedStudentObjects.length === 0) {
      toast({
        title: "Cannot Lock Students",
        description: "Only students assigned to your district can be locked.",
        variant: "destructive",
      });
      return;
    }

    const studentsWithoutStream = selectedStudentObjects.filter((s: Student) => !s.stream);
    const studentsWithIncompleteChoices = selectedStudentObjects.filter((s: Student) =>
      !s.choice1 || !s.choice2 || !s.choice3 || !s.choice4 || !s.choice5 ||
      !s.choice6 || !s.choice7 || !s.choice8 || !s.choice9 || !s.choice10
    );

    if (studentsWithoutStream.length > 0) {
      toast({
        title: "Cannot Lock Students",
        description: `${studentsWithoutStream.length} students don't have stream set. Please set streams before locking.`,
        variant: "destructive",
      });
      return;
    }

    if (studentsWithIncompleteChoices.length > 0) {
      toast({
        title: "Cannot Lock Students",
        description: `${studentsWithIncompleteChoices.length} students have incomplete district preferences. Please complete all 10 choices.`,
        variant: "destructive",
      });
      return;
    }

    batchLockMutation.mutate(selectedStudentObjects.map((s: Student) => s.id));
  };

  const handleBatchUnlock = () => {
    if (selectedStudents.size === 0) return;
    batchUnlockMutation.mutate(Array.from(selectedStudents));
  };

  // Calculate finalization readiness - only consider students with current district belonging to this admin
  const eligibleStudents = filteredStudents.filter((s: Student) =>
    s.counselingDistrict === user?.district && s.districtAdmin === user?.username
  );
  const totalEligibleStudents = eligibleStudents.length;
  const lockedEligibleStudents = eligibleStudents.filter((s: Student) => s.isLocked).length;
  const studentsWithChoices = eligibleStudents.filter((s: Student) =>
    s.choice1 || s.choice2 || s.choice3 || s.choice4 || s.choice5 ||
    s.choice6 || s.choice7 || s.choice8 || s.choice9 || s.choice10
  ).length;

  const canFinalize = lockedEligibleStudents === totalEligibleStudents && totalEligibleStudents > 0 && !isDeadlinePassed;

  // districtStatus is an array, find the current district's status
  const currentDistrictStatus = Array.isArray(districtStatus)
    ? districtStatus.find((status: any) => status.district === user?.district)
    : districtStatus;
  const isFinalized = currentDistrictStatus?.isFinalized || false;

  const handleFinalize = () => {
    if (!canFinalize) return;
    finalizeDistrictMutation.mutate();
  };

  // Modal helper functions
  const openEditModal = (student: Student) => {
    if (isDeadlinePassed) {
      toast({
        title: "Deadline Passed",
        description: "Cannot modify preferences after the deadline",
        variant: "destructive",
      });
      return;
    }

    setSelectedStudentForEdit(student);
    form.reset({
      stream: (STREAM_DISPLAY_MAP[student.stream || ''] || student.stream) as any,
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

  const handleModalSave = (data: any) => {
    if (!selectedStudentForEdit) return;

    // If user is central admin, automatically set district and district admin
    const preferences: any = { ...data };
    if (user?.role === 'central_admin') {
      preferences.counselingDistrict = "SAS Nagar (Mohali)";
      preferences.districtAdmin = "central_admin";
    }

    updatePreferencesMutation.mutate({
      studentId: selectedStudentForEdit.id,
      preferences: preferences
    });
  };


  const startEditing = (student: Student) => {
    if (isDeadlinePassed) {
      toast({
        title: "Deadline Passed",
        description: "Cannot modify preferences after the deadline",
        variant: "destructive",
      });
      return;
    }

    setEditingStudent(student.id);
    form.reset({
      stream: (STREAM_DISPLAY_MAP[student.stream || ''] || student.stream) as any,
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
  };

  const cancelEditing = () => {
    setEditingStudent(null);
    form.reset();
  };

  const onSubmit = (values: z.infer<typeof updatePreferencesSchema>) => {
    if (editingStudent) {
      // If user is central admin, automatically set district and district admin
      const preferences: any = { ...values };
      if (user?.role === 'central_admin') {
        preferences.counselingDistrict = "SAS Nagar (Mohali)";
        preferences.districtAdmin = "central_admin";
      }

      updatePreferencesMutation.mutate({
        studentId: editingStudent,
        preferences: preferences,
      });
    }
  };

  const handleLockToggle = (student: Student) => {
    if (isDeadlinePassed) {
      toast({
        title: "Deadline Passed",
        description: "Cannot modify lock status after the deadline",
        variant: "destructive",
      });
      return;
    }

    // District admin can only lock students, not unlock them (except central admin)
    if (student.isLocked) {
      if (user?.role === 'central_admin') {
        // Central admin can unlock directly
        lockStudentMutation.mutate({
          studentId: student.id,
          isLocked: false,
        });
      } else {
        toast({
          title: "Cannot Unlock",
          description: "Only central admin can unlock students. You can request unlock from central admin.",
          variant: "destructive",
        });
      }
      return;
    }

    // For locking, show confirmation dialog
    setSelectedStudentForLock(student);
    setIsLockConfirmDialogOpen(true);
  };

  const confirmLockStudent = () => {
    if (!selectedStudentForLock) return;

    // Validate that all preferences including stream are set before locking
    if (!selectedStudentForLock.stream) {
      toast({
        title: "Cannot Lock Student",
        description: "Student stream must be set before locking. Please update the student's stream preference.",
        variant: "destructive",
      });
      setIsLockConfirmDialogOpen(false);
      setSelectedStudentForLock(null);
      return;
    }

    const hasAllChoices = selectedStudentForLock.choice1 && selectedStudentForLock.choice2 && selectedStudentForLock.choice3 &&
      selectedStudentForLock.choice4 && selectedStudentForLock.choice5 && selectedStudentForLock.choice6 &&
      selectedStudentForLock.choice7 && selectedStudentForLock.choice8 && selectedStudentForLock.choice9 && selectedStudentForLock.choice10;

    if (!hasAllChoices) {
      toast({
        title: "Cannot Lock Student",
        description: "All 10 district preferences must be set before locking. Please complete all choices.",
        variant: "destructive",
      });
      setIsLockConfirmDialogOpen(false);
      setSelectedStudentForLock(null);
      return;
    }

    lockStudentMutation.mutate({
      studentId: selectedStudentForLock.id,
      isLocked: true,
    });

    setIsLockConfirmDialogOpen(false);
    setSelectedStudentForLock(null);
  };

  const handleRequestUnlock = (student: Student) => {
    setSelectedStudentForUnlock(student);
    setUnlockReason("");
    setIsUnlockRequestModalOpen(true);
  };

  const submitUnlockRequest = async () => {
    if (!unlockReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason",
        variant: "destructive",
      });
      return;
    }

    if (selectedStudentForUnlock) {
      try {
        const response = await fetch('/api/unlock-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            studentId: selectedStudentForUnlock.id,
            reason: unlockReason.trim(),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          toast({
            title: "Error",
            description: data.message || "Failed to send unlock request",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Unlock Request Sent",
            description: "Your unlock request has been sent to central admin for review",
          });
          setIsUnlockRequestModalOpen(false);
          setSelectedStudentForUnlock(null);
          setUnlockReason("");
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to send unlock request",
          variant: "destructive",
        });
      }
    } else {
      unfinalizeRequestMutation.mutate(unlockReason.trim());
    }
  };

  const handleReleaseStudent = (student: Student) => {
    if (isDeadlinePassed) {
      toast({
        title: "Deadline Passed",
        description: "Cannot release students after the deadline",
        variant: "destructive",
      });
      return;
    }

    releaseStudentMutation.mutate(student.id);
  };

  const handleAutoLoadStudents = () => {
    autoLoadMutation.mutate();
  };

  // Bulk scanner save handler
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
    queryClient.invalidateQueries({ queryKey: ["/api/students"] });
    toast({ title: "Bulk Scan Complete", description: `${successCount} of ${pages.length} students saved successfully.` });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'allotted':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Allotted</Badge>;
      case 'not_allotted':
        return <Badge variant="destructive">Not Allotted</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper function to determine if current user can edit a specific student
  const canEditStudent = (student: Student) => {
    if (!user) return false;

    // Central admin can edit all students
    if (user.role === 'central_admin') {
      return true;
    }

    // District admin logic
    if (user.role === 'district_admin') {
      // If student has no assigned district admin (N/A), any district admin can edit
      if (!student.districtAdmin) {
        return true;
      }

      // Check if student belongs to this district
      const belongsToDistrict = student.counselingDistrict === user.district;

      // If student has an assigned district admin, only that specific admin can edit
      return student.districtAdmin === user.username && belongsToDistrict;
    }

    return false;
  };

  // Helper function to check if all student preferences are filled
  const areAllPreferencesFilled = (student: Student) => {
    return !!(student.choice1?.trim() && student.choice2?.trim() && student.choice3?.trim() &&
      student.choice4?.trim() && student.choice5?.trim() && student.choice6?.trim() &&
      student.choice7?.trim() && student.choice8?.trim() && student.choice9?.trim() &&
      student.choice10?.trim() && student.stream);
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="District Administration"
        breadcrumbs={[
          { name: "Home" },
          { name: "District Administration" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Status Banner */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <ShieldQuestion className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-semibold">District: {user?.district || 'All Districts'}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                      {isFinalized ?
                        "District data has been finalized and submitted for allocation" :
                        "You can modify student preferences until the deadline"
                      }
                      {activeRound != null && (
                         <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            Active Round: {String((activeRound as any).roundName)} (Round {String((activeRound as any).roundNumber)})
                         </Badge>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {isFinalized ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <Badge variant="secondary" className="bg-green-100 text-green-800">✓ Finalized</Badge>
                    </>
                  ) : isDeadlinePassed ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <Badge variant="destructive">Deadline Passed</Badge>
                    </>
                  ) : deadlineDate ? (
                    <>
                      <Clock className="w-5 h-5 text-amber-500" />
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        {Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days left
                      </Badge>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Request Status Banners */}
          {pendingRequest && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3 shadow-sm">
              <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900">Unfinalize Request Pending</h4>
                <p className="text-sm mt-1">
                  Your request to unfinalize {user?.district} is currently under review by Central Admin. 
                  Submitted {pendingRequest.createdAt ? formatDistanceToNow(new Date(pendingRequest.createdAt), { addSuffix: true }) : 'Just now'}.
                </p>
              </div>
            </div>
          )}

          {lastRequest?.status === 'rejected' && (!pendingRequest) && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start flex-col gap-2 shadow-sm relative overflow-hidden pr-10">
              <div className="flex items-start gap-3 w-full">
                <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900">Unfinalize Request Rejected</h4>
                  <p className="text-sm mt-1">
                    Your previous request to unfinalize {user?.district} was rejected by Central Admin.
                  </p>
                  {lastRequest.reviewComments && (
                    <div className="mt-2 p-2 bg-white rounded border border-red-100 text-sm">
                      <span className="font-medium text-red-900">Reason: </span>
                      {lastRequest.reviewComments}
                    </div>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-red-100 text-red-500"
                onClick={() => queryClient.setQueryData(["/api/unfinalize-requests"], (old: any) => 
                  old?.filter((r: any) => r.id !== lastRequest.id)
                )}
              >
                <X className="w-4 h-4" />
                <span className="sr-only">Dismiss</span>
              </Button>
            </div>
          )}

          {lastRequest?.status === 'approved' && (!pendingRequest) && (
            <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-start flex-col gap-2 shadow-sm relative overflow-hidden pr-10">
              <div className="flex items-start gap-3 w-full">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-green-900">District Unfinalized</h4>
                  <p className="text-sm mt-1">
                    Your request was approved. You can now modify student preferences again.
                    Don't forget to finalize again when you are finished!
                  </p>
                  {lastRequest.reviewComments && (
                    <div className="mt-2 p-2 bg-white rounded border border-green-100 text-sm">
                      <span className="font-medium text-green-900">Note from Admin: </span>
                      {lastRequest.reviewComments}
                    </div>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-green-100 text-green-500"
                onClick={() => queryClient.setQueryData(["/api/unfinalize-requests"], (old: any) => 
                  old?.filter((r: any) => r.id !== lastRequest.id)
                )}
              >
                <X className="w-4 h-4" />
                <span className="sr-only">Dismiss</span>
              </Button>
            </div>
          )}

          {/* Tabs Navigation */}
          <Tabs defaultValue="student-management" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student-management">Student Preference Management</TabsTrigger>
              <TabsTrigger value="district-finalization">District Finalization Status</TabsTrigger>
            </TabsList>

            {/* Student Management Tab */}
            <TabsContent value="student-management" className="space-y-6">
              {/* Student Search and Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Search className="w-5 h-5 mr-2 text-primary" />
                      Student Preference Management
                    </div>
                    {selectedStudents.size > 0 && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        {selectedStudents.size} selected
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, merit number, or application number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                        data-testid="input-search-students"
                      />
                    </div>
                    <div className="flex-1 w-[200px]">
                      <Select
                        value={statusFilter}
                        onValueChange={(val: any) => setStatusFilter(val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Students</SelectItem>
                          <SelectItem value="locked">Locked Only</SelectItem>
                          <SelectItem value="unlocked">Unlocked Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {user?.role === 'central_admin' && (
                      <div className="flex-1 w-[220px]">
                        <Select
                          value={districtFilter}
                          onValueChange={(val: any) => setDistrictFilter(val)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Filter by district" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Districts</SelectItem>
                            <SelectItem value="unassigned">Unassigned District</SelectItem>
                            {COUNSELING_DISTRICTS.map((district) => (
                              <SelectItem key={district} value={district}>
                                {district}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAll}
                        disabled={filteredStudents.length === 0}
                        data-testid="button-select-all"
                      >
                        Select All
                      </Button>
                      {selectedStudents.size > 0 && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearSelection}
                            data-testid="button-clear-selection"
                          >
                            Clear
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleBatchLock}
                            disabled={
                              batchLockMutation.isPending ||
                              isDeadlinePassed ||
                              isFinalized ||
                              Array.from(selectedStudents).some(id => {
                                const student = filteredStudents.find((s: Student) => s.id === id);
                                return !student?.stream || !student?.choice1;
                              }) ||
                              Array.from(selectedStudents).every(id => {
                                const student = filteredStudents.find((s: Student) => s.id === id);
                                return student?.isLocked === true;
                              })
                            }
                            title={
                              Array.from(selectedStudents).some(id => {
                                const student = filteredStudents.find((s: Student) => s.id === id);
                                return !student?.stream || !student?.choice1;
                              }) 
                                ? "Cannot bulk lock: One or more selected students have missing stream or station preferences" 
                                : undefined
                            }
                            data-testid="button-batch-lock"
                          >
                            {batchLockMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Locking...</>
                            ) : (
                              <>🔒 Lock Selected</>
                            )}
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Scanner Buttons */}
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsLiveScannerOpen(true)}
                        className="text-orange-500 border-orange-500 hover:bg-orange-50"
                        disabled={isDeadlinePassed || isFinalized}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Live Scan
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsBulkScannerOpen(true)}
                        className="text-primary border-primary hover:bg-primary/10"
                        disabled={isDeadlinePassed || isFinalized}
                      >
                        <UploadCloud className="w-4 h-4 mr-2" />
                        Bulk PDF Scan
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setScannerStudent(undefined); setIsGlobalImageScanOpen(true); }}
                        className="text-violet-600 border-violet-500 hover:bg-violet-50"
                        disabled={isDeadlinePassed || isFinalized}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Upload Image
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">
                                <input
                                  type="checkbox"
                                  checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                                  onChange={selectedStudents.size === filteredStudents.length ? clearSelection : selectAll}
                                  className="rounded border-gray-300"
                                  data-testid="checkbox-select-all"
                                />
                              </TableHead>
                              <TableHead>App No.</TableHead>
                              <TableHead>Merit No.</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Stream</TableHead>
                              <TableHead>Counseling District</TableHead>
                              <TableHead>District Admin</TableHead>
                              <TableHead>Locked</TableHead>
                              <TableHead>Choices (1-10)</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredStudents.map((student: Student) => (
                              <TableRow key={student.id} data-testid={`student-row-${student.meritNumber}`}>
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={selectedStudents.has(student.id)}
                                    onChange={() => toggleStudentSelection(student.id)}
                                    className="rounded border-gray-300"
                                    data-testid={`checkbox-select-${student.meritNumber}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{student.appNo}</TableCell>
                                <TableCell className="font-medium">{student.meritNumber}</TableCell>
                                <TableCell>{student.name}</TableCell>
                                <TableCell>{student.stream}</TableCell>
                                <TableCell>{student.counselingDistrict || 'N/A'}</TableCell>
                                <TableCell>{student.districtAdmin || 'N/A'}</TableCell>
                                <TableCell>
                                  {student.isLocked === true ? (
                                    <Badge variant="destructive" className="bg-red-100 text-red-800">
                                      🔒 Locked
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-green-100 text-green-800">
                                      🔓 Unlocked
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-xs">
                                  <div className="flex items-center justify-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openChoicesModal(student)}
                                      className="p-1 h-6 w-6"
                                      data-testid={`button-view-choices-${student.meritNumber}`}
                                    >
                                      <Eye className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    {canEditStudent(student) ? (
                                      <>
                                        {/* Per-student scan buttons */}
                                        {!student.isLocked && !isDeadlinePassed && !isFinalized && (
                                          <>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 px-2 text-emerald-600 border-emerald-300"
                                              onClick={() => setPerStudentLiveScanStudent(student)}
                                              title="Live Camera Scan"
                                            >
                                              <Camera className="w-3 h-3" />
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 px-2 text-violet-600 border-violet-300"
                                              onClick={() => { setScannerStudent(student); setIsScannerOpen(true); }}
                                              title="Upload OMR Image"
                                            >
                                              <UploadCloud className="w-3 h-3" />
                                            </Button>
                                          </>
                                        )}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => openEditModal(student)}
                                          disabled={isDeadlinePassed || student.isLocked === true || isFinalized}
                                          data-testid={`button-edit-${student.meritNumber}`}
                                        >
                                          <Edit className="w-3 h-3 mr-1" />
                                          Edit
                                        </Button>
                                      </>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled
                                        data-testid={`button-edit-disabled-${student.meritNumber}`}
                                        className="text-muted-foreground"
                                      >
                                        <Edit className="w-3 h-3 mr-1" />
                                        Edit
                                      </Button>
                                    )}
                                    {/* Lock/Unlock buttons - only show if user can edit student */}
                                    {canEditStudent(student) && (
                                      student.isLocked === true ? (
                                        user?.role === 'central_admin' ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleLockToggle(student)}
                                            disabled={isDeadlinePassed}
                                            data-testid={`button-unlock-${student.meritNumber}`}
                                          >
                                            🔓 Unlock
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleRequestUnlock(student)}
                                            disabled={isDeadlinePassed}
                                            data-testid={`button-request-unlock-${student.meritNumber}`}
                                          >
                                            📝 Request Unlock
                                          </Button>
                                        )
                                      ) : areAllPreferencesFilled(student) ? (
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handleLockToggle(student)}
                                          disabled={isDeadlinePassed}
                                          data-testid={`button-lock-${student.meritNumber}`}
                                        >
                                          🔒 Lock
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled
                                          data-testid={`button-lock-disabled-${student.meritNumber}`}
                                          className="text-muted-foreground"
                                          title="Fill all preferences to enable lock"
                                        >
                                          🔒 Lock
                                        </Button>
                                      )
                                    )}
                                    {/* Show release button only if user is Central Admin, student has current district and data is not locked */}
                                    {canEditStudent(student) && user?.role === 'central_admin' && student.counselingDistrict && !student.isLocked && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleReleaseStudent(student)}
                                        disabled={isDeadlinePassed}
                                        data-testid={`button-release-${student.meritNumber}`}
                                      >
                                        <RotateCcw className="w-3 h-3 mr-1" />
                                        Release
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {filteredStudents.length === 0 && (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">No students found matching your search.</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* District Finalization Tab */}
            <TabsContent value="district-finalization" className="space-y-6">
              {/* Finalization Status Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-primary" />
                      District Finalization Status
                    </div>
                    <Button
                      variant={isFinalized ? "secondary" : (canFinalize ? "default" : "outline")}
                      size="sm"
                      onClick={handleFinalize}
                      disabled={isFinalized || !canFinalize || finalizeDistrictMutation.isPending}
                      data-testid="button-finalize-district"
                    >
                      {isFinalized ? "District Finalized" : (
                        finalizeDistrictMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing...</>
                        ) : "Finalize District"
                      )}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 border rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{totalEligibleStudents}</div>
                      <div className="text-sm text-muted-foreground">Total Students</div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{lockedEligibleStudents}</div>
                      <div className="text-sm text-muted-foreground">Locked Students</div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{studentsWithChoices}</div>
                      <div className="text-sm text-muted-foreground">Students with Choices</div>
                    </div>
                  </div>

                  {!canFinalize && totalEligibleStudents > 0 && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        <strong>To finalize:</strong> All students must be locked before you can finalize the district data.
                        {lockedEligibleStudents < totalEligibleStudents && (
                          <span> You need to lock {totalEligibleStudents - lockedEligibleStudents} more students.</span>
                        )}
                      </p>
                    </div>
                  )}

                  {canFinalize && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-sm text-green-800 dark:text-green-300">
                        <strong>Ready to finalize!</strong> All students are locked and your district is ready for allocation processing.
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-400 mt-1 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        Status checked at: {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' })}
                      </p>
                    </div>
                  )}

                  {isFinalized && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="space-y-2">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                          <strong>District Finalized!</strong> Your district data has been successfully finalized and submitted for allocation processing.
                        </p>
                        {currentDistrictStatus?.finalizedAt && (
                          <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            Finalized at: {new Date(currentDistrictStatus.finalizedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' })}
                          </p>
                        )}
                        {currentDistrictStatus?.finalizedBy && (
                          <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center">
                            <Shield className="w-3 h-3 mr-1" />
                            Finalized by: {currentDistrictStatus.finalizedBy}
                          </p>
                        )}
                        {!pendingRequest && user?.role === 'district_admin' && (
                          <div className="pt-2 mt-2 border-t border-blue-200 dark:border-blue-800">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                setSelectedStudentForUnlock(null);
                                setIsUnlockRequestModalOpen(true);
                              }}
                              className="w-full sm:w-auto text-blue-700 border-blue-300 hover:bg-blue-100 dark:text-blue-300 dark:border-blue-700 dark:hover:bg-blue-900"
                            >
                              <Unlock className="w-4 h-4 mr-2" />
                              Request Unfinalize
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>


          {/* Edit Modal */}
          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Student Preferences - {selectedStudentForEdit?.name}</DialogTitle>
              </DialogHeader>

              {/* Central Admin Notice */}
              {user?.role === 'central_admin' && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 mb-4" data-testid="text-central-admin-edit-notice">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <strong>Central Admin Mode:</strong> When you save these preferences, the student will be automatically assigned to district <strong>"SAS Nagar (Mohali)"</strong> with district admin <strong>"central_admin"</strong>.
                  </p>
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleModalSave)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="stream"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stream</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-stream">
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
                  </div>

                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      <strong>District Choices:</strong> Students can select up to 10 districts in order of preference.
                      Only the 10 school districts where seats are available are shown. Students will be allocated to their highest available choice during the allocation process.
                    </p>
                  </div>

                  <div className="grid grid-cols-5 gap-3 mb-4">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((choiceNum) => (
                      <FormField
                        key={choiceNum}
                        control={form.control}
                        name={`choice${choiceNum}` as any}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Choice {choiceNum}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`select-choice${choiceNum}`}>
                                  <SelectValue placeholder="Select district" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value=" ">None</SelectItem>
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
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updatePreferencesMutation.isPending}
                      data-testid="button-save-preferences"
                    >
                      {updatePreferencesMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                      ) : (
                        <><Save className="w-4 h-4 mr-2" /> Save Changes</>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Choices View Modal */}
          <Dialog open={isChoicesModalOpen} onOpenChange={setIsChoicesModalOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>District Choices - {selectedStudentForChoices?.name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2">
                  {selectedStudentForChoices && [
                    selectedStudentForChoices.choice1, selectedStudentForChoices.choice2,
                    selectedStudentForChoices.choice3, selectedStudentForChoices.choice4,
                    selectedStudentForChoices.choice5, selectedStudentForChoices.choice6,
                    selectedStudentForChoices.choice7, selectedStudentForChoices.choice8,
                    selectedStudentForChoices.choice9, selectedStudentForChoices.choice10
                  ].map((choice, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded">
                      <span className="font-medium">Choice {index + 1}:</span>
                      <span className={choice ? "text-blue-600" : "text-gray-400"}>
                        {choice || "Not set"}
                      </span>
                    </div>
                  ))}
                </div>

                {selectedStudentForChoices && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><strong>Stream:</strong> {selectedStudentForChoices.stream || "Not set"}</div>
                      <div><strong>Status:</strong> {selectedStudentForChoices.isLocked ? "🔒 Locked" : "🔓 Unlocked"}</div>
                      <div><strong>Merit Number:</strong> {selectedStudentForChoices.meritNumber}</div>
                      <div><strong>App Number:</strong> {selectedStudentForChoices.appNo}</div>
                    </div>
                  </div>
                )}
              </div>

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

          {/* Unlock Request Modal */}
          <Dialog open={isUnlockRequestModalOpen} onOpenChange={setIsUnlockRequestModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {selectedStudentForUnlock ? `Request Unlock - ${selectedStudentForUnlock.name}` : `Request District Unfinalize`}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-sm border border-amber-200 flex items-start">
                  <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5 text-amber-500" />
                  {selectedStudentForUnlock ? (
                    <p>
                      This will send a request to the Central Administrator to unlock this student.
                      You must provide a valid reason for this request.
                    </p>
                  ) : (
                    <p>
                      This will send a request to the Central Administrator to unfinalize the entire {user?.district} district so you can resume modifying student preferences. Provide a valid reason.
                    </p>
                  )}
                </div>

                {selectedStudentForUnlock && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <div className="text-sm">
                      <div><strong>Student:</strong> {selectedStudentForUnlock?.name}</div>
                      <div><strong>Merit Number:</strong> {selectedStudentForUnlock?.meritNumber}</div>
                      <div><strong>App Number:</strong> {selectedStudentForUnlock?.appNo}</div>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="unlock-reason" className="block text-sm font-medium mb-2">
                    Reason for Request <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    id="unlock-reason"
                    placeholder={selectedStudentForUnlock ? "Please provide a detailed reason for requesting to unlock this student's preferences..." : "Please provide a detailed reason for requesting to unfinalize your district..."}
                    value={unlockReason}
                    onChange={(e) => setUnlockReason(e.target.value)}
                    className="min-h-[100px]"
                    data-testid="textarea-unlock-reason"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsUnlockRequestModalOpen(false);
                    setSelectedStudentForUnlock(null);
                    setUnlockReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitUnlockRequest}
                  disabled={!unlockReason.trim() || unfinalizeRequestMutation.isPending}
                  data-testid="button-submit-unlock-request"
                >
                  {unfinalizeRequestMutation.isPending ? "Submitting..." : "Send Request"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Lock Confirmation Dialog */}
          <AlertDialog open={isLockConfirmDialogOpen} onOpenChange={setIsLockConfirmDialogOpen}>
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

                  <div className="p-3 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      ⚠️ Once locked, only a central administrator can unlock this student's preferences.
                      This action ensures data integrity during the allocation process.
                    </p>
                  </div>
                </div>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setIsLockConfirmDialogOpen(false);
                    setSelectedStudentForLock(null);
                  }}
                  data-testid="button-cancel-lock"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmLockStudent}
                  disabled={lockStudentMutation.isPending}
                  data-testid="button-confirm-lock"
                  className="bg-red-600 hover:bg-red-700"
                >
                  {lockStudentMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Locking...</>
                  ) : "🔒 Lock Student"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

      </main>

      {/* OMR Scanner Modal (Student-Level) */}
      <OMRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
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

      {/* OMR Scanner Modal (Global Image Upload) */}
      <OMRScannerModal
        isOpen={isGlobalImageScanOpen}
        onClose={() => setIsGlobalImageScanOpen(false)}
        allStudents={(studentsData as any)?.students || []}
        onScanComplete={(scannedStudentId, parsedData) => {
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

      {/* Bulk PDF Scanner */}
      <BulkScannerModal
        isOpen={isBulkScannerOpen}
        onClose={() => setIsBulkScannerOpen(false)}
        students={(studentsData as any)?.students || []}
        onSaveSelected={handleBulkSave}
      />

      {/* Global Live Scanner */}
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
    </div>
  );
}
