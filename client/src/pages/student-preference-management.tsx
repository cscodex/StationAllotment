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
import { Search, Users, Edit3, Save, X, AlertTriangle, Lock, Unlock } from "lucide-react";
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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Available school districts for dropdown (only these 10 districts have schools)
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
        <Header />
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
      <Header />
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
              {filteredStudents.length} students
            </span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Students with Preferences</CardTitle>
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
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditStudent(student)}
                              data-testid={`button-edit-${student.meritNumber}`}
                            >
                              <Edit3 className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            {student.counselingDistrict && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleReleaseStudent(student)}
                                data-testid={`button-release-${student.meritNumber}`}
                              >
                                Release
                              </Button>
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

        {/* Edit Preferences Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Edit Preferences - {selectedStudent?.name} (Merit: {selectedStudent?.meritNumber})
                {selectedStudent?.isLocked && (
                  <Badge variant="destructive" className="ml-2">
                    <Lock className="w-3 h-3 mr-1" />
                    Locked by District Admin
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 10 }, (_, i) => {
                  const choiceKey = `choice${i + 1}` as keyof typeof editChoices;
                  return (
                    <div key={choiceKey} className="space-y-2">
                      <label className="text-sm font-medium">Choice {i + 1}</label>
                      <Select
                        value={editChoices[choiceKey] || ""}
                        onValueChange={(value) => handleChoiceChange(choiceKey, value)}
                      >
                        <SelectTrigger data-testid={`select-${choiceKey}`}>
                          <SelectValue placeholder="Select district" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">No selection</SelectItem>
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

              {selectedStudent?.isLocked && (
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