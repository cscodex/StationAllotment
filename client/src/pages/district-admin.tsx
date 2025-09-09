import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
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
  RotateCcw
} from "lucide-react";
import type { Student } from "@shared/schema";
import { SCHOOL_DISTRICTS, COUNSELING_DISTRICTS } from "@shared/schema";

// Use school districts for choice selection (where schools are located)
const DISTRICTS = SCHOOL_DISTRICTS;
const STREAMS = ["Medical", "NonMedical", "Commerce"];

const updatePreferencesSchema = z.object({
  stream: z.enum(['Medical', 'Commerce', 'NonMedical']),
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
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<Student | null>(null);
  const [selectedStudentForChoices, setSelectedStudentForChoices] = useState<Student | null>(null);
  const [selectedStudentForUnlock, setSelectedStudentForUnlock] = useState<Student | null>(null);
  const [unlockReason, setUnlockReason] = useState("");
  
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form setup for edit modal
  const form = useForm({
    resolver: zodResolver(updatePreferencesSchema),
    defaultValues: {
      stream: "NonMedical" as const,
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
    queryKey: ["/api/students", { limit: 200, offset: 0, district: user?.district }],
  });

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const { data: districtStatus } = useQuery({
    queryKey: ["/api/district-status", user?.district],
    enabled: !!user?.district,
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/district-status", user?.district] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: "District Finalized",
        description: "District data has been finalized and submitted for allocation",
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


  const filteredStudents = (studentsData as any)?.students?.filter((student: Student) => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.meritNumber.toString().includes(searchTerm) ||
    student.appNo?.includes(searchTerm)
  ) || [];

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
  const isFinalized = (districtStatus as any)?.isFinalized;

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
      stream: student.stream as any,
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
    updatePreferencesMutation.mutate({
      studentId: selectedStudentForEdit.id,
      preferences: data
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
      stream: student.stream as any,
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
      updatePreferencesMutation.mutate({
        studentId: editingStudent,
        preferences: values,
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

    // District admin can only lock students, not unlock them
    if (student.isLocked) {
      toast({
        title: "Cannot Unlock",
        description: "Only central admin can unlock students. You can request unlock from central admin.",
        variant: "destructive",
      });
      return;
    }

    // Validate that all preferences including stream are set before locking
    if (!student.stream) {
      toast({
        title: "Cannot Lock Student",
        description: "Student stream must be set before locking. Please update the student's stream preference.",
        variant: "destructive",
      });
      return;
    }

    const hasAllChoices = student.choice1 && student.choice2 && student.choice3 && 
                         student.choice4 && student.choice5 && student.choice6 &&
                         student.choice7 && student.choice8 && student.choice9 && student.choice10;
    
    if (!hasAllChoices) {
      toast({
        title: "Cannot Lock Student",
        description: "All 10 district preferences must be set before locking. Please complete all choices.",
        variant: "destructive",
      });
      return;
    }

    lockStudentMutation.mutate({
      studentId: student.id,
      isLocked: true,
    });
  };

  const handleRequestUnlock = (student: Student) => {
    setSelectedStudentForUnlock(student);
    setUnlockReason("");
    setIsUnlockRequestModalOpen(true);
  };

  const submitUnlockRequest = async () => {
    if (!selectedStudentForUnlock || !unlockReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for the unlock request",
        variant: "destructive",
      });
      return;
    }

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
                    <p className="text-sm text-muted-foreground">
                      {isFinalized ? 
                        "District data has been finalized and submitted for allocation" :
                        "You can modify student preferences until the deadline"
                      }
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
                            disabled={batchLockMutation.isPending || isDeadlinePassed}
                            data-testid="button-batch-lock"
                          >
                            🔒 Lock Selected
                          </Button>
                        </>
                      )}
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
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openEditModal(student)}
                                      disabled={isDeadlinePassed || student.isLocked === true}
                                      data-testid={`button-edit-${student.meritNumber}`}
                                    >
                                      <Edit className="w-3 h-3 mr-1" />
                                      Edit
                                    </Button>
                                    {student.isLocked === true ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleRequestUnlock(student)}
                                        disabled={isDeadlinePassed}
                                        data-testid={`button-request-unlock-${student.meritNumber}`}
                                      >
                                        📝 Request Unlock
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleLockToggle(student)}
                                        disabled={isDeadlinePassed}
                                        data-testid={`button-lock-${student.meritNumber}`}
                                      >
                                        🔒 Lock
                                      </Button>
                                    )}
                                    {/* Show release button only if student has current district and data is not locked */}
                                    {student.counselingDistrict && !student.isLocked && (
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
          {!isFinalized && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 mr-2 text-primary" />
                    District Finalization Status
                  </div>
                  <Button
                    variant={canFinalize ? "default" : "outline"}
                    size="sm"
                    onClick={handleFinalize}
                    disabled={!canFinalize || finalizeDistrictMutation.isPending}
                    data-testid="button-finalize-district"
                  >
                    {finalizeDistrictMutation.isPending ? "Finalizing..." : "Finalize District"}
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
                  </div>
                )}
              </CardContent>
            </Card>
          )}
            </TabsContent>
          </Tabs>


          {/* Edit Modal */}
          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Student Preferences - {selectedStudentForEdit?.name}</DialogTitle>
              </DialogHeader>
              
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
                      <Save className="w-4 h-4 mr-2" />
                      {updatePreferencesMutation.isPending ? "Saving..." : "Save Changes"}
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
                <DialogTitle>Request Unlock - {selectedStudentForUnlock?.name}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="text-sm">
                    <div><strong>Student:</strong> {selectedStudentForUnlock?.name}</div>
                    <div><strong>Merit Number:</strong> {selectedStudentForUnlock?.meritNumber}</div>
                    <div><strong>App Number:</strong> {selectedStudentForUnlock?.appNo}</div>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="unlock-reason" className="block text-sm font-medium mb-2">
                    Reason for Unlock Request <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    id="unlock-reason"
                    placeholder="Please provide a detailed reason for requesting to unlock this student's preferences..."
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
                  disabled={!unlockReason.trim()}
                  data-testid="button-submit-unlock-request"
                >
                  Send Request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
            </TabsContent>
          </Tabs>
        </div>

        </main>
    </div>
  );
}
