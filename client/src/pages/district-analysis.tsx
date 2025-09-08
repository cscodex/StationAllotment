import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  Users, 
  MapPin, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  FileText,
  Eye,
  TrendingUp,
  Percent
} from "lucide-react";
import type { DistrictStatus } from "@shared/schema";

export default function DistrictAnalysis() {
  // Fetch district statuses
  const { data: districtStatuses, isLoading: loadingStatuses } = useQuery<DistrictStatus[]>({
    queryKey: ["/api/district-status"],
  });

  // Fetch students data
  const { data: studentsResponse } = useQuery({
    queryKey: ["/api/students"],
  });

  // Fetch vacancies data
  const { data: vacancies } = useQuery<any[]>({
    queryKey: ["/api/vacancies"],
  });

  // Handle different API response formats
  const students = Array.isArray(studentsResponse) ? studentsResponse : studentsResponse?.students || [];

  // Calculate stream-wise totals
  const streamTotals = students.reduce((acc: any, student: any) => {
    if (!student.stream) return acc;
    acc[student.stream] = (acc[student.stream] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate district-wise, stream-wise breakdown
  const districtBreakdown = districtStatuses?.map(district => {
    const districtStudents = students.filter((s: any) => s.currentDistrict === district.district);
    const streamBreakdown = {
      Medical: districtStudents.filter((s: any) => s.stream === 'Medical').length,
      Commerce: districtStudents.filter((s: any) => s.stream === 'Commerce').length,
      NonMedical: districtStudents.filter((s: any) => s.stream === 'NonMedical').length,
    };

    const studentsWithChoices = districtStudents.filter((s: any) => 
      s.choice1 || s.choice2 || s.choice3 || s.choice4 || s.choice5 ||
      s.choice6 || s.choice7 || s.choice8 || s.choice9 || s.choice10
    );

    const lockedStudents = districtStudents.filter((s: any) => s.isLocked);

    const districtVacancies = vacancies?.filter(v => v.district === district.district) || [];
    const totalSeats = districtVacancies.reduce((sum, v) => sum + (v.totalSeats || 0), 0);

    return {
      ...district,
      students: districtStudents,
      streamBreakdown,
      studentsWithChoices: studentsWithChoices.length,
      lockedStudents: lockedStudents.length,
      choicesPercentage: districtStudents.length > 0 ? (studentsWithChoices.length / districtStudents.length * 100) : 0,
      lockedPercentage: districtStudents.length > 0 ? (lockedStudents.length / districtStudents.length * 100) : 0,
      totalSeats,
    };
  }) || [];

  // Calculate overall metrics
  const totalStudents = students.length;
  const totalStudentsWithChoices = students.filter((s: any) => 
    s.choice1 || s.choice2 || s.choice3 || s.choice4 || s.choice5 ||
    s.choice6 || s.choice7 || s.choice8 || s.choice9 || s.choice10
  ).length;
  const totalLockedStudents = students.filter((s: any) => s.isLocked).length;
  const finalizedDistricts = districtStatuses?.filter(ds => ds.isFinalized).length || 0;
  const totalDistricts = districtStatuses?.length || 0;

  const getStatusIcon = (isFinalized: boolean) => {
    return isFinalized ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-amber-500" />
    );
  };

  const getStatusBadge = (isFinalized: boolean) => {
    return (
      <Badge variant={isFinalized ? "secondary" : "outline"} 
             className={isFinalized ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
        {isFinalized ? "Finalized" : "Pending"}
      </Badge>
    );
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="District Analysis" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Reports" },
          { name: "District Analysis" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="total-students">
                      {totalStudents.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Students</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="students-with-choices">
                      {totalStudentsWithChoices.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">With Preferences</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="finalized-districts">
                      {finalizedDistricts}/{totalDistricts}
                    </p>
                    <p className="text-xs text-muted-foreground">Districts Finalized</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="locked-students">
                      {totalLockedStudents.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Locked Students</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stream-wise Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-primary" />
                Stream-wise Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(streamTotals).map(([stream, count]) => (
                  <div key={stream} className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-2xl font-bold text-primary" data-testid={`stream-${stream.toLowerCase()}-count`}>
                      {(count as number).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">{stream}</p>
                    <p className="text-xs text-muted-foreground">
                      {totalStudents > 0 ? ((count as number / totalStudents * 100)).toFixed(1) : 0}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* District-wise Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-primary" />
                  District-wise Analysis
                </div>
                <Badge variant={finalizedDistricts === totalDistricts ? "default" : "destructive"}>
                  {finalizedDistricts}/{totalDistricts} Finalized
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="streams">Stream Distribution</TabsTrigger>
                  <TabsTrigger value="capacity">Seat Capacity</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-6">
                  <div className="space-y-4">
                    {loadingStatuses ? (
                      <div className="flex items-center justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : (
                      districtBreakdown.map((district) => (
                        <Card key={district.id} className={`border-l-4 ${district.isFinalized ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  {getStatusIcon(!!district.isFinalized)}
                                  <h3 className="font-semibold">{district.district}</h3>
                                  {getStatusBadge(!!district.isFinalized)}
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Total Students:</span>
                                    <p className="font-medium" data-testid={`district-${district.district}-total`}>
                                      {district.students.length.toLocaleString()}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">With Preferences:</span>
                                    <p className="font-medium" data-testid={`district-${district.district}-with-choices`}>
                                      {district.studentsWithChoices} ({district.choicesPercentage.toFixed(1)}%)
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Locked:</span>
                                    <p className="font-medium" data-testid={`district-${district.district}-locked`}>
                                      {district.lockedStudents} ({district.lockedPercentage.toFixed(1)}%)
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Available Seats:</span>
                                    <p className="font-medium" data-testid={`district-${district.district}-seats`}>
                                      {district.totalSeats.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="streams" className="mt-6">
                  <div className="space-y-4">
                    {districtBreakdown.map((district) => (
                      <Card key={`${district.id}-streams`}>
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            {getStatusIcon(!!district.isFinalized)}
                            <h3 className="font-semibold">{district.district}</h3>
                            {getStatusBadge(!!district.isFinalized)}
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            {Object.entries(district.streamBreakdown).map(([stream, count]) => (
                              <div key={stream} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
                                <p className="text-lg font-bold" data-testid={`district-${district.district}-${stream.toLowerCase()}`}>
                                  {count}
                                </p>
                                <p className="text-sm text-muted-foreground">{stream}</p>
                                <p className="text-xs text-muted-foreground">
                                  {district.students.length > 0 ? ((count / district.students.length) * 100).toFixed(1) : 0}%
                                </p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="capacity" className="mt-6">
                  <div className="space-y-4">
                    {districtBreakdown.map((district) => {
                      const demandRatio = district.totalSeats > 0 ? (district.students.length / district.totalSeats) : 0;
                      return (
                        <Card key={`${district.id}-capacity`}>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                {getStatusIcon(!!district.isFinalized)}
                                <h3 className="font-semibold">{district.district}</h3>
                              </div>
                              <Badge variant={demandRatio > 1 ? "destructive" : demandRatio > 0.8 ? "outline" : "secondary"}>
                                {demandRatio > 1 ? "Over-demand" : demandRatio > 0.8 ? "High Demand" : "Normal"}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Students:</span>
                                <p className="font-medium">{district.students.length.toLocaleString()}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Available Seats:</span>
                                <p className="font-medium">{district.totalSeats.toLocaleString()}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Demand Ratio:</span>
                                <p className="font-medium">{demandRatio.toFixed(2)}:1</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Capacity:</span>
                                <p className={`font-medium ${demandRatio > 1 ? 'text-red-600' : 'text-green-600'}`}>
                                  {district.totalSeats > 0 ? ((district.totalSeats / district.students.length) * 100).toFixed(1) : 0}%
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}