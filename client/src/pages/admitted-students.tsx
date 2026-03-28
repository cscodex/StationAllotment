import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCounseling } from "@/hooks/useCounseling";
import { Student } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserMinus, Search } from "lucide-react";

export default function AdmittedStudents() {
  const { activeTitle } = useCounseling();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  
  // Vacate Modal State
  const [isVacateDialogOpen, setIsVacateDialogOpen] = useState(false);
  const [studentToVacate, setStudentToVacate] = useState<string | null>(null);
  const [vacateReason, setVacateReason] = useState("");
  const [vacateComment, setVacateComment] = useState("");

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["/api/students", { counselingTitleId: activeTitle?.id, allocationStatus: 'admitted' }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("limit", "10000"); // Load all admitted for client filtering
      if (activeTitle?.id) qs.set("counselingTitleId", activeTitle.id.toString());
      qs.set("allocationStatus", "admitted");
      const res = await fetch(`/api/students?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch admitted students");
      return res.json();
    },
    enabled: !!activeTitle?.id,
  });

  const students: Student[] = studentsData?.students || [];

  const filteredStudents = students.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.appNo.toLowerCase().includes(q) ||
      s.meritNumber?.toString().includes(q)
    );
  });

  // Calculate pagination
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const paginatedStudents = filteredStudents.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredStudents.length / recordsPerPage);

  // Single Vacate Mutation
  const vacateMutation = useMutation({
    mutationFn: async ({ id, reason, comment }: { id: string, reason: string, comment?: string }) => {
      await apiRequest("POST", `/api/students/${id}/vacate`, { reason, comment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/district-analysis"] });
      toast({ title: "Seat Vacated", description: "Student has been marked as vacated." });
      setIsVacateDialogOpen(false);
      setVacateReason("");
      setVacateComment("");
      setStudentToVacate(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Bulk Vacate Mutation
  const bulkVacateMutation = useMutation({
    mutationFn: async ({ ids, reason, comment }: { ids: string[], reason: string, comment?: string }) => {
      await apiRequest("POST", `/api/students/bulk-vacate`, { studentIds: ids, reason, comment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/district-analysis"] });
      toast({ title: "Seats Vacated", description: `${selectedStudentIds.length} students have been vacated.` });
      setIsVacateDialogOpen(false);
      setVacateReason("");
      setVacateComment("");
      setSelectedStudentIds([]);
      setStudentToVacate(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleOpenVacateDialog = (studentId: string | null) => {
    setStudentToVacate(studentId);
    setVacateReason("");
    setVacateComment("");
    setIsVacateDialogOpen(true);
  };

  const handleConfirmVacate = () => {
    if (studentToVacate) {
      vacateMutation.mutate({ id: studentToVacate, reason: vacateReason, comment: vacateComment });
    } else if (selectedStudentIds.length > 0) {
      bulkVacateMutation.mutate({ ids: selectedStudentIds, reason: vacateReason, comment: vacateComment });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudentIds(filteredStudents.map(s => s.id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleSelectStudent = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedStudentIds(prev => [...prev, id]);
    } else {
      setSelectedStudentIds(prev => prev.filter(sId => sId !== id));
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-emerald-700">Admitted Students</h2>
          <p className="text-muted-foreground mt-2">
            View and manage all students who have confirmed admission for {activeTitle?.displayName || activeTitle?.titleName || "the selected academic session"}.
          </p>
        </div>
      </div>

      <Card className="border-emerald-100 shadow-md">
        <CardHeader className="bg-emerald-50/50 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Admitted List</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search admitted..."
                  className="pl-9 w-[280px]"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              {selectedStudentIds.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => handleOpenVacateDialog(null)}
                >
                  <UserMinus className="w-4 h-4 mr-2" />
                  Vacate Selected ({selectedStudentIds.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] px-6">
                    <Checkbox
                      checked={filteredStudents.length > 0 && selectedStudentIds.length === filteredStudents.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Merit #</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>App No</TableHead>
                  <TableHead>Stream</TableHead>
                  <TableHead>Allotted District</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead className="text-right px-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : paginatedStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No admitted students found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="px-6">
                        <Checkbox
                          checked={selectedStudentIds.includes(student.id)}
                          onCheckedChange={(c) => handleSelectStudent(student.id, c as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-mono">{student.meritNumber}</TableCell>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell className="font-mono">{student.appNo}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{student.stream || "Not Set"}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold text-emerald-700">
                        {student.counselingDistrict || "N/A"}
                      </TableCell>
                      <TableCell>
                        {student.counselingRoundNumber ? (
                          <Badge variant="secondary">R{student.counselingRoundNumber}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleOpenVacateDialog(student.id)}
                        >
                          <UserMinus className="w-4 h-4 mr-2" />
                          Vacate Seat
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filteredStudents.length > 0 && (
            <div className="flex items-center justify-between p-4 border-t bg-muted/20">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Show</span>
                <Select value={recordsPerPage.toString()} onValueChange={(val) => { setRecordsPerPage(Number(val)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span>entries | Showing {startIndex + 1} to {Math.min(endIndex, filteredStudents.length)} of {filteredStudents.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="text-sm font-medium px-2">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vacate Dialog */}
      <Dialog open={isVacateDialogOpen} onOpenChange={setIsVacateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {studentToVacate ? "Vacate Seat" : `Bulk Vacate Seats (${selectedStudentIds.length} students)`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for Vacating (Required)</label>
              <Input
                placeholder="e.g. Student quit, Document forgery, etc."
                value={vacateReason}
                onChange={(e) => setVacateReason(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Comments (Optional)</label>
              <Input
                placeholder="Additional details..."
                value={vacateComment}
                onChange={(e) => setVacateComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsVacateDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!vacateReason || vacateMutation.isPending || bulkVacateMutation.isPending}
              onClick={handleConfirmVacate}
            >
              {(vacateMutation.isPending || bulkVacateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Confirm Vacate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
