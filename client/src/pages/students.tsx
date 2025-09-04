import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DataPagination } from "@/components/ui/data-pagination";
import { Search, Users, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Student, StudentsEntranceResult } from "@shared/schema";

export default function Students() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const { user } = useAuth();
  
  const isDistrictAdmin = user?.role === 'district_admin';

  // Fetch data based on user role
  const { data: studentsData, isLoading } = useQuery<{students: Student[] | StudentsEntranceResult[], total: number}>({
    queryKey: isDistrictAdmin 
      ? ["/api/students-entrance-results", { limit, offset: page * limit }]
      : ["/api/students", { limit, offset: page * limit }],
  });

  const filteredStudents = studentsData?.students?.filter((student: any) => {
    if (isDistrictAdmin) {
      // Filter entrance results
      const entranceResult = student as StudentsEntranceResult;
      return entranceResult.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             entranceResult.meritNo.toString().includes(searchTerm) ||
             entranceResult.applicationNo?.includes(searchTerm) ||
             entranceResult.rollNo?.includes(searchTerm);
    } else {
      // Filter regular students
      const regularStudent = student as Student;
      return regularStudent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             regularStudent.meritNumber.toString().includes(searchTerm) ||
             regularStudent.appNo?.includes(searchTerm);
    }
  }) || [];

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
              {isDistrictAdmin ? "Entrance Results" : "Student Records"}
            </CardTitle>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={isDistrictAdmin 
                    ? "Search by name, merit number, application number, or roll number..."
                    : "Search by name, merit number, or application number..."
                  }
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
                        {isDistrictAdmin ? (
                          <>
                            <TableHead>Merit No.</TableHead>
                            <TableHead>App No.</TableHead>
                            <TableHead>Roll No.</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Marks</TableHead>
                            <TableHead>Gender</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Stream</TableHead>
                            <TableHead>Actions</TableHead>
                          </>
                        ) : (
                          <>
                            <TableHead>App No.</TableHead>
                            <TableHead>Merit No.</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Gender</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Stream</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Allotted District</TableHead>
                            <TableHead>Actions</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student: any) => {
                        if (isDistrictAdmin) {
                          const entranceResult = student as StudentsEntranceResult;
                          return (
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
                                <Badge variant={entranceResult.stream === 'Medical' ? 'default' : entranceResult.stream === 'Commerce' ? 'secondary' : 'outline'}>
                                  {entranceResult.stream}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" data-testid={`button-view-${entranceResult.meritNo}`}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        } else {
                          const regularStudent = student as Student;
                          return (
                            <TableRow key={regularStudent.id} data-testid={`student-row-${regularStudent.meritNumber}`}>
                              <TableCell className="font-mono text-sm">{regularStudent.appNo}</TableCell>
                              <TableCell className="font-medium">{regularStudent.meritNumber}</TableCell>
                              <TableCell>{regularStudent.name}</TableCell>
                              <TableCell>
                                <Badge variant={regularStudent.gender === 'Male' ? 'default' : regularStudent.gender === 'Female' ? 'secondary' : 'outline'}>
                                  {regularStudent.gender}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={regularStudent.category === 'Open' ? 'default' : 'secondary'}>
                                  {regularStudent.category}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={regularStudent.stream === 'Medical' ? 'default' : regularStudent.stream === 'Commerce' ? 'secondary' : 'outline'}>
                                  {regularStudent.stream}
                                </Badge>
                              </TableCell>
                              <TableCell>{getStatusBadge(regularStudent.allocationStatus || 'pending')}</TableCell>
                              <TableCell>
                                {regularStudent.allottedDistrict ? (
                                  <Badge className="bg-green-100 text-green-800">{regularStudent.allottedDistrict}</Badge>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                <Link href={`/student/${regularStudent.id}`}>
                                  <Button variant="ghost" size="sm" data-testid={`button-view-${regularStudent.meritNumber}`}>
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          );
                        }
                      })}
                    </TableBody>
                  </Table>
                </div>

                {filteredStudents.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No students found matching your search.</p>
                  </div>
                )}

                <DataPagination
                  currentPage={page}
                  totalItems={studentsData?.total || 0}
                  itemsPerPage={limit}
                  onPageChange={(newPage) => {
                    setPage(newPage);
                    setSearchTerm(""); // Clear search when changing pages
                  }}
                  onItemsPerPageChange={(newLimit) => {
                    setLimit(newLimit);
                    setPage(0); // Reset to first page when changing items per page
                    setSearchTerm(""); // Clear search when changing items per page
                  }}
                  showItemsPerPageSelector={true}
                  itemsPerPageOptions={[25, 50, 100, 200]}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
