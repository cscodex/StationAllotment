import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  BarChart3, 
  Users, 
  MapPin, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  FileText,
  Eye,
  TrendingUp,
  Percent,
  Search,
  Edit,
  Save,
  X,
  Lock,
  Unlock,
  RotateCcw,
  Settings
} from "lucide-react";
import type { DistrictStatus, Student } from "@shared/schema";
import { SCHOOL_DISTRICTS } from "@shared/schema";

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

export default function DistrictAnalysis() {
  // State for student management
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<Student | null>(null);
  const [isLockConfirmDialogOpen, setIsLockConfirmDialogOpen] = useState(false);
  const [selectedStudentForLock, setSelectedStudentForLock] = useState<Student | null>(null);
  
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

  // Central admin update preferences mutation - sets district to Mohali and districtAdmin to central_admin
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { studentId: string, preferences: any }) => {
      // Central admin edits automatically set district to Mohali and districtAdmin to central_admin
      const centralAdminPreferences = {
        ...data.preferences,
        counselingDistrict: "Mohali",
        districtAdmin: "central_admin"
      };
      
      const response = await apiRequest('PUT', `/api/students/${data.studentId}/preferences`, centralAdminPreferences);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/district-status"] });
      setIsEditModalOpen(false);
      setSelectedStudentForEdit(null);
      form.reset();
      toast({
        title: "Success",
        description: "Student preferences updated successfully. District set to Mohali and assigned to central admin.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/district-status"] });
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

  // Fetch district statuses
  const { data: districtStatuses, isLoading: loadingStatuses } = useQuery<DistrictStatus[]>({
    queryKey: ["/api/district-status"],
  });

  // Fetch students data
  const { data: studentsResponse } = useQuery<{ students: Student[] } | Student[]>({
    queryKey: ["/api/students"],
  });

  // Fetch vacancies data
  const { data: vacancies } = useQuery<any[]>({
    queryKey: ["/api/vacancies"],
  });

  // Handle different API response formats
  const students = Array.isArray(studentsResponse) ? studentsResponse : (studentsResponse as any)?.students || [];

  // Filtered students for search
  const filteredStudents = students.filter((student: Student) => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.meritNumber.toString().includes(searchTerm) ||
    student.appNo?.includes(searchTerm)
  );

  // Helper functions for student management
  const openEditModal = (student: Student) => {
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

  const handleModalSave = (data: any) => {
    if (!selectedStudentForEdit) return;
    updatePreferencesMutation.mutate({
      studentId: selectedStudentForEdit.id,
      preferences: data
    });
  };

  const handleLockToggle = (student: Student) => {
    if (student.isLocked) {
      // Central admin can unlock directly
      lockStudentMutation.mutate({
        studentId: student.id,
        isLocked: false,
      });
    } else {
      // For locking, show confirmation dialog
      setSelectedStudentForLock(student);
      setIsLockConfirmDialogOpen(true);
    }
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

  const handleReleaseStudent = (student: Student) => {
    releaseStudentMutation.mutate(student.id);
  };

  // Helper function to check if all student preferences are filled
  const areAllPreferencesFilled = (student: Student) => {
    return !!(student.choice1?.trim() && student.choice2?.trim() && student.choice3?.trim() && 
              student.choice4?.trim() && student.choice5?.trim() && student.choice6?.trim() && 
              student.choice7?.trim() && student.choice8?.trim() && student.choice9?.trim() && 
              student.choice10?.trim() && student.stream);
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

  // Calculate stream-wise totals
  const streamTotals = students.reduce((acc: any, student: any) => {
    if (!student.stream) return acc;
    acc[student.stream] = (acc[student.stream] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate district-wise, stream-wise breakdown
  const districtBreakdown = districtStatuses?.map(district => {
    const districtStudents = students.filter((s: any) => s.counselingDistrict === district.district);
    const streamBreakdown = {
      Medical: districtStudents.filter((s: any) => s.stream === 'Medical').length,
      Commerce: districtStudents.filter((s: any) => s.stream === 'Commerce').length,
      NonMedical: districtStudents.filter((s: any) => s.stream === 'NonMedical').length,
    };

    const studentsWithChoices = districtStudents.filter((s: any) => 
      s.choice1 || s.choice2 || s.choice3 || s.choice4 || s.choice5 ||
      s.choice6 || s.choice7 || s.choice8 || s.choice9 || s.choice10
    );

    const lockedStudents = districtStudents.filter((s: any) => s.isLocked);

    const districtVacancies = vacancies?.filter(v => v.district === district.district) || [];
    const totalSeats = districtVacancies.reduce((sum, v) => sum + (v.totalSeats || 0), 0);

    return {
      ...district,
      students: districtStudents,
      streamBreakdown,
      studentsWithChoices: studentsWithChoices.length,
      lockedStudents: lockedStudents.length,
      choicesPercentage: districtStudents.length > 0 ? (studentsWithChoices.length / districtStudents.length * 100) : 0,
      lockedPercentage: districtStudents.length > 0 ? (lockedStudents.length / districtStudents.length * 100) : 0,
      totalSeats,
    };
  }) || [];

  // Calculate overall metrics
  const totalStudents = students.length;
  const totalStudentsWithChoices = students.filter((s: any) => 
    s.choice1 || s.choice2 || s.choice3 || s.choice4 || s.choice5 ||
    s.choice6 || s.choice7 || s.choice8 || s.choice9 || s.choice10
  ).length;
  const totalLockedStudents = students.filter((s: any) => s.isLocked).length;
  const finalizedDistricts = districtStatuses?.filter(ds => ds.isFinalized).length || 0;
  const totalDistricts = districtStatuses?.length || 0;

  const getStatusIcon = (isFinalized: boolean) => {
    return isFinalized ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-amber-500" />
    );
  };

  const getFinalizationBadge = (isFinalized: boolean) => {
    return (
      <Badge variant={isFinalized ? "secondary" : "outline"} 
             className={isFinalized ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
        {isFinalized ? "Finalized" : "Pending"}
      </Badge>
    );
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="District Analysis" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Reports" },
          { name: "District Analysis" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="total-students">
                      {totalStudents.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Students</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="students-with-choices">
                      {totalStudentsWithChoices.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">With Preferences</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="finalized-districts">
                      {finalizedDistricts}/{totalDistricts}
                    </p>
                    <p className="text-xs text-muted-foreground">Districts Finalized</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="locked-students">
                      {totalLockedStudents.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Locked Students</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stream-wise Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-primary" />
                Stream-wise Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(streamTotals).map(([stream, count]) => (
                  <div key={stream} className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-2xl font-bold text-primary" data-testid={`stream-${stream.toLowerCase()}-count`}>
                      {(count as number).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">{stream}</p>
                    <p className="text-xs text-muted-foreground">
                      {totalStudents > 0 ? ((count as number / totalStudents * 100)).toFixed(1) : 0}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* District-wise Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-primary" />
                  District-wise Analysis
                </div>
                <Badge variant={finalizedDistricts === totalDistricts ? "default" : "destructive"}>
                  {finalizedDistricts}/{totalDistricts} Finalized
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="streams">Stream Distribution</TabsTrigger>
                  <TabsTrigger value="capacity">Seat Capacity</TabsTrigger>
                  <TabsTrigger value="student-management">Student Management</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-6">
                  <div className="space-y-4">
                    {loadingStatuses ? (
                      <div className="flex items-center justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : (
                      districtBreakdown.map((district) => (
                        <Card key={district.id} className={`border-l-4 ${district.isFinalized ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  {getStatusIcon(!!district.isFinalized)}
                                  <h3 className="font-semibold">{district.district}</h3>
                                  {getFinalizationBadge(!!district.isFinalized)}
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Total Students:</span>
                                    <p className="font-medium" data-testid={`district-${district.district}-total`}>
                                      {district.students.length.toLocaleString()}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">With Preferences:</span>
                                    <p className="font-medium" data-testid={`district-${district.district}-with-choices`}>
                                      {district.studentsWithChoices} ({district.choicesPercentage.toFixed(1)}%)
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Locked:</span>
                                    <p className="font-medium" data-testid={`district-${district.district}-locked`}>
                                      {district.lockedStudents} ({district.lockedPercentage.toFixed(1)}%)
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Available Seats:</span>
                                    <p className="font-medium" data-testid={`district-${district.district}-seats`}>
                                      {district.totalSeats.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="streams" className="mt-6">
                  <div className="space-y-4">
                    {districtBreakdown.map((district) => (
                      <Card key={`${district.id}-streams`}>
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            {getStatusIcon(!!district.isFinalized)}
                            <h3 className="font-semibold">{district.district}</h3>
                            {getFinalizationBadge(!!district.isFinalized)}
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            {Object.entries(district.streamBreakdown).map(([stream, count]) => (
                              <div key={stream} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
                                <p className="text-lg font-bold" data-testid={`district-${district.district}-${stream.toLowerCase()}`}>
                                  {count}
                                </p>
                                <p className="text-sm text-muted-foreground">{stream}</p>
                                <p className="text-xs text-muted-foreground">
                                  {district.students.length > 0 ? ((count / district.students.length) * 100).toFixed(1) : 0}%
                                </p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="capacity" className="mt-6">
                  <div className="space-y-4">
                    {districtBreakdown.map((district) => {
                      const demandRatio = district.totalSeats > 0 ? (district.students.length / district.totalSeats) : 0;
                      return (
                        <Card key={`${district.id}-capacity`}>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                {getStatusIcon(!!district.isFinalized)}
                                <h3 className="font-semibold">{district.district}</h3>
                              </div>
                              <Badge variant={demandRatio > 1 ? "destructive" : demandRatio > 0.8 ? "outline" : "secondary"}>
                                {demandRatio > 1 ? "Over-demand" : demandRatio > 0.8 ? "High Demand" : "Normal"}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Students:</span>
                                <p className="font-medium">{district.students.length.toLocaleString()}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Available Seats:</span>
                                <p className="font-medium">{district.totalSeats.toLocaleString()}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Demand Ratio:</span>
                                <p className="font-medium">{demandRatio.toFixed(2)}:1</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Capacity:</span>
                                <p className={`font-medium ${demandRatio > 1 ? 'text-red-600' : 'text-green-600'}`}>
                                  {district.totalSeats > 0 ? ((district.totalSeats / district.students.length) * 100).toFixed(1) : 0}%
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>

                {/* Student Management Tab */}
                <TabsContent value="student-management" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Settings className="w-5 h-5 mr-2 text-primary" />
                          Central Admin Student Management
                        </div>
                        <Badge variant="outline" className="bg-blue-100 text-blue-800">
                          {filteredStudents.length} students
                        </Badge>
                      </CardTitle>
                      <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search students by name, merit number, or app number..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                            data-testid="input-search-students"
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Merit #</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Stream</TableHead>
                              <TableHead>District</TableHead>
                              <TableHead>District Admin</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredStudents.slice(0, 50).map((student: Student) => (
                              <TableRow key={student.id}>
                                <TableCell className="font-medium">
                                  {student.meritNumber}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <div className="font-medium">{student.name}</div>
                                    <div className="text-sm text-muted-foreground">{student.appNo}</div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {student.stream || 'Not Set'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm">
                                    {student.counselingDistrict || 'Not Assigned'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm">
                                    {student.districtAdmin || 'Not Assigned'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    {getStatusBadge(student.allocationStatus || 'pending')}
                                    {student.isLocked && (
                                      <Badge variant="secondary" className="text-xs bg-gray-100">
                                        <Lock className="w-3 h-3 mr-1" />
                                        Locked
                                      </Badge>
                                    )}
                                    {areAllPreferencesFilled(student) && (
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Complete
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditModal(student)}
                                      data-testid={`button-edit-${student.id}`}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleLockToggle(student)}
                                      data-testid={`button-lock-${student.id}`}
                                    >
                                      {student.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                    </Button>

                                    {student.counselingDistrict && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleReleaseStudent(student)}
                                        data-testid={`button-release-${student.id}`}
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {filteredStudents.length > 50 && (
                        <div className="mt-4 text-center text-sm text-muted-foreground">
                          Showing first 50 of {filteredStudents.length} students. Use search to find specific students.
                        </div>
                      )}

                      {filteredStudents.length === 0 && (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">No students found matching your search.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Edit Modal */}
          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Edit Student Preferences - {selectedStudentForEdit?.name}
                  <div className="text-sm font-normal text-muted-foreground mt-1">
                    Merit Number: {selectedStudentForEdit?.meritNumber} | App Number: {selectedStudentForEdit?.appNo}
                  </div>
                  <div className="text-sm font-normal text-blue-600 mt-1">
                    Note: Central admin edits will set district to "Mohali" and district admin to "central_admin"
                  </div>
                </DialogTitle>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleModalSave)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="stream"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stream</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                  <div className="space-y-4">
                    <h4 className="font-medium">District Preferences (in order of preference)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Array.from({ length: 10 }, (_, i) => {
                        const choiceNumber = i + 1;
                        const fieldName = `choice${choiceNumber}` as keyof typeof form.control._defaultValues;
                        
                        return (
                          <FormField
                            key={choiceNumber}
                            control={form.control}
                            name={fieldName}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Choice {choiceNumber}</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-choice-${choiceNumber}`}>
                                      <SelectValue placeholder={`Select choice ${choiceNumber}`} />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value=" ">-- No Choice --</SelectItem>
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
                        );
                      })}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={updatePreferencesMutation.isPending}
                      data-testid="button-save-preferences"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updatePreferencesMutation.isPending ? 'Saving...' : 'Save Preferences'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Lock Confirmation Dialog */}
          <AlertDialog open={isLockConfirmDialogOpen} onOpenChange={setIsLockConfirmDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Lock Student</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to lock {selectedStudentForLock?.name}? 
                  <br />
                  <span className="font-medium">This will prevent any further changes to their preferences.</span>
                  <br />
                  <br />
                  <span className="text-sm text-muted-foreground">
                    Student will be assigned to district "Mohali" with district admin "central_admin".
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmLockStudent}
                  disabled={lockStudentMutation.isPending}
                  data-testid="button-confirm-lock"
                >
                  {lockStudentMutation.isPending ? 'Locking...' : 'Lock Student'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
    </div>
  );
}