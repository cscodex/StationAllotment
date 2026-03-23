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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AcademicYearSelector } from "@/components/ui/academic-year-selector";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Users, Eye, FileText, UserCheck, Edit3, Save, X, Clock, DownloadCloud, BarChart3, ShieldQuestion } from "lucide-react";
import InfographicsModal from "@/components/dashboard/infographics-modal";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import type { Student, StudentsEntranceResult } from "@shared/schema";

export default function Students() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [academicYear, setAcademicYear] = useState<string>("");
  const [roundNumber, setRoundNumber] = useState<number | undefined>(undefined);
  const [allocationFilter, setAllocationFilter] = useState<string>("all");
  const [selectedStudent, setSelectedStudent] = useState<StudentsEntranceResult | Student | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingEntranceResult, setEditingEntranceResult] = useState<string | null>(null);
  const [editingStream, setEditingStream] = useState<string>("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isInfographicsOpen, setIsInfographicsOpen] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isDistrictAdmin = user?.role === 'district_admin';
  const isCentralAdmin = user?.role === 'central_admin';

  // Fetch entrance results for central admin first tab or district admin
  const { data: entranceResultsData, isLoading: isLoadingEntrance } = useQuery<{ students: StudentsEntranceResult[], total: number }>({
    queryKey: ["/api/students-entrance-results", { limit, offset: page * limit }],
    enabled: isDistrictAdmin || isCentralAdmin,
  });

  // Fetch student records for central admin second tab (with year/round filtering)
  const { data: studentsData, isLoading: isLoadingStudents } = useQuery<{ students: Student[], total: number }>({
    queryKey: ["/api/students", { limit, offset: page * limit, academicYear, roundNumber, allocationStatus: allocationFilter === 'all' ? undefined : allocationFilter }],
    enabled: isCentralAdmin,
  });

  // Fetch current session (academic year) to pass to stats
  const { data: currentSessionData } = useQuery<{ currentSession: string }>({
    queryKey: ["/api/session/current"],
  });
  const selectedAcademicYear = currentSessionData?.currentSession || "";

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/dashboard/stats", { academicYear: selectedAcademicYear }],
    queryFn: async () => {
      const qs = selectedAcademicYear ? `?academicYear=${encodeURIComponent(selectedAcademicYear)}` : '';
      const res = await apiRequest("GET", `/api/dashboard/stats${qs}`);
      return res.json();
    },
    enabled: !!selectedAcademicYear,
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

  const handleDownloadOMR = async (student: Student) => {
    try {
      const response = await fetch(`/api/students/${student.id}/omr-form`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        }
      });
      if (!response.ok) throw new Error("Failed to generate OMR form");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${student.appNo}_OMR_Form.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "OMR form generated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not download OMR form",
        variant: "destructive",
      });
    }
  };

  const handleBulkDownloadOMR = async () => {
    if (selectedStudentIds.length === 0) return;
    try {
      const response = await fetch(`/api/students/bulk-omr-form`, {
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
      const a = document.createElement('a');
      a.href = url;
      a.download = `bulk_omr_forms_${new Date().getTime()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

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
    }
  };

  const handleTestScenariosDownload = async () => {
    if (selectedStudentIds.length === 0) return;
    try {
      const response = await fetch(`/api/omr/test-scenarios`, {
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
      const a = document.createElement('a');
      a.href = url;
      a.download = `mock_scenarios_${selectedStudentIds.length}_students.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: `Successfully generated fully bubbled mock OMR forms for ${selectedStudentIds.length} students`,
      });
      setSelectedStudentIds([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not generate testing scenarios",
        variant: "destructive",
      });
    }
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
                          <SelectItem value="none">None</SelectItem>
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

  const StudentRecordsTable = ({ students, isLoading }: { students: Student[], isLoading: boolean }) => {
    const isAllSelected = students.length > 0 && selectedStudentIds.length === students.length;
    const isSomeSelected = selectedStudentIds.length > 0 && selectedStudentIds.length < students.length;

    const handleSelectAll = (checked: boolean) => {
      if (checked) {
        setSelectedStudentIds(students.map(s => s.id));
      } else {
        setSelectedStudentIds([]);
      }
    };

    const handleSelectStudent = (studentId: string, checked: boolean) => {
      setSelectedStudentIds(prev =>
        checked ? [...prev, studentId] : prev.filter(id => id !== studentId)
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2 justify-between">
          <div className="relative flex-1 max-w-md flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, merit number, or application number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-students"
              />
            </div>
            {isCentralAdmin && (
              <Select value={allocationFilter} onValueChange={(val) => { setAllocationFilter(val); setPage(0); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Students" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students</SelectItem>
                  <SelectItem value="allotted">Allotted Only</SelectItem>
                  <SelectItem value="not_allotted">Not Allotted Only</SelectItem>
                  <SelectItem value="pending">Pending Only</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isCentralAdmin && (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-primary hover:bg-primary/10 flex-shrink-0"
                      onClick={() => setIsInfographicsOpen(true)}
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View Infographics</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {selectedStudentIds.length > 0 && (
            <div className="flex gap-2 bg-muted/50 p-1 rounded-md border">
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10" onClick={handleTestScenariosDownload}>
                      <ShieldQuestion className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Generate Testing Subset ({selectedStudentIds.length})</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10" onClick={handleBulkDownloadOMR}>
                      <DownloadCloud className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download Blank OMRs ({selectedStudentIds.length})</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* MOBILE CARD VIEW (<md) */}
            <div className="md:hidden space-y-4">
              {students.map((student: Student) => (
                <div key={student.id} className="bg-white p-4 rounded-lg border shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedStudentIds.includes(student.id)}
                        onCheckedChange={(checked) => handleSelectStudent(student.id, checked as boolean)}
                        aria-label={`Select student ${student.name}`}
                      />
                      <div>
                        <div className="font-bold text-base text-slate-800">{student.name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">App No: {student.appNo} | Merit: {student.meritNumber}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm pt-2">
                    <div>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1.5">Demographics</span>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant={student.gender === 'Male' ? 'default' : student.gender === 'Female' ? 'secondary' : 'outline'}>{student.gender}</Badge>
                        <Badge variant={student.category === 'Open' ? 'default' : 'secondary'}>{student.category}</Badge>
                        {student.stream && (
                          <Badge variant={student.stream === 'Medical' ? 'default' : student.stream === 'Commerce' ? 'secondary' : 'outline'}>{student.stream}</Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1.5">Allocation</span>
                      <div className="flex flex-col gap-1.5">
                        {getStatusBadge(student.allocationStatus || 'pending')}
                        {student.allottedDistrict ? (
                          <Badge className="bg-green-100 text-green-800 self-start">{student.allottedDistrict}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t mt-2">
                    <Button variant="outline" size="sm" onClick={() => handleViewStudent(student)} className="flex-1">
                      <Eye className="w-4 h-4 mr-2" /> View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadOMR(student)} className="flex-1">
                      <FileText className="w-4 h-4 mr-2 text-blue-600" /> OMR
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP TABLE VIEW (>=md) */}
            <div className="hidden md:block rounded-md border overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={isAllSelected || (isSomeSelected ? "indeterminate" : false)}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>App No.</TableHead>
                  <TableHead>Merit No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stream</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Locked Status</TableHead>
                  <TableHead>Allotted District</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student: Student) => (
                  <TableRow key={student.id} data-testid={`student-row-${student.meritNumber}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedStudentIds.includes(student.id)}
                        onCheckedChange={(checked) => handleSelectStudent(student.id, checked as boolean)}
                        aria-label={`Select student ${student.name}`}
                      />
                    </TableCell>
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
                      {student.isLocked ? (
                        <div className="flex items-center space-x-1">
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">
                            <Clock className="w-3 h-3 mr-1" />
                            Locked
                          </Badge>
                          {student.lockedAt && (
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(student.lockedAt), { addSuffix: true })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Unlocked</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {student.allottedDistrict ? (
                        <Badge className="bg-green-100 text-green-800">{student.allottedDistrict}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewStudent(student)}
                          data-testid={`button-view-${student.meritNumber}`}
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadOMR(student)}
                          data-testid={`button-download-omr-${student.meritNumber}`}
                          title="Download OMR Sheet"
                        >
                          <FileText className="w-4 h-4 text-blue-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </>
        )}
        {students.length === 0 && !isLoading && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No student records found matching your search.</p>
          </div>
        )}
      </div>
    );
  };

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

        <InfographicsModal 
          isOpen={isInfographicsOpen}
          onClose={setIsInfographicsOpen}
          stats={stats}
          title="Central Student Statistics"
        />

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
                  <div>
                    <label className="font-medium">Locked Status</label>
                    <div className="flex items-center space-x-2 mt-1">
                      {(selectedStudent as Student)?.isLocked ? (
                        <>
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">
                            <Clock className="w-3 h-3 mr-1" />
                            Locked
                          </Badge>
                          {(selectedStudent as Student)?.lockedAt && (
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date((selectedStudent as Student).lockedAt!), { addSuffix: true })}
                            </span>
                          )}
                        </>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Unlocked</Badge>
                      )}
                    </div>
                  </div>
                  {(selectedStudent as Student)?.choice1 && (
                    <div className="col-span-2">
                      <label className="font-medium">District Choices</label>
                      <div className="grid grid-cols-5 gap-2 mt-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => {
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
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}
