import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileText, Users, MapPin, TrendingUp } from "lucide-react";
import type { Student, Vacancy } from "@shared/schema";

interface AllocationStats {
  totalStudents: number;
  allottedStudents: number;
  notAllottedStudents: number;
  allocationsByDistrict: Record<string, number>;
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState("station-allotments");

  const { data: students, isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students", { allocated: true }],
  });

  const { data: vacancies, isLoading: vacanciesLoading } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies"],
  });

  const { data: allocationStats, isLoading: statsLoading } = useQuery<AllocationStats>({
    queryKey: ["/api/allocation/stats"],
  });

  const allottedStudents = students?.filter(s => s.allocationStatus === 'allotted') || [];
  const notAllottedStudents = students?.filter(s => s.allocationStatus === 'not_allotted') || [];

  // Group allotted students by district and stream
  const allotmentsByDistrict = allottedStudents.reduce((acc, student) => {
    if (!student.allottedDistrict) return acc;
    
    if (!acc[student.allottedDistrict]) {
      acc[student.allottedDistrict] = {
        Medical: [],
        Commerce: [],
        NonMedical: []
      };
    }
    acc[student.allottedDistrict][student.stream as keyof typeof acc[string]].push(student);
    return acc;
  }, {} as Record<string, Record<string, Student[]>>);

  // Calculate remaining vacancies
  const remainingVacancies = vacancies?.map(vacancy => {
    const districtAllotments = allotmentsByDistrict[vacancy.district] || { Medical: [], Commerce: [], NonMedical: [] };
    return {
      ...vacancy,
      remainingMedical: vacancy.medicalVacancies! - districtAllotments.Medical.length,
      remainingCommerce: vacancy.commerceVacancies! - districtAllotments.Commerce.length,
      remainingNonMedical: vacancy.nonMedicalVacancies! - districtAllotments.NonMedical.length,
      totalAllocated: districtAllotments.Medical.length + districtAllotments.Commerce.length + districtAllotments.NonMedical.length,
      totalVacancies: vacancy.medicalVacancies! + vacancy.commerceVacancies! + vacancy.nonMedicalVacancies!
    };
  }) || [];

  const exportToCSV = () => {
    if (activeTab === 'station-allotments') {
      const csvData = allottedStudents.map(student => ({
        'App No': student.appNo,
        'Merit Number': student.meritNumber,
        'Student Name': student.name,
        'Stream': student.stream,
        'Allotted District': student.allottedDistrict,
        'Allotted Stream': student.allottedStream
      }));
      downloadCSV(csvData, 'station-allotments.csv');
    } else {
      const csvData = remainingVacancies.map(vacancy => ({
        'District': vacancy.district,
        'Medical Vacancies': vacancy.medicalVacancies,
        'Medical Allocated': vacancy.medicalVacancies! - vacancy.remainingMedical,
        'Medical Remaining': vacancy.remainingMedical,
        'Commerce Vacancies': vacancy.commerceVacancies,
        'Commerce Allocated': vacancy.commerceVacancies! - vacancy.remainingCommerce,
        'Commerce Remaining': vacancy.remainingCommerce,
        'NonMedical Vacancies': vacancy.nonMedicalVacancies,
        'NonMedical Allocated': vacancy.nonMedicalVacancies! - vacancy.remainingNonMedical,
        'NonMedical Remaining': vacancy.remainingNonMedical,
        'Total Allocated': vacancy.totalAllocated,
        'Total Remaining': vacancy.totalVacancies - vacancy.totalAllocated
      }));
      downloadCSV(csvData, 'remaining-vacancies.csv');
    }
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (studentsLoading || vacanciesLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-muted-foreground">
              View allocation results and remaining vacancies
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                  <div className="h-8 bg-muted rounded w-1/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            View allocation results and remaining vacancies
          </p>
        </div>
        <Button onClick={exportToCSV} data-testid="button-export-csv">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-2xl font-bold" data-testid="text-total-students">
                  {allocationStats?.totalStudents || students?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Allotted</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-allotted-students">
                  {allocationStats?.allottedStudents || allottedStudents.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">Not Allotted</p>
                <p className="text-2xl font-bold text-red-600" data-testid="text-not-allotted-students">
                  {allocationStats?.notAllottedStudents || notAllottedStudents.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Districts</p>
                <p className="text-2xl font-bold" data-testid="text-total-districts">
                  {vacancies?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="station-allotments" data-testid="tab-station-allotments">
            <FileText className="w-4 h-4 mr-2" />
            Station Allotments
          </TabsTrigger>
          <TabsTrigger value="remaining-vacancies" data-testid="tab-remaining-vacancies">
            <MapPin className="w-4 h-4 mr-2" />
            Remaining Vacancies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="station-allotments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Station-wise Allotments</CardTitle>
              <CardDescription>
                Students allocated to each district by stream
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(allotmentsByDistrict).length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No allocations found</p>
                  <p className="text-sm text-muted-foreground">Run the allocation process to see results</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(allotmentsByDistrict).map(([district, streams]) => (
                    <div key={district} className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-4">{district}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(['Medical', 'Commerce', 'NonMedical'] as const).map(stream => (
                          <div key={stream} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{stream}</h4>
                              <Badge variant="secondary" data-testid={`badge-${district}-${stream.toLowerCase()}-count`}>
                                {streams[stream].length} students
                              </Badge>
                            </div>
                            {streams[stream].length > 0 && (
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {streams[stream].map(student => (
                                  <div key={student.id} className="text-sm p-2 bg-muted rounded flex justify-between">
                                    <span data-testid={`text-student-${student.appNo}`}>{student.name}</span>
                                    <span className="text-muted-foreground">Merit: {student.meritNumber}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="remaining-vacancies" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Remaining Vacancies</CardTitle>
              <CardDescription>
                Available seats after allocation by district and stream
              </CardDescription>
            </CardHeader>
            <CardContent>
              {remainingVacancies.length === 0 ? (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No vacancy data found</p>
                  <p className="text-sm text-muted-foreground">Upload vacancy data to see remaining seats</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-border">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border border-border p-3 text-left">District</th>
                        <th className="border border-border p-3 text-center">Medical</th>
                        <th className="border border-border p-3 text-center">Commerce</th>
                        <th className="border border-border p-3 text-center">Non-Medical</th>
                        <th className="border border-border p-3 text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remainingVacancies.map(vacancy => (
                        <tr key={vacancy.district}>
                          <td className="border border-border p-3 font-medium">
                            {vacancy.district}
                          </td>
                          <td className="border border-border p-3 text-center">
                            <div className="space-y-1">
                              <div data-testid={`text-${vacancy.district}-medical-remaining`}>
                                <span className={vacancy.remainingMedical > 0 ? "text-green-600 font-medium" : "text-red-600"}>
                                  {vacancy.remainingMedical}
                                </span>
                                <span className="text-muted-foreground"> / {vacancy.medicalVacancies}</span>
                              </div>
                            </div>
                          </td>
                          <td className="border border-border p-3 text-center">
                            <div className="space-y-1">
                              <div data-testid={`text-${vacancy.district}-commerce-remaining`}>
                                <span className={vacancy.remainingCommerce > 0 ? "text-green-600 font-medium" : "text-red-600"}>
                                  {vacancy.remainingCommerce}
                                </span>
                                <span className="text-muted-foreground"> / {vacancy.commerceVacancies}</span>
                              </div>
                            </div>
                          </td>
                          <td className="border border-border p-3 text-center">
                            <div className="space-y-1">
                              <div data-testid={`text-${vacancy.district}-nonmedical-remaining`}>
                                <span className={vacancy.remainingNonMedical > 0 ? "text-green-600 font-medium" : "text-red-600"}>
                                  {vacancy.remainingNonMedical}
                                </span>
                                <span className="text-muted-foreground"> / {vacancy.nonMedicalVacancies}</span>
                              </div>
                            </div>
                          </td>
                          <td className="border border-border p-3 text-center">
                            <div className="space-y-1">
                              <div data-testid={`text-${vacancy.district}-total-remaining`}>
                                <span className={vacancy.totalVacancies - vacancy.totalAllocated > 0 ? "text-green-600 font-medium" : "text-red-600"}>
                                  {vacancy.totalVacancies - vacancy.totalAllocated}
                                </span>
                                <span className="text-muted-foreground"> / {vacancy.totalVacancies}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}