import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AcademicYearSelector } from "@/components/ui/academic-year-selector";
import { Download, FileText, Users, MapPin, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuth } from "@/hooks/useAuth";
import type { Student, Vacancy } from "@shared/schema";

interface AllocationStats {
  totalStudents: number;
  allottedStudents: number;
  notAllottedStudents: number;
  allocationsByDistrict: Record<string, number>;
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState("station-allotments");
  const [academicYear, setAcademicYear] = useState<string>("");

  const { data: students, isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students", { allocated: true, academicYear }],
  });

  const { data: vacancies, isLoading: vacanciesLoading } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies", academicYear],
  });

  const { data: allocationStats, isLoading: statsLoading } = useQuery<AllocationStats>({
    queryKey: ["/api/allocation/stats"],
  });

  const { user } = useAuth();
  const isDistrictAdmin = user?.role === 'district_admin';

  const allottedStudents = students?.filter(s => 
    s.allocationStatus === 'allotted' && 
    (!isDistrictAdmin || s.allottedDistrict === user?.district)
  ) || [];
  
  const notAllottedStudents = students?.filter(s => 
    s.allocationStatus === 'not_allotted' && 
    (!isDistrictAdmin || s.counselingDistrict === user?.district)
  ) || [];

  const districtStudentsList = students?.filter(s => 
    !isDistrictAdmin || s.counselingDistrict === user?.district || s.allottedDistrict === user?.district
  ) || [];

  const filteredVacancies = vacancies?.filter(v => 
    !isDistrictAdmin || v.district === user?.district
  ) || [];

  // Group allotted students by district and stream
  const allotmentsByDistrict = allottedStudents.reduce((acc, student) => {
    if (!student.allottedDistrict || !student.stream) return acc;
    
    // Normalize stream value (handle "Non-Medical" vs "NonMedical")
    const normalizedStream = student.stream === 'Non-Medical' ? 'NonMedical' : student.stream;
    
    if (!acc[student.allottedDistrict]) {
      acc[student.allottedDistrict] = {
        Medical: [],
        Commerce: [],
        NonMedical: []
      };
    }
    
    // Safety check: only push if the stream key exists
    const streamKey = normalizedStream as keyof typeof acc[string];
    if (acc[student.allottedDistrict][streamKey]) {
      acc[student.allottedDistrict][streamKey].push(student);
    }
    return acc;
  }, {} as Record<string, Record<string, Student[]>>);

  // Group vacancies by district and stream for calculations
  const vacancySummaryByDistrict = filteredVacancies?.reduce((acc, vacancy) => {
    const { district, stream } = vacancy;
    if (!district || !stream) return acc;
    
    // Normalize stream value (handle "Non-Medical" vs "NonMedical")
    const normalizedStream = stream === 'Non-Medical' ? 'NonMedical' : stream;
    
    if (!acc[district]) {
      acc[district] = { Medical: { total: 0, available: 0 }, Commerce: { total: 0, available: 0 }, NonMedical: { total: 0, available: 0 } };
    }
    
    // Safety check: only update if the stream key exists
    const streamKey = normalizedStream as keyof typeof acc[string];
    if (acc[district][streamKey]) {
      acc[district][streamKey].total += vacancy.totalSeats || 0;
      acc[district][streamKey].available += vacancy.availableSeats || 0;
    }
    return acc;
  }, {} as Record<string, Record<string, { total: number, available: number }>>);

  // Calculate remaining vacancies per district
  const remainingVacancies = Object.entries(vacancySummaryByDistrict || {}).map(([district, streams]) => {
    const districtAllotments = allotmentsByDistrict[district] || { Medical: [], Commerce: [], NonMedical: [] };
    
    const medicalTotal = streams.Medical.total;
    const commerceTotal = streams.Commerce.total;
    const nonMedicalTotal = streams.NonMedical.total;
    
    const medicalAllocated = districtAllotments.Medical.length;
    const commerceAllocated = districtAllotments.Commerce.length;
    const nonMedicalAllocated = districtAllotments.NonMedical.length;
    
    return {
      district,
      medicalVacancies: medicalTotal,
      commerceVacancies: commerceTotal,
      nonMedicalVacancies: nonMedicalTotal,
      remainingMedical: medicalTotal - medicalAllocated,
      remainingCommerce: commerceTotal - commerceAllocated,
      remainingNonMedical: nonMedicalTotal - nonMedicalAllocated,
      totalAllocated: medicalAllocated + commerceAllocated + nonMedicalAllocated,
      totalVacancies: medicalTotal + commerceTotal + nonMedicalTotal
    };
  });

  const detailedBreakdown = useMemo(() => {
    const map: Record<string, { district: string, category: string, gender: string, stream: string, total: number, allocated: number }> = {};
    
    filteredVacancies.forEach(v => {
      if (!v.district || !v.category || !v.gender || !v.stream) return;
      const str = v.stream === 'Non-Medical' ? 'NonMedical' : v.stream;
      const key = `${v.district}-${v.category}-${v.gender}-${str}`;
      if (!map[key]) {
        map[key] = { district: v.district, category: v.category, gender: v.gender, stream: str, total: 0, allocated: 0 };
      }
      map[key].total += (v.totalSeats || 0);
    });

    allottedStudents.forEach(s => {
      if (!s.allottedDistrict || !s.category || !s.gender || !s.stream) return;
      const str = s.stream === 'Non-Medical' ? 'NonMedical' : s.stream;
      const key = `${s.allottedDistrict}-${s.category}-${s.gender}-${str}`;
      if (map[key]) {
        map[key].allocated += 1;
      }
    });

    return Object.values(map).sort((a,b) => {
      if (a.district !== b.district) return a.district.localeCompare(b.district);
      if (a.stream !== b.stream) return a.stream.localeCompare(b.stream);
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.gender.localeCompare(b.gender);
    });
  }, [filteredVacancies, allottedStudents]);

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
        'Medical Allocated': vacancy.medicalVacancies - vacancy.remainingMedical,
        'Medical Remaining': vacancy.remainingMedical,
        'Commerce Vacancies': vacancy.commerceVacancies,
        'Commerce Allocated': vacancy.commerceVacancies - vacancy.remainingCommerce,
        'Commerce Remaining': vacancy.remainingCommerce,
        'NonMedical Vacancies': vacancy.nonMedicalVacancies,
        'NonMedical Allocated': vacancy.nonMedicalVacancies - vacancy.remainingNonMedical,
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
    <div className="flex-1 flex flex-col">
      <Header 
        title="Reports" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Reports" }
        ]}
      />
      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <AcademicYearSelector
                value={academicYear}
                onValueChange={setAcademicYear}
                className="max-w-xs"
              />
            </CardContent>
          </Card>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            View allocation results and remaining vacancies
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => window.open(`/api/export/reports/pdf?academicYear=${academicYear || ''}`, '_blank')}>
            <Download className="w-4 h-4 mr-2" />
            Export PDF Report
          </Button>
          <Button variant="outline" onClick={exportToCSV} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
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
                  {isDistrictAdmin ? districtStudentsList.length : (allocationStats?.totalStudents || students?.length || 0)}
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
                  {isDistrictAdmin ? allottedStudents.length : (allocationStats?.allottedStudents || allottedStudents.length)}
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
                  {isDistrictAdmin ? notAllottedStudents.length : (allocationStats?.notAllottedStudents || notAllottedStudents.length)}
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
                  {isDistrictAdmin ? new Set(filteredVacancies.map(v => v.district)).size : new Set((vacancies || []).map(v => v.district)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Infographics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Allocation Status</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex justify-center items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Allotted', value: isDistrictAdmin ? allottedStudents.length : (allocationStats?.allottedStudents || allottedStudents.length) },
                    { name: 'Not Allotted', value: isDistrictAdmin ? notAllottedStudents.length : (allocationStats?.notAllottedStudents || notAllottedStudents.length) },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  dataKey="value"
                >
                  {[{ name: 'Allotted', value: isDistrictAdmin ? allottedStudents.length : (allocationStats?.allottedStudents || allottedStudents.length) },
                    { name: 'Not Allotted', value: isDistrictAdmin ? notAllottedStudents.length : (allocationStats?.notAllottedStudents || notAllottedStudents.length) }].map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#22c55e', '#ef4444'][index % 2]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, "Students"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="station-allotments" data-testid="tab-station-allotments">
            <FileText className="w-4 h-4 mr-2" />
            Station Allotments
          </TabsTrigger>
          <TabsTrigger value="remaining-vacancies" data-testid="tab-remaining-vacancies">
            <MapPin className="w-4 h-4 mr-2" />
            Remaining Vacancies
          </TabsTrigger>
          <TabsTrigger value="detailed-breakdown">
            <FileText className="w-4 h-4 mr-2" />
            Detailed Breakdown
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
                      {remainingVacancies.map((vacancy, index) => (
                        <tr key={`vacancy-${vacancy.district}-${index}`}>
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

        <TabsContent value="detailed-breakdown" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Breakdown (Category & Gender)</CardTitle>
              <CardDescription>
                Granular view of all allotted seats and remaining vacancies
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detailedBreakdown.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No vacancy data available for detailed breakdown.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-border">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border border-border p-3 text-left">District</th>
                        <th className="border border-border p-3 text-left">Stream</th>
                        <th className="border border-border p-3 text-left">Category</th>
                        <th className="border border-border p-3 text-left">Gender</th>
                        <th className="border border-border p-3 text-center">Total Seats</th>
                        <th className="border border-border p-3 text-center">Filled</th>
                        <th className="border border-border p-3 text-center">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailedBreakdown.map((row: any, index: number) => (
                        <tr key={`detail-${index}`}>
                          <td className="border border-border p-3">{row.district}</td>
                          <td className="border border-border p-3">{row.stream}</td>
                          <td className="border border-border p-3">{row.category}</td>
                          <td className="border border-border p-3">{row.gender}</td>
                          <td className="border border-border p-3 text-center">{row.total}</td>
                          <td className="border border-border p-3 text-center text-blue-600 font-medium">{row.allocated}</td>
                          <td className="border border-border p-3 text-center">
                            <span className={(row.total - row.allocated) > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                              {row.total - row.allocated}
                            </span>
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
      </main>
    </div>
  );
}