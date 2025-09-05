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
  BarChart3 
} from "lucide-react";

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

  const { data: students } = useQuery<any[]>({
    queryKey: ["/api/students"],
  });

  const { data: vacancies } = useQuery<any[]>({
    queryKey: ["/api/vacancies"],
  });

  const { data: entranceResults } = useQuery<any[]>({
    queryKey: ["/api/students-entrance-results"],
  });

  const studentFile = files?.find((f: any) => f.type === 'student_choices' && f.status === 'processed');
  const vacancyFile = files?.find((f: any) => f.type === 'vacancies' && f.status === 'processed');
  const entranceFile = files?.find((f: any) => f.type === 'entrance_results' && f.status === 'processed');

  // Enhanced validation checks
  const hasValidStudents = students && students.length > 0;
  const hasValidVacancies = vacancies && vacancies.length > 0;
  const hasValidEntranceResults = entranceResults && entranceResults.length > 0;
  
  // Check if students have valid preferences and match entrance results
  const studentsWithValidChoices = students?.filter((s: any) => s.choice1 || s.choice2 || s.choice3)?.length || 0;
  const studentsMatchingEntrance = students?.filter((s: any) => 
    entranceResults?.some((er: any) => er.applicationNo === s.appNo)
  )?.length || 0;

  // Check vacancy coverage for all districts and categories
  const requiredDistricts = 22; // Punjab has 22 districts
  const availableDistricts = new Set(vacancies?.map((v: any) => v.district))?.size || 0;
  
  const canRunAllocation = studentFile && vacancyFile && entranceFile && 
                          hasValidStudents && hasValidVacancies && hasValidEntranceResults &&
                          studentsMatchingEntrance > 0 && availableDistricts >= requiredDistricts &&
                          !allocationStatus?.completed;

  const preflightChecks = [
    {
      title: "Entrance Results File",
      status: entranceFile ? "complete" : "missing",
      description: entranceFile 
        ? `${entranceFile.originalName} - ${entranceResults?.length || 0} students with merit numbers`
        : "Upload entrance results file with merit numbers",
      icon: entranceFile ? Check : AlertTriangle,
      color: entranceFile ? "text-green-500" : "text-red-500",
    },
    {
      title: "Student Choices File",
      status: studentFile ? "complete" : "missing",
      description: studentFile 
        ? `${studentFile.originalName} - ${studentsWithValidChoices} students with preferences`
        : "Upload student choices file with district preferences",
      icon: studentFile ? Check : AlertTriangle,
      color: studentFile ? "text-green-500" : "text-red-500",
    },
    {
      title: "Vacancy Data File", 
      status: vacancyFile ? "complete" : "missing",
      description: vacancyFile
        ? `${vacancyFile.originalName} - ${availableDistricts} districts covered`
        : "Upload vacancy data file with district-wise seats",
      icon: vacancyFile ? Check : AlertTriangle,
      color: vacancyFile ? "text-green-500" : "text-red-500",
    },
    {
      title: "Student-Merit Data Matching",
      status: studentsMatchingEntrance > 0 ? "complete" : studentsMatchingEntrance === 0 && hasValidStudents && hasValidEntranceResults ? "error" : "pending",
      description: studentsMatchingEntrance > 0 
        ? `${studentsMatchingEntrance} students matched with entrance results`
        : studentsMatchingEntrance === 0 && hasValidStudents && hasValidEntranceResults
        ? "No students match between choices and entrance results - check Application Numbers"
        : "Waiting for student data upload",
      icon: studentsMatchingEntrance > 0 ? Check : studentsMatchingEntrance === 0 && hasValidStudents && hasValidEntranceResults ? AlertTriangle : Clock,
      color: studentsMatchingEntrance > 0 ? "text-green-500" : studentsMatchingEntrance === 0 && hasValidStudents && hasValidEntranceResults ? "text-red-500" : "text-amber-500",
    },
    {
      title: "District Coverage Validation",
      status: availableDistricts >= requiredDistricts ? "complete" : availableDistricts > 0 ? "warning" : "pending",
      description: availableDistricts >= requiredDistricts
        ? `All ${requiredDistricts} Punjab districts covered`
        : availableDistricts > 0
        ? `Only ${availableDistricts}/${requiredDistricts} districts covered - some students may not get allocated`
        : "Waiting for vacancy data",
      icon: availableDistricts >= requiredDistricts ? Check : availableDistricts > 0 ? AlertTriangle : Clock,
      color: availableDistricts >= requiredDistricts ? "text-green-500" : availableDistricts > 0 ? "text-amber-500" : "text-amber-500",
    },
    {
      title: "Data Integrity Check",
      status: hasValidStudents && hasValidVacancies && hasValidEntranceResults ? "complete" : "pending",
      description: hasValidStudents && hasValidVacancies && hasValidEntranceResults
        ? "All data files contain valid records"
        : "Waiting for complete data validation",
      icon: hasValidStudents && hasValidVacancies && hasValidEntranceResults ? Check : Clock,
      color: hasValidStudents && hasValidVacancies && hasValidEntranceResults ? "text-green-500" : "text-amber-500",
    },
    {
      title: "Allocation Status",
      status: allocationStatus?.completed ? "complete" : "ready",
      description: allocationStatus?.completed
        ? "Allocation has been completed successfully"
        : canRunAllocation ? "Ready to run allocation process" : "Prerequisites not met",
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
