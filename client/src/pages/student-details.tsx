import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, GraduationCap, MapPin, CheckCircle, XCircle } from "lucide-react";
import type { Student } from "@shared/schema";

export default function StudentDetails() {
  const params = useParams();
  const studentId = params.id as string;

  const { data: student, isLoading } = useQuery<Student>({
    queryKey: [`/api/students/${studentId}`],
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Student Details" />
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </main>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Student Details" />
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">Student not found</p>
            <Link href="/students">
              <Button className="mt-4">Back to Students</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const choices = [
    student.choice1,
    student.choice2,
    student.choice3,
    student.choice4,
    student.choice5,
    student.choice6,
    student.choice7,
    student.choice8,
    student.choice9,
    student.choice10,
  ].filter(Boolean) as string[];

  const getChoiceStatus = (choice: string) => {
    if (student.allottedDistrict === choice) {
      return { status: 'allocated', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    }
    return { status: 'not-allocated', color: 'bg-gray-100 text-gray-600', icon: XCircle };
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Student Details"
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Students", href: "/students" },
          { name: student.name }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back Button */}
          <Link href="/students">
            <Button variant="outline" data-testid="button-back-students" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Students
            </Button>
          </Link>
          {/* Student Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2 text-primary" />
                Student Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Application Number</p>
                  <p className="font-medium" data-testid="text-app-no">{student.appNo}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Merit Number</p>
                  <p className="font-medium" data-testid="text-merit-no">{student.meritNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium" data-testid="text-student-name">{student.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Stream</p>
                  <Badge variant="secondary" className="font-medium" data-testid="badge-stream">
                    <GraduationCap className="w-3 h-3 mr-1" />
                    {student.stream}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Allocation Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-primary" />
                Allocation Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge 
                    variant={student.allocationStatus === 'allotted' ? 'default' : 'secondary'}
                    className={
                      student.allocationStatus === 'allotted' 
                        ? 'bg-green-100 text-green-800' 
                        : student.allocationStatus === 'not_allotted' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-amber-100 text-amber-800'
                    }
                    data-testid="badge-allocation-status"
                  >
                    {student.allocationStatus === 'allotted' ? 'Allocated' : 
                     student.allocationStatus === 'not_allotted' ? 'Not Allocated' : 'Pending'}
                  </Badge>
                </div>
                {student.allottedDistrict && (
                  <div>
                    <p className="text-sm text-muted-foreground">Allocated Station</p>
                    <p className="font-medium flex items-center" data-testid="text-allocated-station">
                      <MapPin className="w-4 h-4 mr-1 text-primary" />
                      {student.allottedDistrict}
                    </p>
                  </div>
                )}
                {student.allottedStream && (
                  <div>
                    <p className="text-sm text-muted-foreground">Allocated Stream</p>
                    <Badge variant="secondary" className="font-medium" data-testid="badge-allocated-stream">
                      {student.allottedStream}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* District Choices */}
          <Card>
            <CardHeader>
              <CardTitle>District Preferences</CardTitle>
              <p className="text-sm text-muted-foreground">
                Student's preferences in order of priority
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {choices.map((choice, index) => {
                  const { status, color, icon: StatusIcon } = getChoiceStatus(choice);
                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        student.allottedDistrict === choice
                          ? 'border-green-200 bg-green-50'
                          : 'border-border bg-card'
                      }`}
                      data-testid={`choice-${index + 1}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-xs text-muted-foreground mr-2">
                            {index + 1}.
                          </span>
                          <span className="font-medium">{choice}</span>
                        </div>
                        {student.allottedDistrict === choice && (
                          <StatusIcon className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {choices.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No district preferences recorded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}