import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Users } from "lucide-react";
import type { Student } from "@/types";

export default function Students() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["/api/students", { limit, offset: page * limit }],
  });

  const filteredStudents = studentsData?.students?.filter((student: Student) => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.meritNumber.toString().includes(searchTerm) ||
    student.applicationNumber?.includes(searchTerm)
  ) || [];

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
        title="Students" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Students" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2 text-primary" />
              Student Records
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
                        <TableHead>Merit No.</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Stream</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Allotted District</TableHead>
                        <TableHead>Top Choices</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student: Student) => (
                        <TableRow key={student.id} data-testid={`student-row-${student.meritNumber}`}>
                          <TableCell className="font-medium">{student.meritNumber}</TableCell>
                          <TableCell>{student.name}</TableCell>
                          <TableCell>{student.stream}</TableCell>
                          <TableCell>{getStatusBadge(student.allocationStatus || 'pending')}</TableCell>
                          <TableCell>{student.allottedDistrict || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {[student.choice1, student.choice2, student.choice3]
                              .filter(Boolean)
                              .join(', ') || '-'}
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

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredStudents.length} of {studentsData?.total || 0} students
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      data-testid="button-previous-page"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={!studentsData?.total || (page + 1) * limit >= studentsData.total}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
