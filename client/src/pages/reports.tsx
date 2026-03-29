import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useCounseling } from "@/hooks/useCounseling";
import { Download, FileText, Users, MapPin, TrendingUp, PieChart as PieChartIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuth } from "@/hooks/useAuth";
import type { Student, Vacancy, VacatedSeat } from "@shared/schema";
import { useGlobalLoading } from "@/hooks/useGlobalLoading"; // Added this import

interface AllocationStats {
  totalStudents: number;
  allottedStudents: number;
  notAllottedStudents: number;
  allocationsByDistrict: Record<string, number>;
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState("station-allotments");
  const { activeSession: academicYear, activeTitle } = useCounseling();

  const { data: students, isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students", { allocated: true, academicYear, counselingTitleId: activeTitle?.id }],
    enabled: !!activeTitle?.id,
  });

  const { data: vacancies, isLoading: vacanciesLoading } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies", { counselingTitleId: activeTitle?.id }],
    enabled: !!activeTitle?.id,
  });

  const { data: allocationStats, isLoading: statsLoading } = useQuery<AllocationStats>({
    queryKey: ["/api/allocation/stats", { academicYear, counselingTitleId: activeTitle?.id }],
    enabled: !!activeTitle?.id,
  });

  const { data: vacatedSeats, isLoading: vacatedLoading } = useQuery<VacatedSeat[]>({
    queryKey: ["/api/vacated-seats", { academicYear }],
    enabled: !!academicYear,
  });

  const { user } = useAuth();
  const isDistrictAdmin = user?.role === 'district_admin';

  const allottedStudents = useMemo(() => students?.filter(s => 
    (s.allocationStatus === 'allotted' || s.allocationStatus === 'admitted') && 
    (!isDistrictAdmin || s.allottedDistrict === user?.district)
  ) || [], [students, isDistrictAdmin, user?.district]);
  
  const notAllottedStudents = useMemo(() => students?.filter(s => 
    s.allocationStatus === 'not_allotted' && 
    (!isDistrictAdmin || s.counselingDistrict === user?.district)
  ) || [], [students, isDistrictAdmin, user?.district]);

  const districtStudentsList = useMemo(() => students?.filter(s => 
    !isDistrictAdmin || s.counselingDistrict === user?.district || s.allottedDistrict === user?.district
  ) || [], [students, isDistrictAdmin, user?.district]);

  const filteredVacancies = useMemo(() => vacancies?.filter(v => 
    !isDistrictAdmin || v.district === user?.district
  ) || [], [vacancies, isDistrictAdmin, user?.district]);

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

  const uniqueDistricts = useMemo(() => Array.from(new Set(allottedStudents.map(s => s.allottedDistrict).filter(Boolean))) as string[], [allottedStudents]);
  const uniqueStreams = useMemo(() => Array.from(new Set(allottedStudents.map(s => s.stream).filter(Boolean))) as string[], [allottedStudents]);
  const uniqueCategories = useMemo(() => Array.from(new Set(allottedStudents.map(s => s.category).filter(Boolean))) as string[], [allottedStudents]);
  const uniqueGenders = useMemo(() => Array.from(new Set(allottedStudents.map(s => s.gender).filter(Boolean))) as string[], [allottedStudents]);

  const { setLoading } = useGlobalLoading();

  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedStreams, setSelectedStreams] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'meritNumber', 'appNo', 'name', 'category', 'gender', 'stream', 'allottedDistrict'
  ]);

  const AVAILABLE_COLUMNS = useMemo(() => [
    { id: 'meritNumber', label: 'Merit Number' },
    { id: 'appNo', label: 'App Number' },
    { id: 'name', label: 'Student Name' },
    { id: 'category', label: 'Category' },
    { id: 'gender', label: 'Gender' },
    { id: 'stream', label: 'Stream' },
    { id: 'choices', label: 'Choices (1-10)' },
    { id: 'allottedDistrict', label: 'Allotted District' }
  ], []);

  const initialFiltersSet = useRef(false);

  // Date filters for Attrition chart
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const attritionData = useMemo(() => {
    // 1. Filter vacated seats strictly by date range
    let validVacated = vacatedSeats || [];
    
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      validVacated = validVacated.filter(v => new Date(v.vacatedAt) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      validVacated = validVacated.filter(v => new Date(v.vacatedAt) <= to);
    }

    // 2. We also should filter admitted students similarly if we want dynamic admitted over time. 
    // Wait, admitted students don't have an `admittedAt` field, they only have `updatedAt`.
    // Let's filter students by updatedAt just for the graph logic
    let validAdmitted = allottedStudents.filter(s => s.allocationStatus === 'admitted');
    
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      validAdmitted = validAdmitted.filter(s => s.updatedAt && new Date(s.updatedAt) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      validAdmitted = validAdmitted.filter(s => s.updatedAt && new Date(s.updatedAt) <= to);
    }

    // Combine by district
    const map: Record<string, { district: string, admitted: number, vacated: number, notAdmitted: number }> = {};
    
    // Initialize map with all active districts from allocations
    uniqueDistricts.forEach(d => {
      map[d] = { district: d, admitted: 0, vacated: 0, notAdmitted: 0 };
    });

    validAdmitted.forEach(s => {
      if (!s.allottedDistrict) return;
      if (!map[s.allottedDistrict]) map[s.allottedDistrict] = { district: s.allottedDistrict, admitted: 0, vacated: 0, notAdmitted: 0 };
      map[s.allottedDistrict].admitted += 1;
    });

    validVacated.forEach(v => {
      if (!v.vacatedDistrict) return;
      if (!map[v.vacatedDistrict]) map[v.vacatedDistrict] = { district: v.vacatedDistrict, admitted: 0, vacated: 0, notAdmitted: 0 };
      if (v.actionType === 'not_admitted') {
        map[v.vacatedDistrict].notAdmitted += 1;
      } else {
        map[v.vacatedDistrict].vacated += 1;
      }
    });

    return Object.values(map).sort((a, b) => a.district.localeCompare(b.district));
  }, [vacatedSeats, allottedStudents, uniqueDistricts, fromDate, toDate]);

  const CustomAttritionTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border text-popover-foreground p-3 rounded-lg shadow-md max-w-sm">
          <p className="font-semibold text-sm mb-2 text-primary">{label} District</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <p key={`item-${index}`} className="text-sm flex justify-between gap-4">
                <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
                <span className="font-bold">{entry.value}</span>
              </p>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground italic">
            Time Filter: {fromDate || "Beginning"} to {toDate || "Present"}
          </div>
        </div>
      );
    }
    return null;
  };

  useEffect(() => {
    if (uniqueDistricts.length > 0 && !initialFiltersSet.current) {
      setSelectedDistricts(uniqueDistricts);
      setSelectedStreams(uniqueStreams);
      setSelectedCategories(uniqueCategories);
      setSelectedGenders(uniqueGenders);
      initialFiltersSet.current = true;
    }
  }, [uniqueDistricts, uniqueStreams, uniqueCategories, uniqueGenders]);

  const handleCustomExport = async (format: 'pdf' | 'csv') => {
    try {
      setLoading(true, `Generating Custom ${format.toUpperCase()} Report...`);
      const payload = {
        academicYear,
        filters: {
          districts: selectedDistricts,
          streams: selectedStreams,
          categories: selectedCategories,
          genders: selectedGenders
        },
        columns: selectedColumns
      };
      
      const response = await fetch(`/api/export/custom/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `custom-allotment-report-${academicYear || 'all'}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Failed to generate custom export");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => { // Made async to use setLoading
    try {
      setLoading(true, "Generating CSV Report...");
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
    } catch (error) {
      console.error(error);
      alert("Failed to generate CSV export");
    } finally {
      setLoading(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            View allocation results and remaining vacancies
          </p>
        </div>
        <div className="flex space-x-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="default">
                <FileText className="w-4 h-4 mr-2" />
                Custom Export
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Custom Allotments Export</DialogTitle>
                <DialogDescription>
                  Filter the report parameters and selectively check which data columns should be included.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-6">
                  {/* Filters Column */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg border-b pb-2">Filters</h3>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium text-muted-foreground">Districts</Label>
                        <div className="text-xs space-x-2">
                          <button className="text-primary hover:underline" onClick={() => setSelectedDistricts(uniqueDistricts)}>All</button>
                          <span className="text-muted-foreground">|</span>
                          <button className="text-muted-foreground hover:underline" onClick={() => setSelectedDistricts([])}>None</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded">
                        {uniqueDistricts.map(d => (
                          <div key={d} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`filter-district-${d}`}
                              checked={selectedDistricts.includes(d)} 
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedDistricts([...selectedDistricts, d]);
                                else setSelectedDistricts(selectedDistricts.filter(x => x !== d));
                              }} 
                            />
                            <Label htmlFor={`filter-district-${d}`} className="font-normal cursor-pointer">{d}</Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium text-muted-foreground">Streams</Label>
                        <div className="text-xs space-x-2">
                          <button className="text-primary hover:underline" onClick={() => setSelectedStreams(uniqueStreams)}>All</button>
                          <span className="text-muted-foreground">|</span>
                          <button className="text-muted-foreground hover:underline" onClick={() => setSelectedStreams([])}>None</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {uniqueStreams.map(s => (
                          <div key={s} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`filter-stream-${s}`}
                              checked={selectedStreams.includes(s)} 
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedStreams([...selectedStreams, s]);
                                else setSelectedStreams(selectedStreams.filter(x => x !== s));
                              }} 
                            />
                            <Label htmlFor={`filter-stream-${s}`} className="font-normal cursor-pointer">{s}</Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium text-muted-foreground">Categories</Label>
                          <div className="text-xs space-x-1">
                            <button className="text-primary hover:underline" onClick={() => setSelectedCategories(uniqueCategories)}>All</button>
                            <span className="text-muted-foreground">|</span>
                            <button className="text-muted-foreground hover:underline" onClick={() => setSelectedCategories([])}>None</button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {uniqueCategories.map(c => (
                            <div key={c} className="flex items-center space-x-2">
                              <Checkbox 
                                id={`filter-cat-${c}`}
                                checked={selectedCategories.includes(c)} 
                                onCheckedChange={(checked) => {
                                  if (checked) setSelectedCategories([...selectedCategories, c]);
                                  else setSelectedCategories(selectedCategories.filter(x => x !== c));
                                }} 
                              />
                              <Label htmlFor={`filter-cat-${c}`} className="font-normal cursor-pointer">{c}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium text-muted-foreground">Genders</Label>
                          <div className="text-xs space-x-1">
                            <button className="text-primary hover:underline" onClick={() => setSelectedGenders(uniqueGenders)}>All</button>
                            <span className="text-muted-foreground">|</span>
                            <button className="text-muted-foreground hover:underline" onClick={() => setSelectedGenders([])}>None</button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {uniqueGenders.map(g => (
                            <div key={g} className="flex items-center space-x-2">
                              <Checkbox 
                                id={`filter-gender-${g}`}
                                checked={selectedGenders.includes(g)} 
                                onCheckedChange={(checked) => {
                                  if (checked) setSelectedGenders([...selectedGenders, g]);
                                  else setSelectedGenders(selectedGenders.filter(x => x !== g));
                                }} 
                              />
                              <Label htmlFor={`filter-gender-${g}`} className="font-normal cursor-pointer">{g}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {(!selectedDistricts.length || !selectedStreams.length || !selectedCategories.length || !selectedGenders.length) && (
                      <p className="text-xs text-destructive font-semibold">Please select at least one option from each filter category.</p>
                    )}
                  </div>

                  {/* Columns Section */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg border-b pb-2">Fields to Include</h3>
                    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                      {AVAILABLE_COLUMNS.map(col => {
                        const isRequired = col.id === 'meritNumber' || col.id === 'appNo';
                        return (
                          <div key={col.id} className="flex items-center space-x-3">
                            <Checkbox 
                              id={`col-${col.id}`}
                              disabled={isRequired}
                              checked={isRequired || selectedColumns.includes(col.id)} 
                              onCheckedChange={(checked) => {
                                if (isRequired) return;
                                if (checked) setSelectedColumns([...selectedColumns, col.id]);
                                else setSelectedColumns(selectedColumns.filter(x => x !== col.id));
                              }} 
                            />
                            <Label htmlFor={`col-${col.id}`} className={`font-medium cursor-pointer ${isRequired ? 'opacity-70' : ''}`}>
                              {col.label} {isRequired && <span className="text-xs text-muted-foreground">(Required)</span>}
                            </Label>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-4 pt-4 mt-6">
                      <Button 
                        className="flex-1" 
                        disabled={!selectedDistricts.length || !selectedStreams.length || !selectedCategories.length || !selectedGenders.length}
                        onClick={() => handleCustomExport('pdf')}
                      >
                        <Download className="w-4 h-4 mr-2" /> PDF List
                      </Button>
                      <Button 
                        className="flex-1" 
                        variant="secondary"
                        disabled={!selectedDistricts.length || !selectedStreams.length || !selectedCategories.length || !selectedGenders.length} 
                        onClick={() => handleCustomExport('csv')}
                      >
                        <Download className="w-4 h-4 mr-2" /> CSV List
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-view-graph">
                <PieChartIcon className="w-4 h-4 mr-2" />
                View Graph
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Allocation Status Summary</DialogTitle>
                <DialogDescription>
                  Visual representation of allotted vs not allotted students.
                </DialogDescription>
              </DialogHeader>
              <div className="h-[400px] flex justify-center items-center py-4">
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
                      outerRadius={140}
                      dataKey="value"
                    >
                      {[{ name: 'Allotted', value: isDistrictAdmin ? allottedStudents.length : (allocationStats?.allottedStudents || allottedStudents.length) },
                        { name: 'Not Allotted', value: isDistrictAdmin ? notAllottedStudents.length : (allocationStats?.notAllottedStudents || notAllottedStudents.length) }].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#22c55e', '#ef4444'][index % 2]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [value, "Students"]} />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={async () => {
             try {
                setLoading(true, "Generating PDF Report...");
                const resp = await fetch(`/api/export/reports/pdf?academicYear=${academicYear || ''}`);
                const blob = await resp.blob();
                const url = window.URL.createObjectURL(blob);
                window.open(url, '_blank');
             } catch(e) {
                console.error(e);
                alert("Failed to generate PDF report");
             } finally {
                setLoading(false);
             }
          }}>
            <Download className="w-4 h-4 mr-2" /> PDF Report
          </Button>
          <Button variant="outline" onClick={exportToCSV} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-2" />
            Export Basic CSV
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="station-allotments" data-testid="tab-station-allotments">
            <FileText className="w-4 h-4 mr-2 hidden sm:block" />
            <span className="hidden sm:inline">Station Allotments</span>
            <span className="sm:hidden">Stations</span>
          </TabsTrigger>
          <TabsTrigger value="remaining-vacancies" data-testid="tab-remaining-vacancies">
            <MapPin className="w-4 h-4 mr-2 hidden sm:block" />
            <span className="hidden sm:inline">Remaining Vacancies</span>
            <span className="sm:hidden">Vacancies</span>
          </TabsTrigger>
          <TabsTrigger value="detailed-breakdown">
            <FileText className="w-4 h-4 mr-2 hidden sm:block" />
            <span className="hidden sm:inline">Detailed Breakdown</span>
            <span className="sm:hidden">Detailed</span>
          </TabsTrigger>
          <TabsTrigger value="attrition">
            <TrendingUp className="w-4 h-4 mr-2 hidden sm:block" />
            <span className="hidden sm:inline">Attrition Analysis</span>
            <span className="sm:hidden">Attrition</span>
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
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-border whitespace-nowrap">
                  <thead>
                    <tr className="bg-muted text-left">
                      <th className="border border-border p-2">District</th>
                      <th className="border border-border p-2">Stream</th>
                      <th className="border border-border p-2">Category</th>
                      <th className="border border-border p-2">Gender</th>
                      <th className="border border-border p-2 text-center">Allocated</th>
                      <th className="border border-border p-2 text-center">Total Seats</th>
                      <th className="border border-border p-2 text-center">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedBreakdown.map((row) => (
                      <tr key={`${row.district}-${row.stream}-${row.category}-${row.gender}`} className="text-sm">
                        <td className="border border-border p-2 font-medium">{row.district}</td>
                        <td className="border border-border p-2">{row.stream}</td>
                        <td className="border border-border p-2">{row.category}</td>
                        <td className="border border-border p-2">{row.gender}</td>
                        <td className="border border-border p-2 text-center">{row.allocated}</td>
                        <td className="border border-border p-2 text-center">{row.total}</td>
                        <td className="border border-border p-2 text-center">
                          <span className={(row.total - row.allocated) > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                            {row.total - row.allocated}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attrition" className="space-y-6">
          <Card className="border-t-4 border-t-purple-500">
            <CardHeader className="bg-gray-50/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Attrition & Admissions Graph</CardTitle>
                  <CardDescription>
                    Compare successful admissions against vacated or declined seats by District.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <Label className="text-xs mb-1">From Date</Label>
                    <Input 
                      type="date"
                      className="h-9 w-[140px]"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <Label className="text-xs mb-1">To Date</Label>
                    <Input 
                      type="date"
                      className="h-9 w-[140px]"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {attritionData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No attrition data found for the selected time range.</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-4">
                  <div className="h-[400px]" style={{ minWidth: `${Math.max(800, attritionData.length * 60)}px` }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={attritionData} margin={{ top: 20, right: 30, left: 0, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                        <XAxis 
                          dataKey="district" 
                          tick={{ fontSize: 11 }} 
                          interval={0} 
                          angle={-35} 
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis allowDecimals={false} />
                        <Tooltip content={<CustomAttritionTooltip />} cursor={{ fill: 'transparent' }} />
                        <Legend verticalAlign="top" height={36}/>
                        <Bar dataKey="admitted" name="Admitted" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={45} />
                        <Bar dataKey="vacated" name="Vacated by Admin" fill="#ef4444" radius={[2, 2, 0, 0]} maxBarSize={45} />
                        <Bar dataKey="notAdmitted" name="Declined Seat" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={45} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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