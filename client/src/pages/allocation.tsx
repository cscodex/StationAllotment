import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import AllocationModal from "@/components/modals/allocation-modal";
import { 
  Settings, 
  Play, 
  Check, 
  Clock, 
  AlertTriangle, 
  Users, 
  MapPin,
  BarChart3,
  Shield
} from "lucide-react";
import type { DistrictStatus } from "@shared/schema";

export default function Allocation() {
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allocationStatus } = useQuery<any>({
    queryKey: ["/api/allocation/status"],
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: files } = useQuery<any[]>({
    queryKey: ["/api/files"],
  });

  const { data: studentsResponse } = useQuery<any>({
    queryKey: ["/api/students"],
  });

  const { data: vacancies } = useQuery<any[]>({
    queryKey: ["/api/vacancies"],
  });

  const { data: entranceResultsResponse } = useQuery<any>({
    queryKey: ["/api/students-entrance-results"],
  });

  // Fetch district statuses for finalization check
  const { data: districtStatuses } = useQuery<DistrictStatus[]>({
    queryKey: ["/api/district-status"],
  });

  const studentFile = files?.find((f: any) => f.type === 'student_choices' && f.status === 'processed');
  const vacancyFile = files?.find((f: any) => f.type === 'vacancies' && f.status === 'processed');
  const entranceFile = files?.find((f: any) => f.type === 'entrance_results' && f.status === 'processed');

  // Handle different API response formats
  const students = Array.isArray(studentsResponse) ? studentsResponse : studentsResponse?.students || [];
  const entranceResults = Array.isArray(entranceResultsResponse) ? entranceResultsResponse : entranceResultsResponse?.students || [];

  // Minimum data requirements for allocation
  const hasEntranceResults = entranceResults && entranceResults.length > 0;
  const hasVacancyData = vacancies && vacancies.length > 0;
  const totalVacancySeats = vacancies?.reduce((sum: number, v: any) => sum + (v.totalSeats || 0), 0) || 0;
  
  // Check if students have valid preferences (stream and at least one district choice)
  const studentsWithCompleteData = students?.filter((s: any) => {
    // Must have stream and at least one district choice
    const hasStream = s.stream && ['Medical', 'Commerce', 'NonMedical'].includes(s.stream);
    const hasDistrictChoice = s.choice1 || s.choice2 || s.choice3 || s.choice4 || s.choice5 || 
                             s.choice6 || s.choice7 || s.choice8 || s.choice9 || s.choice10;
    return hasStream && hasDistrictChoice;
  })?.length || 0;
  
  // Check if students exist in entrance results (for merit-based allocation)
  const studentsWithMeritData = students?.filter((s: any) => 
    entranceResults?.some((er: any) => er.applicationNo === s.appNo && er.meritNo)
  )?.length || 0;

  // District finalization checks
  const totalDistricts = districtStatuses?.length || 0;
  const finalizedDistricts = districtStatuses?.filter(ds => ds.isFinalized).length || 0;
  const allDistrictsFinalized = totalDistricts > 0 && finalizedDistricts === totalDistricts;
  const pendingDistricts = districtStatuses?.filter(ds => !ds.isFinalized) || [];

  // Minimum requirements for allocation
  const canRunAllocation = hasEntranceResults && // At least one entrance result
                          hasVacancyData && totalVacancySeats > 0 && // At least one vacancy seat
                          studentsWithCompleteData > 0 && // At least one student with complete data
                          studentsWithMeritData > 0 && // Students must have merit data
                          allDistrictsFinalized && // All districts must be finalized
                          !allocationStatus?.completed; // Not already completed

  const preflightChecks = [
    {
      title: "Entrance Results Data",
      status: hasEntranceResults ? "complete" : "missing",
      description: hasEntranceResults 
        ? `${entranceResults?.length || 0} entrance results with merit numbers available`
        : "No entrance results found - upload entrance results file first",
      icon: hasEntranceResults ? Check : AlertTriangle,
      color: hasEntranceResults ? "text-green-500" : "text-red-500",
    },
    {
      title: "Vacancy Seat Availability",
      status: hasVacancyData && totalVacancySeats > 0 ? "complete" : "missing",
      description: hasVacancyData && totalVacancySeats > 0
        ? `${totalVacancySeats} total seats available across districts`
        : "No vacancy seats found - upload vacancy data file first",
      icon: hasVacancyData && totalVacancySeats > 0 ? Check : AlertTriangle,
      color: hasVacancyData && totalVacancySeats > 0 ? "text-green-500" : "text-red-500",
    },
    {
      title: "Student Choice Data", 
      status: studentsWithCompleteData > 0 ? "complete" : "missing",
      description: studentsWithCompleteData > 0
        ? `${studentsWithCompleteData} students have stream and district preferences set`
        : "No students found with complete stream and district choice data",
      icon: studentsWithCompleteData > 0 ? Check : AlertTriangle,
      color: studentsWithCompleteData > 0 ? "text-green-500" : "text-red-500",
    },
    {
      title: "Merit-Based Matching",
      status: studentsWithMeritData > 0 ? "complete" : studentsWithCompleteData > 0 && hasEntranceResults ? "error" : "pending",
      description: studentsWithMeritData > 0 
        ? `${studentsWithMeritData} students matched with entrance merit data`
        : studentsWithCompleteData > 0 && hasEntranceResults
        ? "Students found but no merit matching - check application numbers between student choices and entrance results"
        : "Waiting for student choice and entrance result data",
      icon: studentsWithMeritData > 0 ? Check : studentsWithCompleteData > 0 && hasEntranceResults ? AlertTriangle : Clock,
      color: studentsWithMeritData > 0 ? "text-green-500" : studentsWithCompleteData > 0 && hasEntranceResults ? "text-red-500" : "text-amber-500",
    },
    {
      title: "District Data Finalization",
      status: allDistrictsFinalized ? "complete" : totalDistricts > 0 ? "error" : "pending",
      description: allDistrictsFinalized 
        ? `✓ All ${totalDistricts} districts have finalized their student data`
        : totalDistricts > 0
        ? `⚠️ ${finalizedDistricts}/${totalDistricts} districts finalized. Pending: ${pendingDistricts.map(d => d.district).slice(0, 3).join(', ')}${pendingDistricts.length > 3 ? ` (+${pendingDistricts.length - 3} more)` : ''}`
        : "No district data found - districts must finalize their student preferences first",
      icon: allDistrictsFinalized ? Check : totalDistricts > 0 ? AlertTriangle : Clock,
      color: allDistrictsFinalized ? "text-green-500" : totalDistricts > 0 ? "text-red-500" : "text-amber-500",
    },
    {
      title: "Minimum Allocation Data",
      status: hasEntranceResults && hasVacancyData && studentsWithCompleteData > 0 && allDistrictsFinalized ? "complete" : "pending",
      description: hasEntranceResults && hasVacancyData && studentsWithCompleteData > 0 && allDistrictsFinalized
        ? "All minimum data requirements met for allocation process"
        : "Required: entrance results + vacancy data + student preferences + all district admins must finalize",
      icon: hasEntranceResults && hasVacancyData && studentsWithCompleteData > 0 && allDistrictsFinalized ? Check : Clock,
      color: hasEntranceResults && hasVacancyData && studentsWithCompleteData > 0 && allDistrictsFinalized ? "text-green-500" : "text-amber-500",
    },
    {
      title: "Allocation Process",
      status: allocationStatus?.completed ? "complete" : canRunAllocation ? "ready" : "pending",
      description: allocationStatus?.completed
        ? "Seat allocation has been completed successfully"
        : canRunAllocation 
        ? "Ready to run allocation - all minimum requirements met"
        : "Prerequisites not met - need minimum data before allocation",
      icon: allocationStatus?.completed ? Check : canRunAllocation ? Clock : AlertTriangle,
      color: allocationStatus?.completed ? "text-green-500" : canRunAllocation ? "text-blue-500" : "text-amber-500",
    },
  ];

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Run Allocation" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Operations" },
          { name: "Run Allocation" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Allocation Controls */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="w-5 h-5 mr-2 text-primary" />
                  Allocation Process
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Run the seat allocation algorithm to assign students to districts based on merit and preferences
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {allocationStatus?.completed ? (
                  <div className="text-center p-8 bg-green-50 rounded-lg border border-green-200">
                    <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-green-800 mb-2">
                      Allocation Completed
                    </h3>
                    <p className="text-sm text-green-600">
                      The seat allocation process has been completed successfully. 
                      You can now export the results.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <h3 className="font-semibold">Pre-flight Checks</h3>
                      {preflightChecks.map((check, index) => (
                        <div key={index} className="flex items-start space-x-3 p-3 border border-border rounded-lg">
                          <check.icon className={`w-5 h-5 mt-0.5 ${check.color}`} />
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <p className="font-medium">{check.title}</p>
                              <Badge 
                                variant={check.status === 'complete' ? 'secondary' : check.status === 'missing' ? 'destructive' : 'outline'}
                                className={check.status === 'complete' ? 'bg-green-100 text-green-800' : ''}
                              >
                                {check.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{check.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex space-x-4">
                      <Button 
                        onClick={() => setShowAllocationModal(true)}
                        disabled={!canRunAllocation}
                        className="flex-1"
                        data-testid="button-run-allocation"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        {canRunAllocation ? "Run Allocation" : "Requirements Not Met"}
                      </Button>
                      
                      {!canRunAllocation && (
                        <Button 
                          variant="outline" 
                          onClick={() => window.location.href = '/file-management'}
                          data-testid="button-upload-files"
                        >
                          Upload Files
                        </Button>
                      )}
                    </div>

                    {!canRunAllocation && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start space-x-2">
                          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-amber-800">Action Required</h4>
                            <p className="text-sm text-amber-700">
                              Please upload and validate both student choices and vacancy data files before running the allocation.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Current Data Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Current Data Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <Users className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-blue-700" data-testid="total-students-count">
                      {stats?.totalStudents || 0}
                    </p>
                    <p className="text-sm text-blue-600">Total Students</p>
                  </div>
                  
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <MapPin className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-green-700" data-testid="total-vacancies-count">
                      {stats?.totalVacancies || 0}
                    </p>
                    <p className="text-sm text-green-600">Total Vacancies</p>
                  </div>
                  
                  <div className="text-center p-4 bg-amber-50 rounded-lg">
                    <BarChart3 className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-amber-700" data-testid="pending-allocations-count">
                      {stats?.pendingAllocations || 0}
                    </p>
                    <p className="text-sm text-amber-600">Pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Algorithm Information */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Allocation Algorithm</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Process Overview</h4>
                  <ol className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">1</span>
                      <span>Students sorted by Merit Number (ascending = higher merit first)</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">2</span>
                      <span>Check choices in order (Choice1 → Choice10)</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">3</span>
                      <span>Assign to first available choice with vacancy</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">4</span>
                      <span>Mark as "Not Allotted" if no choices available</span>
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Important Notes</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Allocation can only be run once</li>
                    <li>• Process is irreversible</li>
                    <li>• Results will be generated for export</li>
                    <li>• All actions are logged for audit</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <AllocationModal 
          open={showAllocationModal} 
          onOpenChange={setShowAllocationModal} 
        />
      </main>
    </div>
  );
}
