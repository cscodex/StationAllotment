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
  CheckCircle
} from "lucide-react";
import type { Student } from "@shared/schema";
import { DISTRICTS as PUNJAB_DISTRICTS } from "@shared/schema";

// Use DISTRICTS from shared schema
const DISTRICTS = PUNJAB_DISTRICTS;

const STREAMS = ['Medical', 'Commerce', 'NonMedical'];

const updatePreferencesSchema = z.object({
  stream: z.enum(['Medical', 'Commerce', 'NonMedical']),
  choice1: z.string().optional(),
  choice2: z.string().optional(),
  choice3: z.string().optional(),
  choice4: z.string().optional(),
  choice5: z.string().optional(),
  choice6: z.string().optional(),
  choice7: z.string().optional(),
  choice8: z.string().optional(),
  choice9: z.string().optional(),
  choice10: z.string().optional(),
});

export default function DistrictAdmin() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["/api/students", { limit: 200, offset: 0, district: user?.district }],
  });

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const deadline = (settings as any)?.find((s: any) => s.key === 'allocation_deadline')?.value;
  const deadlineDate = deadline ? new Date(deadline) : null;
  const isDeadlinePassed = deadlineDate ? new Date() > deadlineDate : false;

  const form = useForm<z.infer<typeof updatePreferencesSchema>>({
    resolver: zodResolver(updatePreferencesSchema),
    defaultValues: {
      stream: 'Medical',
      choice1: '',
      choice2: '',
      choice3: '',
      choice4: '',
      choice5: '',
      choice6: '',
      choice7: '',
      choice8: '',
      choice9: '',
      choice10: '',
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async ({ studentId, preferences }: { studentId: string, preferences: any }) => {
      await apiRequest("PUT", `/api/students/${studentId}/preferences`, preferences);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setEditingStudent(null);
      form.reset();
      toast({
        title: "Preferences Updated",
        description: "Student preferences have been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
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

  const filteredStudents = (studentsData as any)?.students?.filter((student: Student) => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.meritNumber.toString().includes(searchTerm) ||
    student.appNo?.includes(searchTerm)
  ) || [];

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

    lockStudentMutation.mutate({
      studentId: student.id,
      isLocked: !student.isLocked,
    });
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
                      You can modify student preferences until the deadline
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {isDeadlinePassed ? (
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

          {/* Student Search and Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Search className="w-5 h-5 mr-2 text-primary" />
                Student Preference Management
              </CardTitle>
              <div className="flex items-center space-x-2">
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
                          <TableHead>App No.</TableHead>
                          <TableHead>Merit No.</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Stream</TableHead>
                          <TableHead>Locked</TableHead>
                          <TableHead>Choices (1-10)</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.map((student: Student) => (
                          <TableRow key={student.id} data-testid={`student-row-${student.meritNumber}`}>
                            <TableCell className="font-medium">{student.appNo}</TableCell>
                            <TableCell className="font-medium">{student.meritNumber}</TableCell>
                            <TableCell>{student.name}</TableCell>
                            <TableCell>{student.stream}</TableCell>
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
                                  onClick={() => startEditing(student)}
                                  disabled={isDeadlinePassed || editingStudent === student.id || student.isLocked === true}
                                  data-testid={`button-edit-${student.meritNumber}`}
                                >
                                  <Edit className="w-3 h-3 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  variant={student.isLocked === true ? "destructive" : "secondary"}
                                  size="sm"
                                  onClick={() => handleLockToggle(student)}
                                  disabled={isDeadlinePassed}
                                  data-testid={`button-lock-${student.meritNumber}`}
                                >
                                  {student.isLocked === true ? "🔓" : "🔒"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReleaseStudent(student)}
                                  disabled={isDeadlinePassed}
                                  data-testid={`button-release-${student.meritNumber}`}
                                >
                                  Release
                                </Button>
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

          {/* Edit Preferences Form */}
          {editingStudent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Edit Student Preferences</span>
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((choiceNum) => (
                        <FormField
                          key={choiceNum}
                          control={form.control}
                          name={`choice${choiceNum}` as any}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Choice {choiceNum}</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid={`select-choice${choiceNum}`}>
                                    <SelectValue placeholder="Select district" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="">None</SelectItem>
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

                    <div className="flex space-x-2">
                      <Button 
                        type="submit" 
                        disabled={updatePreferencesMutation.isPending}
                        data-testid="button-save-preferences"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {updatePreferencesMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                      <Button type="button" variant="outline" onClick={cancelEditing}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
