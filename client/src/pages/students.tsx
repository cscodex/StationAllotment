import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataPagination } from "@/components/ui/data-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Users, Eye, FileText, UserCheck, Edit3, Save, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Student, StudentsEntranceResult } from "@shared/schema";

export default function Students() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [selectedStudent, setSelectedStudent] = useState<StudentsEntranceResult | Student | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingEntranceResult, setEditingEntranceResult] = useState<string | null>(null);
  const [editingStream, setEditingStream] = useState<string>("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isDistrictAdmin = user?.role === 'district_admin';
  const isCentralAdmin = user?.role === 'central_admin';

  // Fetch entrance results for central admin first tab or district admin
  const { data: entranceResultsData, isLoading: isLoadingEntrance } = useQuery<{students: StudentsEntranceResult[], total: number}>({
    queryKey: ["/api/students-entrance-results", { limit, offset: page * limit }],
    enabled: isDistrictAdmin || isCentralAdmin,
  });

  // Fetch student records for central admin second tab
  const { data: studentsData, isLoading: isLoadingStudents } = useQuery<{students: Student[], total: number}>({
    queryKey: ["/api/students", { limit, offset: page * limit }],
    enabled: isCentralAdmin,
  });

  const filteredEntranceResults = entranceResultsData?.students?.filter((entranceResult: StudentsEntranceResult) => {
    return entranceResult.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           entranceResult.meritNo.toString().includes(searchTerm) ||
           entranceResult.applicationNo?.includes(searchTerm) ||
           entranceResult.rollNo?.includes(searchTerm);
  }) || [];

  const filteredStudents = studentsData?.students?.filter((student: Student) => {
    return student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           student.meritNumber.toString().includes(searchTerm) ||
           student.appNo?.includes(searchTerm);
  }) || [];

  const handleViewStudent = (student: StudentsEntranceResult | Student) => {
    setSelectedStudent(student);
    setIsViewDialogOpen(true);
  };

  // Update entrance result mutation
  const updateEntranceResultMutation = useMutation({
    mutationFn: async ({ id, stream }: { id: string, stream: string }) => {
      const response = await apiRequest('PUT', `/api/students-entrance-results/${id}`, { stream });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students-entrance-results"] });
      toast({
        title: "Success",
        description: "Stream updated successfully",
      });
      setEditingEntranceResult(null);
      setEditingStream("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update stream",
        variant: "destructive",
      });
    },
  });

  const handleEditStream = (entranceResult: StudentsEntranceResult) => {
    setEditingEntranceResult(entranceResult.id);
    setEditingStream(entranceResult.stream || "");
  };

  const handleSaveStream = () => {
    if (editingEntranceResult) {
      updateEntranceResultMutation.mutate({ id: editingEntranceResult, stream: editingStream });
    }
  };

  const handleCancelEdit = () => {
    setEditingEntranceResult(null);
    setEditingStream("");
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

  const EntranceResultsTable = ({ results, isLoading }: { results: StudentsEntranceResult[], isLoading: boolean }) => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, merit number, application number, or roll number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-entrance-results"
          />
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merit No.</TableHead>
                <TableHead>App No.</TableHead>
                <TableHead>Roll No.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Marks</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stream</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((entranceResult: StudentsEntranceResult) => (
                <TableRow key={entranceResult.id} data-testid={`entrance-result-row-${entranceResult.meritNo}`}>
                  <TableCell className="font-medium">{entranceResult.meritNo}</TableCell>
                  <TableCell className="font-mono text-sm">{entranceResult.applicationNo}</TableCell>
                  <TableCell className="font-mono text-sm">{entranceResult.rollNo}</TableCell>
                  <TableCell>{entranceResult.studentName}</TableCell>
                  <TableCell className="font-medium">{entranceResult.marks}</TableCell>
                  <TableCell>
                    <Badge variant={entranceResult.gender === 'Male' ? 'default' : entranceResult.gender === 'Female' ? 'secondary' : 'outline'}>
                      {entranceResult.gender}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={entranceResult.category === 'Open' ? 'default' : 'secondary'}>
                      {entranceResult.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editingEntranceResult === entranceResult.id ? (
                      <Select value={editingStream} onValueChange={setEditingStream}>
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Select stream" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          <SelectItem value="Medical">Medical</SelectItem>
                          <SelectItem value="Commerce">Commerce</SelectItem>
                          <SelectItem value="NonMedical">NonMedical</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        {entranceResult.stream ? (
                          <Badge variant={entranceResult.stream === 'Medical' ? 'default' : entranceResult.stream === 'Commerce' ? 'secondary' : 'outline'}>
                            {entranceResult.stream}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not Set</Badge>
                        )}
                        {isCentralAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditStream(entranceResult)}
                            data-testid={`button-edit-stream-${entranceResult.meritNo}`}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {editingEntranceResult === entranceResult.id ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSaveStream}
                            disabled={updateEntranceResultMutation.isPending}
                            data-testid={`button-save-stream-${entranceResult.meritNo}`}
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            disabled={updateEntranceResultMutation.isPending}
                            data-testid={`button-cancel-edit-${entranceResult.meritNo}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleViewStudent(entranceResult)}
                          data-testid={`button-view-${entranceResult.meritNo}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {results.length === 0 && !isLoading && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No entrance results found matching your search.</p>
        </div>
      )}
    </div>
  );

  const StudentRecordsTable = ({ students, isLoading }: { students: Student[], isLoading: boolean }) => (
    <div className="space-y-4">
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
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App No.</TableHead>
                <TableHead>Merit No.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stream</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Allotted District</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student: Student) => (
                <TableRow key={student.id} data-testid={`student-row-${student.meritNumber}`}>
                  <TableCell className="font-mono text-sm">{student.appNo}</TableCell>
                  <TableCell className="font-medium">{student.meritNumber}</TableCell>
                  <TableCell>{student.name}</TableCell>
                  <TableCell>
                    <Badge variant={student.gender === 'Male' ? 'default' : student.gender === 'Female' ? 'secondary' : 'outline'}>
                      {student.gender}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={student.category === 'Open' ? 'default' : 'secondary'}>
                      {student.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={student.stream === 'Medical' ? 'default' : student.stream === 'Commerce' ? 'secondary' : 'outline'}>
                      {student.stream}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(student.allocationStatus || 'pending')}</TableCell>
                  <TableCell>
                    {student.allottedDistrict ? (
                      <Badge className="bg-green-100 text-green-800">{student.allottedDistrict}</Badge>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleViewStudent(student)}
                      data-testid={`button-view-${student.meritNumber}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {students.length === 0 && !isLoading && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No student records found matching your search.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Students" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Students" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        {isDistrictAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" />
                Entrance Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EntranceResultsTable results={filteredEntranceResults} isLoading={isLoadingEntrance} />
              <div className="mt-4">
                <DataPagination
                  currentPage={page}
                  totalItems={entranceResultsData?.total || 0}
                  itemsPerPage={limit}
                  onPageChange={(newPage) => {
                    setPage(newPage);
                    setSearchTerm("");
                  }}
                  onItemsPerPageChange={(newLimit) => {
                    setLimit(newLimit);
                    setPage(0);
                    setSearchTerm("");
                  }}
                  showItemsPerPageSelector={true}
                  itemsPerPageOptions={[25, 50, 100, 200]}
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="w-5 h-5 mr-2 text-primary" />
                Student Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="entrance-results" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="entrance-results" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Entrance Results
                  </TabsTrigger>
                  <TabsTrigger value="student-records" className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4" />
                    Student Records
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="entrance-results" className="mt-6">
                  <EntranceResultsTable results={filteredEntranceResults} isLoading={isLoadingEntrance} />
                  <div className="mt-4">
                    <DataPagination
                      currentPage={page}
                      totalItems={entranceResultsData?.total || 0}
                      itemsPerPage={limit}
                      onPageChange={(newPage) => {
                        setPage(newPage);
                        setSearchTerm("");
                      }}
                      onItemsPerPageChange={(newLimit) => {
                        setLimit(newLimit);
                        setPage(0);
                        setSearchTerm("");
                      }}
                      showItemsPerPageSelector={true}
                      itemsPerPageOptions={[25, 50, 100, 200]}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="student-records" className="mt-6">
                  <StudentRecordsTable students={filteredStudents} isLoading={isLoadingStudents} />
                  <div className="mt-4">
                    <DataPagination
                      currentPage={page}
                      totalItems={studentsData?.total || 0}
                      itemsPerPage={limit}
                      onPageChange={(newPage) => {
                        setPage(newPage);
                        setSearchTerm("");
                      }}
                      onItemsPerPageChange={(newLimit) => {
                        setLimit(newLimit);
                        setPage(0);
                        setSearchTerm("");
                      }}
                      showItemsPerPageSelector={true}
                      itemsPerPageOptions={[25, 50, 100, 200]}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
        
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {'studentName' in (selectedStudent || {}) 
                  ? `Entrance Result - ${(selectedStudent as StudentsEntranceResult).studentName}`
                  : `Student Record - ${(selectedStudent as Student)?.name}`
                }
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              {selectedStudent && 'studentName' in selectedStudent ? (
                // Entrance Result Details
                <>
                  <div>
                    <label className="font-medium">Merit Number</label>
                    <p>{(selectedStudent as StudentsEntranceResult).meritNo}</p>
                  </div>
                  <div>
                    <label className="font-medium">Application Number</label>
                    <p>{(selectedStudent as StudentsEntranceResult).applicationNo}</p>
                  </div>
                  <div>
                    <label className="font-medium">Roll Number</label>
                    <p>{(selectedStudent as StudentsEntranceResult).rollNo}</p>
                  </div>
                  <div>
                    <label className="font-medium">Student Name</label>
                    <p>{(selectedStudent as StudentsEntranceResult).studentName}</p>
                  </div>
                  <div>
                    <label className="font-medium">Marks</label>
                    <p>{(selectedStudent as StudentsEntranceResult).marks}</p>
                  </div>
                  <div>
                    <label className="font-medium">Gender</label>
                    <p>{(selectedStudent as StudentsEntranceResult).gender}</p>
                  </div>
                  <div>
                    <label className="font-medium">Category</label>
                    <p>{(selectedStudent as StudentsEntranceResult).category}</p>
                  </div>
                  <div>
                    <label className="font-medium">Stream</label>
                    <p>{(selectedStudent as StudentsEntranceResult).stream}</p>
                  </div>
                </>
              ) : (
                // Student Record Details
                <>
                  <div>
                    <label className="font-medium">Application Number</label>
                    <p>{(selectedStudent as Student)?.appNo}</p>
                  </div>
                  <div>
                    <label className="font-medium">Merit Number</label>
                    <p>{(selectedStudent as Student)?.meritNumber}</p>
                  </div>
                  <div>
                    <label className="font-medium">Name</label>
                    <p>{(selectedStudent as Student)?.name}</p>
                  </div>
                  <div>
                    <label className="font-medium">Gender</label>
                    <p>{(selectedStudent as Student)?.gender}</p>
                  </div>
                  <div>
                    <label className="font-medium">Category</label>
                    <p>{(selectedStudent as Student)?.category}</p>
                  </div>
                  <div>
                    <label className="font-medium">Stream</label>
                    <p>{(selectedStudent as Student)?.stream}</p>
                  </div>
                  <div>
                    <label className="font-medium">Allocation Status</label>
                    <p>{(selectedStudent as Student)?.allocationStatus || 'pending'}</p>
                  </div>
                  <div>
                    <label className="font-medium">Allotted District</label>
                    <p>{(selectedStudent as Student)?.allottedDistrict || 'Not Allotted'}</p>
                  </div>
                  {(selectedStudent as Student)?.choice1 && (
                    <div className="col-span-2">
                      <label className="font-medium">District Choices</label>
                      <div className="grid grid-cols-5 gap-2 mt-2">
                        {[1,2,3,4,5,6,7,8,9,10].map(i => {
                          const choice = (selectedStudent as Student)[`choice${i}` as keyof Student] as string;
                          return choice ? (
                            <div key={i} className="text-sm">
                              <span className="font-medium">Choice {i}:</span> {choice}
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
