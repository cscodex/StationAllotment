import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, Users, Edit3, Save, X, AlertTriangle, Lock, Unlock, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Student, DistrictStatus } from "@shared/schema";
import { SCHOOL_DISTRICTS } from "@shared/schema";

export default function StudentPreferenceManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isOverrideConfirmOpen, setIsOverrideConfirmOpen] = useState(false);
  const [editChoices, setEditChoices] = useState<{[key: string]: string}>({});
  
  // State for central admin student search
  const [centralSearchTerm, setCentralSearchTerm] = useState("");
  const [centralSelectedStudent, setCentralSelectedStudent] = useState<Student | null>(null);
  const [isCentralEditDialogOpen, setIsCentralEditDialogOpen] = useState(false);
  const [centralEditChoices, setCentralEditChoices] = useState<{[key: string]: string}>({});
  
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Available school districts for dropdown
  const districts = SCHOOL_DISTRICTS;

  // Fetch students based on user role
  const { data: studentsData, isLoading } = useQuery<{students: Student[], total: number}>({
    queryKey: user?.role === 'district_admin' 
      ? ["/api/students", { district: user.district, limit: 1000, offset: 0 }]
      : ["/api/students", { limit: 1000, offset: 0 }],
  });

  // Fetch district statuses
  const { data: districtStatuses } = useQuery<DistrictStatus[]>({
    queryKey: ["/api/district-status"],
  });

  const filteredStudents = studentsData?.students?.filter((student: Student) => {
    return student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           student.meritNumber.toString().includes(searchTerm) ||
           student.appNo?.includes(searchTerm) ||
           student.counselingDistrict?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           student.districtAdmin?.toLowerCase().includes(searchTerm.toLowerCase());
  }) || [];

  // Central admin filtered students (different from main filter)
  const centralFilteredStudents = studentsData?.students?.filter((student: Student) => {
    return student.name.toLowerCase().includes(centralSearchTerm.toLowerCase()) ||
           student.meritNumber.toString().includes(centralSearchTerm) ||
           student.appNo?.includes(centralSearchTerm);
  }) || [];

  const handleEditStudent = (student: Student) => {
    setSelectedStudent(student);
    setEditChoices({
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
    setIsEditDialogOpen(true);
  };

  const handleChoiceChange = (choiceKey: string, value: string) => {
    setEditChoices(prev => ({
      ...prev,
      [choiceKey]: value
    }));
  };

  // Central admin functions
  const handleCentralEditStudent = (student: Student) => {
    setCentralSelectedStudent(student);
    setCentralEditChoices({
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
    setIsCentralEditDialogOpen(true);
  };

  const handleCentralChoiceChange = (choiceKey: string, value: string) => {
    setCentralEditChoices(prev => ({
      ...prev,
      [choiceKey]: value
    }));
  };

  const handleCentralSavePreferences = () => {
    if (!centralSelectedStudent) return;
    
    updatePreferencesMutation.mutate({
      studentId: centralSelectedStudent.id,
      preferences: centralEditChoices,
      isOverride: true
    });
    setIsCentralEditDialogOpen(false);
    setCentralSelectedStudent(null);
  };

  // Update preferences mutation (works for both central and district admins)
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { studentId: string, preferences: any, isOverride?: boolean }) => {
      const endpoint = user?.role === 'central_admin' && data.isOverride 
        ? `/api/students/${data.studentId}/preferences/override`
        : `/api/students/${data.studentId}/preferences`;
      
      const payload = user?.role === 'central_admin' && data.isOverride
        ? { preferences: data.preferences, reason: "Central admin override of locked preferences" }
        : { preferences: data.preferences };
        
      const response = await apiRequest('PUT', endpoint, payload);
      return response.json();
    },
    onSuccess: () => {
      const queryKey = user?.role === 'district_admin' 
        ? ["/api/students", { district: user.district, limit: 1000, offset: 0 }]
        : ["/api/students", { limit: 1000, offset: 0 }];
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Success",
        description: "Student preferences updated successfully",
      });
      setIsEditDialogOpen(false);
      setIsOverrideConfirmOpen(false);
      setSelectedStudent(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    }
  });

  // Release student mutation
  const releaseStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const response = await apiRequest('PUT', `/api/students/${studentId}/release`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: "Success",
        description: "Student released from district successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to release student",
        variant: "destructive",
      });
    }
  });

  // Lock/unlock student mutation
  const lockStudentMutation = useMutation({
    mutationFn: async (data: { studentId: string, isLocked: boolean }) => {
      const response = await apiRequest('PUT', `/api/students/${data.studentId}/lock`, {
        isLocked: data.isLocked
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      const queryKey = user?.role === 'district_admin' 
        ? ["/api/students", { district: user.district, limit: 1000, offset: 0 }]
        : ["/api/students", { limit: 1000, offset: 0 }];
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Success",
        description: `Student ${variables.isLocked ? 'locked' : 'unlocked'} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update lock status",
        variant: "destructive",
      });
    }
  });

  // Fetch student mutation
  const fetchStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const response = await apiRequest('PUT', `/api/students/${studentId}/fetch`, {
        counselingDistrict: user?.district,
        districtAdmin: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username
      });
      return response.json();
    },
    onSuccess: () => {
      const queryKey = user?.role === 'district_admin' 
        ? ["/api/students", { district: user.district, limit: 1000, offset: 0 }]
        : ["/api/students", { limit: 1000, offset: 0 }];
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Success",
        description: "Student fetched successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch student",
        variant: "destructive",
      });
    }
  });

  const handleFetchStudent = (student: Student) => {
    fetchStudentMutation.mutate(student.id);
  };

  const handleSavePreferences = () => {
    if (!selectedStudent) return;
    
    // For central admin: Check if student is locked and needs override
    if (user?.role === 'central_admin' && selectedStudent.isLocked) {
      setIsOverrideConfirmOpen(true);
    } else {
      // Direct update if not locked or district admin
      updatePreferencesMutation.mutate({
        studentId: selectedStudent.id,
        preferences: editChoices,
        isOverride: false
      });
    }
  };

  const handleConfirmOverride = () => {
    if (!selectedStudent) return;
    
    updatePreferencesMutation.mutate({
      studentId: selectedStudent.id,
      preferences: editChoices,
      isOverride: true
    });
  };

  const handleReleaseStudent = (student: Student) => {
    releaseStudentMutation.mutate(student.id);
  };

  const handleToggleLock = (student: Student) => {
    lockStudentMutation.mutate({
      studentId: student.id,
      isLocked: !student.isLocked
    });
  };

  const getDistrictStatusBadge = (district: string) => {
    const status = districtStatuses?.find(ds => ds.district === district);
    if (!status) return null;
    
    return (
      <Badge variant={status.isFinalized ? "default" : "secondary"} className="ml-2">
        {status.isFinalized ? "Finalized" : "In Progress"}
      </Badge>
    );
  };

  const getStudentStatusBadge = (student: Student) => {
    if (!student.counselingDistrict) {
      return <Badge variant="outline">Not Assigned</Badge>;
    }
    
    if (student.isLocked) {
      return <Badge variant="destructive">🔒 Locked</Badge>;
    }
    
    return <Badge variant="default">📝 In Progress</Badge>;
  };

  if (!user || (user.role !== 'central_admin' && user.role !== 'district_admin')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header title="Student Preference Management" />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="p-8 text-center">
              <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
              <p className="text-gray-600 mt-2">Only Central Admins and District Admins can access student preference management.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header title="Student Preference Management" />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900" data-testid="page-title">
              Student Preference Management
            </h1>
            <p className="text-gray-600 mt-2">
              {user?.role === 'central_admin' 
                ? "Comprehensive view and management of all student preferences across districts"
                : `Manage student preferences for ${user?.district} district`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">
              {user?.role === 'central_admin' ? centralFilteredStudents.length : filteredStudents.length} students
            </span>
          </div>
        </div>

        {user?.role === 'central_admin' ? (
          // Central admin: Only search & update tab
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search & Update Student Preferences
                </CardTitle>
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search by name, merit number, or app number..."
                      value={centralSearchTerm}
                      onChange={(e) => setCentralSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-central-search"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>App No</TableHead>
                        <TableHead>Merit No</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Stream</TableHead>
                        <TableHead>Current District</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Current Choices</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {centralFilteredStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                            {centralSearchTerm ? "No students found matching your search" : "Enter search terms to find students"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        centralFilteredStudents.map((student: Student) => (
                          <TableRow key={student.id} data-testid={`central-student-row-${student.meritNumber}`}>
                            <TableCell className="font-medium">{student.appNo}</TableCell>
                            <TableCell className="font-medium">{student.meritNumber}</TableCell>
                            <TableCell>{student.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{student.stream}</Badge>
                            </TableCell>
                            <TableCell>
                              {student.counselingDistrict ? (
                                <div className="flex items-center">
                                  {student.counselingDistrict}
                                  {getDistrictStatusBadge(student.counselingDistrict)}
                                </div>
                              ) : (
                                <span className="text-gray-400">Not assigned</span>
                              )}
                            </TableCell>
                            <TableCell>{getStudentStatusBadge(student)}</TableCell>
                            <TableCell className="text-sm max-w-xs">
                              <div className="flex flex-wrap gap-1">
                                {[student.choice1, student.choice2, student.choice3]
                                  .map((choice, index) => choice ? (
                                    <span key={index} className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-xs">
                                      {index + 1}: {choice}
                                    </span>
                                  ) : null)
                                  .filter(Boolean)}
                                {[student.choice1, student.choice2, student.choice3].filter(Boolean).length === 0 && 
                                  <span className="text-gray-400">No choices set</span>}
                                {[student.choice1, student.choice2, student.choice3].filter(Boolean).length > 0 && 
                                  <span className="text-gray-500 text-xs">+{[student.choice4, student.choice5, student.choice6, student.choice7, student.choice8, student.choice9, student.choice10].filter(Boolean).length} more</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {!student.counselingDistrict ? (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleFetchStudent(student)}
                                    disabled={fetchStudentMutation.isPending}
                                    data-testid={`button-fetch-${student.meritNumber}`}
                                  >
                                    <Plus className="w-3 h-3 mr-1" />
                                    Fetch
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleCentralEditStudent(student)}
                                      data-testid={`button-central-edit-${student.meritNumber}`}
                                    >
                                      <Edit3 className="w-3 h-3 mr-1" />
                                      Update Preferences
                                    </Button>
                                    {!student.isLocked && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleReleaseStudent(student)}
                                        disabled={releaseStudentMutation.isPending}
                                        data-testid={`button-release-${student.meritNumber}`}
                                      >
                                        <Unlock className="w-3 h-3 mr-1" />
                                        Release
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
            </Card>
          </div>
        ) : (
          // District admin: Only existing students tab with fetch functionality
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  District Students with Preferences
                </CardTitle>
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search by name, merit number, app number, district, or admin..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>App No</TableHead>
                        <TableHead>Merit No</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Stream</TableHead>
                        <TableHead>District</TableHead>
                        <TableHead>District Admin</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Choices</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8">
                            Loading students...
                          </TableCell>
                        </TableRow>
                      ) : filteredStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                            No students found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredStudents.map((student: Student) => (
                          <TableRow key={student.id} data-testid={`student-row-${student.meritNumber}`}>
                            <TableCell className="font-medium">{student.appNo}</TableCell>
                            <TableCell className="font-medium">{student.meritNumber}</TableCell>
                            <TableCell>{student.name}</TableCell>
                            <TableCell>{student.stream}</TableCell>
                            <TableCell>
                              {student.counselingDistrict ? (
                                <div className="flex items-center">
                                  {student.counselingDistrict}
                                  {getDistrictStatusBadge(student.counselingDistrict)}
                                </div>
                              ) : (
                                <span className="text-gray-400">Not assigned</span>
                              )}
                            </TableCell>
                            <TableCell>{student.districtAdmin || <span className="text-gray-400">None</span>}</TableCell>
                            <TableCell>{getStudentStatusBadge(student)}</TableCell>
                            <TableCell className="text-sm max-w-xs">
                              <div className="flex flex-wrap gap-1">
                                {[student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
                                  student.choice6, student.choice7, student.choice8, student.choice9, student.choice10]
                                  .map((choice, index) => choice ? (
                                    <span key={index} className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-xs">
                                      {index + 1}: {choice}
                                    </span>
                                  ) : null)
                                  .filter(Boolean)}
                                {[student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
                                  student.choice6, student.choice7, student.choice8, student.choice9, student.choice10]
                                  .filter(Boolean).length === 0 && <span className="text-gray-400">No choices set</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {!student.counselingDistrict || student.counselingDistrict !== user?.district ? (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleFetchStudent(student)}
                                    disabled={fetchStudentMutation.isPending}
                                    data-testid={`button-fetch-${student.meritNumber}`}
                                  >
                                    <Plus className="w-3 h-3 mr-1" />
                                    Fetch
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditStudent(student)}
                                      data-testid={`button-edit-${student.meritNumber}`}
                                    >
                                      <Edit3 className="w-3 h-3 mr-1" />
                                      Edit
                                    </Button>
                                    
                                    {/* Lock/Unlock button: District admin can lock/unlock students in their district */}
                                    {student.counselingDistrict === user.district && (
                                      <Button
                                        variant={student.isLocked ? "destructive" : "outline"}
                                        size="sm"
                                        onClick={() => handleToggleLock(student)}
                                        disabled={lockStudentMutation.isPending}
                                        data-testid={`button-lock-${student.meritNumber}`}
                                        title={student.isLocked ? "Unlock student preferences" : "Lock student preferences"}
                                      >
                                        {student.isLocked ? <Unlock className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                                        {student.isLocked ? "Unlock" : "Lock"}
                                      </Button>
                                    )}
                                    
                                    {/* Release button: Only for unlocked students */}
                                    {!student.isLocked && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleReleaseStudent(student)}
                                        disabled={releaseStudentMutation.isPending}
                                        data-testid={`button-release-${student.meritNumber}`}
                                      >
                                        <Unlock className="w-3 h-3 mr-1" />
                                        Release
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
            </Card>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Edit Student Preferences - {selectedStudent?.name} (Merit: {selectedStudent?.meritNumber})
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {selectedStudent && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">App No:</span>
                      <div className="text-gray-900">{selectedStudent.appNo}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Merit No:</span>
                      <div className="text-gray-900">{selectedStudent.meritNumber}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Stream:</span>
                      <div className="text-gray-900">{selectedStudent.stream}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Current District:</span>
                      <div className="text-gray-900">{selectedStudent.counselingDistrict}</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-lg font-medium mb-4">District Preferences (Priority Order)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((choiceNum) => {
                    const choiceKey = `choice${choiceNum}`;
                    return (
                      <div key={choiceNum} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 w-16">
                          Choice {choiceNum}:
                        </span>
                        <Select
                          value={editChoices[choiceKey] || ""}
                          onValueChange={(value) => handleChoiceChange(choiceKey, value === "__none__" ? "" : value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select district" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Clear Choice</SelectItem>
                            {districts.map((district) => (
                              <SelectItem key={district} value={district}>
                                {district}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                {selectedStudent?.isLocked && user?.role === 'central_admin' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-800">Warning: Student is Locked</h4>
                        <p className="text-sm text-amber-700 mt-1">
                          This student's preferences have been locked by the district admin. 
                          Saving changes will override the lock and notify the district admin.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {selectedStudent?.isLocked && user?.role === 'district_admin' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Lock className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-800">Student Preferences are Locked</h4>
                        <p className="text-sm text-blue-700 mt-1">
                          You have locked this student's preferences. You can still modify them if needed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                data-testid="button-cancel-edit"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSavePreferences}
                disabled={updatePreferencesMutation.isPending}
                data-testid="button-save-preferences"
              >
                <Save className="w-4 h-4 mr-2" />
                {updatePreferencesMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Central Admin Edit Dialog */}
        <Dialog open={isCentralEditDialogOpen} onOpenChange={setIsCentralEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit3 className="w-5 h-5" />
                Update Student Preferences - {centralSelectedStudent?.name}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {centralSelectedStudent && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">App No:</span>
                      <div className="text-gray-900">{centralSelectedStudent.appNo}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Merit No:</span>
                      <div className="text-gray-900">{centralSelectedStudent.meritNumber}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Stream:</span>
                      <div className="text-gray-900">{centralSelectedStudent.stream}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Current District:</span>
                      <div className="text-gray-900">{centralSelectedStudent.counselingDistrict || 'Not assigned'}</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-lg font-medium mb-4">District Preferences (Priority Order)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((choiceNum) => {
                    const choiceKey = `choice${choiceNum}`;
                    return (
                      <div key={choiceNum} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 w-16">
                          Choice {choiceNum}:
                        </span>
                        <Select
                          value={centralEditChoices[choiceKey] || ""}
                          onValueChange={(value) => handleCentralChoiceChange(choiceKey, value === "__none__" ? "" : value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select district" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Clear Choice</SelectItem>
                            {districts.map((district) => (
                              <SelectItem key={district} value={district}>
                                {district}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                {centralSelectedStudent?.isLocked && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-800">Note: Student is Locked</h4>
                        <p className="text-sm text-amber-700 mt-1">
                          This student's preferences have been locked by the district admin. 
                          Your changes will override the lock as central admin.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCentralEditDialogOpen(false)}
                data-testid="button-cancel-central-edit"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleCentralSavePreferences}
                disabled={updatePreferencesMutation.isPending}
                data-testid="button-save-central-preferences"
              >
                <Save className="w-4 h-4 mr-2" />
                {updatePreferencesMutation.isPending ? "Saving..." : "Update Preferences"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Override Confirmation Dialog */}
        <AlertDialog open={isOverrideConfirmOpen} onOpenChange={setIsOverrideConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Override Locked Preferences?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This student's preferences are currently locked by the district admin. 
                Are you sure you want to override these settings? The district admin will be notified of this change.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-override">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmOverride}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-override"
              >
                Yes, Override
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}