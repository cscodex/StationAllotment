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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import type { Student } from "@shared/schema";
import { SCHOOL_DISTRICTS, COUNSELING_DISTRICTS } from "@shared/schema";

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

export default function StudentPreferenceManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isChoicesModalOpen, setIsChoicesModalOpen] = useState(false);
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<Student | null>(null);
  const [selectedStudentForChoices, setSelectedStudentForChoices] = useState<Student | null>(null);
  
  const { user } = useAuth();
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

  // Lock student for editing mutation
  const lockForEditMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const response = await apiRequest('POST', `/api/students/${studentId}/lock`);
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
      const response = await apiRequest('POST', `/api/students/${studentId}/unlock`);
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

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["/api/students", { limit: 200, offset: 0 }],
  });

  const filteredStudents = (studentsData as any)?.students?.filter((student: Student) => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.meritNumber.toString().includes(searchTerm) ||
    student.appNo?.includes(searchTerm) ||
    student.counselingDistrict?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.districtAdmin?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];


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

  const openEditModal = (student: Student) => {
    // Directly open edit modal without locking
    setSelectedStudentForEdit(student);
    form.reset({
      stream: student.stream as any || "NonMedical",
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


  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Student Preference Management" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Student Preference Management" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Header with Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <UserCog className="w-5 h-5 mr-2 text-primary" />
                  Student Preferences - Central Admin View
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search by name, merit number, app number, district, or admin..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-students"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Students Table */}
          <Card>
            <CardHeader>
              <CardTitle>Students ({filteredStudents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merit #</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>App No</TableHead>
                      <TableHead>Stream</TableHead>
                      <TableHead>Current District</TableHead>
                      <TableHead>District Admin</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lock Status</TableHead>
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
                    ) : filteredStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No students found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStudents.map((student: Student) => (
                        <TableRow key={student.id}>
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
                            {student.counselingDistrict || (
                              <span className="text-muted-foreground">Not Assigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {student.districtAdmin || (
                              <span className="text-muted-foreground">Not Assigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(student.allocationStatus || 'pending')}
                          </TableCell>
                          <TableCell>
                            {student.isLocked ? (
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
                              {/* Show lock status indicator */}
                              {student.lockedBy && (
                                <Badge variant="secondary" className="text-xs">
                                  <Lock className="w-3 h-3 mr-1" />
                                  Locked
                                </Badge>
                              )}

                              {/* Case 1: Student is locked - show only unlock button */}
                              {user?.role === 'central_admin' && student.lockedBy && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => unlockEditMutation.mutate(student.id)}
                                  disabled={unlockEditMutation.isPending}
                                  data-testid={`button-unlock-${student.id}`}
                                >
                                  <Unlock className="w-4 h-4 mr-1" />
                                  Unlock
                                </Button>
                              )}

                              {/* Case 2: Central admin filled all preferences and student not locked - show lock + release buttons */}
                              {user?.role === 'central_admin' && 
                               student.counselingDistrict === 'Mohali' && 
                               student.districtAdmin === 'central_admin' && 
                               areAllPreferencesFilled(student) && 
                               !student.lockedBy && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => lockForEditMutation.mutate(student.id)}
                                    disabled={lockForEditMutation.isPending}
                                    data-testid={`button-lock-${student.id}`}
                                  >
                                    <Lock className="w-4 h-4 mr-1" />
                                    Lock
                                  </Button>
                                  
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (window.confirm('Are you sure you want to release this assignment? This will clear the district and district admin assignment.')) {
                                        releaseAssignmentMutation.mutate(student.id);
                                      }
                                    }}
                                    disabled={releaseAssignmentMutation.isPending}
                                    data-testid={`button-release-${student.id}`}
                                    className="text-red-600 border-red-300 hover:bg-red-50"
                                  >
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Release
                                  </Button>
                                </>
                              )}

                              {/* Case 3: Regular edit button for all other cases */}
                              {!(user?.role === 'central_admin' && student.lockedBy) && 
                               !(user?.role === 'central_admin' && 
                                 student.counselingDistrict === 'Mohali' && 
                                 student.districtAdmin === 'central_admin' && 
                                 areAllPreferencesFilled(student) && 
                                 !student.lockedBy) && (
                                canEditStudent(student) && !student.lockedBy ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditModal(student)}
                                    data-testid={`button-edit-${student.id}`}
                                  >
                                    <Edit className="w-4 h-4 mr-1" />
                                    Edit
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled
                                    data-testid={`button-edit-disabled-${student.id}`}
                                    className="text-muted-foreground"
                                  >
                                    <Edit className="w-4 h-4 mr-1" />
                                    Edit
                                  </Button>
                                )
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
      </main>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Student Preferences</DialogTitle>
          </DialogHeader>
          
          {selectedStudentForEdit && (
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
                    disabled={updatePreferencesMutation.isPending}
                    data-testid="button-save-preferences"
                  >
                    {updatePreferencesMutation.isPending ? "Saving..." : "Save Preferences"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
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
                  <div><strong>Current District:</strong> {selectedStudentForChoices.counselingDistrict || "Not assigned"}</div>
                  <div><strong>District Admin:</strong> {selectedStudentForChoices.districtAdmin || "Not assigned"}</div>
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
    </div>
  );
}