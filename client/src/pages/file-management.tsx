import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import FileUploadSection from "@/components/dashboard/file-upload-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Check, X, Clock, Calendar, AlertTriangle, ArrowRight } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export default function FileManagement() {
  
  // Get current session
  const { data: currentSessionData } = useQuery<{ currentSession: string }>({
    queryKey: ["/api/session/current"],
    enabled: true,
  });
  const currentSession = currentSessionData?.currentSession || "";

  // Fetch all files
  const { data: allFiles } = useQuery({
    queryKey: ["/api/files"],
  });

  // Filter files to only show current session
  const files = currentSession 
    ? (allFiles as any[])?.filter((file: any) => file.academicYear === currentSession) || []
    : [];

  // Fetch counseling rounds for current session
  const { data: rounds } = useQuery<any[]>({
    queryKey: ["/api/counseling-rounds", { academicYear: currentSession }],
    enabled: !!currentSession,
    queryFn: async () => {
      if (!currentSession) return [];
      const res = await fetch(`/api/counseling-rounds?academicYear=${currentSession}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const hasRounds = rounds && rounds.length > 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><Check className="w-3 h-3 mr-1" />Processed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'uploaded':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Uploaded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="File Management" 
        breadcrumbs={[
          { name: "Home" },
          { name: "File Management" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        {/* Show message if no rounds exist for current session */}
        {currentSession && !hasRounds && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-amber-900 mb-2">
                    No Counseling Rounds Found
                  </h3>
                  <p className="text-sm text-amber-800 mb-4">
                    No counseling rounds have been created for the current session ({currentSession}). 
                    Please create counseling rounds before uploading files.
                  </p>
                  <Button
                    onClick={() => window.location.href = '/counseling-rounds'}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Go to Counseling Rounds
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <FileUploadSection />
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" />
                Upload History
                {currentSession && (
                  <Badge variant="outline" className="ml-2">
                    {currentSession}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Showing files for current session only
              </p>
            </CardHeader>
            <CardContent>
              {files?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Academic Year</TableHead>
                      <TableHead>Counseling Round</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file: any) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium" data-testid={`file-${file.id}`}>
                          {file.originalName}
                          {file.validationResults?.errors?.length > 0 && (
                            <p className="text-xs text-red-600 mt-1">
                              {file.validationResults.errors[0]}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {file.type === 'student_choices' ? 'Student Choices' :
                             file.type === 'vacancies' ? 'Vacancies' :
                             file.type === 'entrance_results' ? 'Entrance Results' :
                             file.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {file.academicYear ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span className="text-sm">{file.academicYear}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {file.counselingRoundId ? (
                            <span className="text-xs text-muted-foreground">
                              Round {file.counselingRoundNumber || 'N/A'}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(file.status)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-2">
                    {currentSession 
                      ? `No files uploaded yet for ${currentSession}`
                      : "No files uploaded yet"}
                  </p>
                  {!hasRounds && currentSession && (
                    <p className="text-xs text-amber-600">
                      Create counseling rounds first to upload files
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
