import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  BarChart3, 
  Users, 
  MapPin, 
  CheckCircle, 
  AlertTriangle,
  TrendingUp,
  Clock,
  X,
  Check
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { DistrictStatus, Student, UnfinalizeRequest } from "@shared/schema";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function DistrictAnalysis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch district statuses
  const { data: districtStatuses, isLoading: loadingStatuses } = useQuery<DistrictStatus[]>({
    queryKey: ["/api/district-status"],
  });

  const unfinalizeMutation = useMutation({
    mutationFn: async (district: string) => {
      await apiRequest("POST", `/api/district-status/${encodeURIComponent(district)}/unfinalize`);
    },
    onSuccess: () => {
      toast({
        title: "District Unfinalized",
        description: "The district has been unlocked and can now be edited by its district administrator.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/district-status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Unfinalize",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reviewRequestMutation = useMutation({
    mutationFn: async ({ id, status, reviewComments }: { id: string | number; status: 'approved' | 'rejected', reviewComments: string }) => {
      await apiRequest("POST", `/api/unfinalize-requests/${id}/review`, { status, reviewComments });
    },
    onSuccess: (_, variables) => {
      toast({
        title: `Request ${variables.status === 'approved' ? 'Approved' : 'Rejected'}`,
        description: variables.status === 'approved' ? "The district has been unfinalized." : "The request was rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/unfinalize-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/district-status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to process request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: unfinalizeRequests } = useQuery<UnfinalizeRequest[]>({
    queryKey: ["/api/unfinalize-requests"],
  });

  // Fetch students data
  const { data: studentsResponse } = useQuery<{ students: Student[] } | Student[]>({
    queryKey: ["/api/students?limit=50000"],
  });

  // Fetch vacancies data
  const { data: vacancies } = useQuery<any[]>({
    queryKey: ["/api/vacancies"],
  });

  // Handle different API response formats
  const students = Array.isArray(studentsResponse) ? studentsResponse : (studentsResponse as any)?.students || [];

  // Calculate stream-wise totals (only for students with preferences)
  const streamTotals = students.reduce((acc: any, student: any) => {
    if (!student.stream || !student.choice1) return acc;
    const stream = student.stream === 'Non-Medical' ? 'NonMedical' : student.stream;
    acc[stream] = (acc[stream] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate district-wise, stream-wise breakdown
  const districtBreakdown = districtStatuses?.map(district => {
    const districtStudents = students.filter((s: any) => s.counselingDistrict === district.district);
    const studentsWithChoices = districtStudents.filter((s: any) => 
      s.choice1 || s.choice2 || s.choice3 || s.choice4 || s.choice5 ||
      s.choice6 || s.choice7 || s.choice8 || s.choice9 || s.choice10
    );

    const streamBreakdown = {
      Medical: studentsWithChoices.filter((s: any) => s.stream === 'Medical').length,
      Commerce: studentsWithChoices.filter((s: any) => s.stream === 'Commerce').length,
      NonMedical: studentsWithChoices.filter((s: any) => s.stream === 'NonMedical' || s.stream === 'Non-Medical').length,
    };

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
  const totalStudents = students.filter((s: any) => s.counselingDistrict).length;
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

  const getFinalizationBadge = (isFinalized: boolean) => {
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

          {/* Pending Unfinalize Requests */}
          {unfinalizeRequests && unfinalizeRequests.filter(r => r.status === 'pending').length > 0 && (
            <Card className="border-amber-200 shadow-sm">
              <CardHeader className="bg-amber-50 pb-4 border-b border-amber-100">
                <CardTitle className="flex items-center text-amber-800 text-lg">
                  <AlertTriangle className="w-5 h-5 mr-2 text-amber-600" />
                  Pending Unfinalize Requests
                  <Badge variant="secondary" className="ml-2 bg-amber-200 text-amber-800 hover:bg-amber-200">
                    {unfinalizeRequests.filter(r => r.status === 'pending').length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-amber-100">
                  {unfinalizeRequests.filter(r => r.status === 'pending').map((request) => (
                    <div key={request.id} className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-amber-50/50 transition-colors">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-base">{request.district}</h4>
                          <span className="text-xs text-muted-foreground flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {request.createdAt ? formatDistanceToNow(new Date(request.createdAt), { addSuffix: true }) : 'Just now'}
                          </span>
                        </div>
                        <div className="text-sm bg-white p-3 rounded border border-amber-100 mt-2">
                          <span className="font-medium text-amber-900 block mb-1">Reason provided:</span>
                          <span className="text-gray-700">{request.reason}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 md:self-stretch md:items-center">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              disabled={reviewRequestMutation.isPending}
                            >
                              <X className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reject Unfinalize Request</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to reject this request from {request.district}?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => reviewRequestMutation.mutate({ 
                                  id: request.id, 
                                  status: 'rejected',
                                  reviewComments: 'Rejected by Central Admin'
                                })}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Reject Request
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700 text-white"
                              disabled={reviewRequestMutation.isPending}
                            >
                              <Check className="w-4 h-4 mr-1" /> Approve & Unfinalize
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Approve Unfinalize Request</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will approve the request and unfinalize {request.district}, allowing the district admin to resume modifying preferences.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => reviewRequestMutation.mutate({ 
                                  id: request.id, 
                                  status: 'approved',
                                  reviewComments: 'Approved by Central Admin'
                                })}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Approve Request
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Infographic Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-primary" />
                  Stream Distribution (Chart)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Object.entries(streamTotals).map(([name, value]) => ({ name, value }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" name="Students" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-primary" />
                  District Finalization Status
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[260px] flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Finalized', value: finalizedDistricts },
                        { name: 'Pending', value: totalDistricts - finalizedDistricts },
                      ]}
                      cx="50%" cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={90}
                      dataKey="value"
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#f59e0b" />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

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
                                  {getFinalizationBadge(!!district.isFinalized)}
                                  {district.isFinalized && district.finalizedAt && (
                                    <div className="flex items-center text-xs text-muted-foreground">
                                      <Clock className="w-3 h-3 mr-1" />
                                      {formatDistanceToNow(new Date(district.finalizedAt), { addSuffix: true })}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="ml-4 flex-shrink-0">
                                {district.isFinalized && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        disabled={unfinalizeMutation.isPending && unfinalizeMutation.variables === district.district}
                                      >
                                        {unfinalizeMutation.isPending && unfinalizeMutation.variables === district.district ? 'Unfinalizing...' : 'Unfinalize'}
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will unfinalize the district {district.district} and allow the district admin to edit student preferences again.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => unfinalizeMutation.mutate(district.district)}
                                          className="bg-red-600 hover:bg-red-700 text-white"
                                          disabled={unfinalizeMutation.isPending}
                                        >
                                          Confirm Unfinalize
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            </div>
                                
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
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
                            {getFinalizationBadge(!!district.isFinalized)}
                            {district.isFinalized && district.finalizedAt && (
                              <div className="flex items-center text-xs text-muted-foreground">
                                <Clock className="w-3 h-3 mr-1" />
                                {formatDistanceToNow(new Date(district.finalizedAt), { addSuffix: true })}
                              </div>
                            )}
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
                                {district.isFinalized && district.finalizedAt && (
                                  <div className="flex items-center text-xs text-muted-foreground">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {formatDistanceToNow(new Date(district.finalizedAt), { addSuffix: true })}
                                  </div>
                                )}
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