import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Check, Eye, X, Download, Calendar, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DataPreviewModal } from "@/components/ui/data-preview-modal";
import { AcademicYearSelector } from "@/components/ui/academic-year-selector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Student, Vacancy } from "@shared/schema";

interface CounselingRound {
  id: string;
  academicYear: string;
  roundNumber: number;
  roundName: string | null;
  isActive: boolean;
  isCompleted: boolean;
}

export default function FileUploadSection() {
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showValidationPreview, setShowValidationPreview] = useState(false);
  const [showColumnRequirements, setShowColumnRequirements] = useState(false);
  const [columnRequirementsType, setColumnRequirementsType] = useState<'entrance-results' | 'students' | 'vacancies' | null>(null);
  const [pendingFile, setPendingFile] = useState<{file: File, type: string, validationResults: any} | null>(null);
  const [currentUploadId, setCurrentUploadId] = useState<string | undefined>(undefined);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>("");
  const [selectedCounselingTitle, setSelectedCounselingTitle] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const studentFileRef = useRef<HTMLInputElement>(null);
  const vacancyFileRef = useRef<HTMLInputElement>(null);
  const entranceResultsFileRef = useRef<HTMLInputElement>(null);

  // Get current session
  const { data: currentSessionData } = useQuery<{ currentSession: string }>({
    queryKey: ["/api/session/current"],
    enabled: true,
  });
  const currentSession = currentSessionData?.currentSession || "";

  // Set default academic year to current session and lock it
  useEffect(() => {
    if (currentSession) {
      setSelectedAcademicYear(currentSession);
    }
  }, [currentSession]);

  // Fetch counseling rounds for selected academic year
  const { data: rounds } = useQuery<CounselingRound[]>({
    queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }],
    enabled: !!selectedAcademicYear,
    queryFn: async () => {
      if (!selectedAcademicYear) return [];
      const res = await fetch(`/api/counseling-rounds?academicYear=${selectedAcademicYear}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch student data for preview
  const { data: studentsData } = useQuery<Student[]>({
    queryKey: ["/api/students", { allocated: true }],
    enabled: showPreview,
  });

  // Fetch vacancy data for preview  
  const { data: vacanciesData } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies"],
    enabled: showPreview,
  });

  // File validation mutations (don't save to database)
  const validateFileMutation = useMutation({
    mutationFn: async ({file, type}: {file: File, type: string}) => {
      if (!selectedAcademicYear) {
        throw new Error("Please select an academic year");
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('academicYear', selectedAcademicYear);
      // Note: roundName is not needed for validation, only for actual upload
      const response = await fetch(`/api/files/validate/${type}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      setPendingFile({
        file: variables.file,
        type: variables.type,
        validationResults: data
      });
      setShowValidationPreview(true);
    },
    onError: (error) => {
      toast({
        title: "Validation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadStudentsMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedAcademicYear) {
        throw new Error("Please select an academic year");
      }
      if (!selectedCounselingTitle) {
        throw new Error("Please select a counseling title");
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('academicYear', selectedAcademicYear);
      formData.append('roundName', selectedCounselingTitle);
      const response = await fetch('/api/files/upload/students', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onMutate: async () => {
      // Set uploadId will be set from response
    },
    onSuccess: (data) => {
      // Set uploadId from response to track progress (even if upload is mostly done)
      if (data.id) {
        setCurrentUploadId(data.id);
        // Clear after a delay to allow progress to be displayed
        setTimeout(() => setCurrentUploadId(undefined), 2000);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: "File uploaded successfully",
        description: data.validationResults?.message || "Student choices file processed",
      });
      setPendingFile(null);
      setShowValidationPreview(false);
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadVacanciesMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedAcademicYear) {
        throw new Error("Please select an academic year");
      }
      if (!selectedCounselingTitle) {
        throw new Error("Please select a counseling title");
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('academicYear', selectedAcademicYear);
      formData.append('roundName', selectedCounselingTitle);
      const response = await fetch('/api/files/upload/vacancies', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Set uploadId from response to track progress (even if upload is mostly done)
      if (data.id) {
        setCurrentUploadId(data.id);
        // Clear after a delay to allow progress to be displayed
        setTimeout(() => setCurrentUploadId(undefined), 2000);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
      toast({
        title: "File uploaded successfully", 
        description: data.validationResults?.message || "Vacancy data file processed",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadEntranceResultsMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedAcademicYear) {
        throw new Error("Please select an academic year");
      }
      if (!selectedCounselingTitle) {
        throw new Error("Please select a counseling title");
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('academicYear', selectedAcademicYear);
      formData.append('roundName', selectedCounselingTitle);
      const response = await fetch('/api/files/upload/entrance-results', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Set uploadId from response to track progress (even if upload is mostly done)
      if (data.id) {
        setCurrentUploadId(data.id);
        // Clear after a delay to allow progress to be displayed
        setTimeout(() => setCurrentUploadId(undefined), 2000);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students-entrance-results"] });
      toast({
        title: "File uploaded successfully",
        description: data.validationResults?.message || "Entrance results file processed",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadEntranceResultsTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/files/template/entrance-results', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download template');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'entrance_results_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "Template downloaded",
        description: "Entrance results template has been downloaded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadStudentChoicesTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/files/template/student-choices', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download template');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'student_choices_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "Template downloaded",
        description: "Student choices template has been downloaded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadVacanciesTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/files/template/vacancies', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download template');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'vacancies_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "Template downloaded",
        description: "Vacancies template has been downloaded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadVacanciesTestDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/files/test-data/vacancies', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download test data');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'vacancies_test_data.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "Test data downloaded",
        description: "Vacancies test data has been downloaded successfully. You can now upload this file to test the system.",
      });
    },
    onError: (error) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadEntranceResultsTestDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/files/test-data/entrance-results', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download test data');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'entrance_results_test_data.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "Test data downloaded",
        description: "Entrance results test data has been downloaded successfully. You can now upload this file to test the system.",
      });
    },
    onError: (error) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadStudentChoicesTestDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/files/test-data/student-choices', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download test data');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'student_choices_test_data.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "Test data downloaded",
        description: "Student choices test data has been downloaded successfully. You can now upload this file to test the system.",
      });
    },
    onError: (error) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent, type: 'students' | 'vacancies' | 'entrance-results') => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0], type);
    }
  };

  const handleFileUpload = (file: File, type: 'students' | 'vacancies' | 'entrance-results') => {
    // First validate the file without saving to database
    validateFileMutation.mutate({file, type});
  };

  const handleConfirmUpload = () => {
    if (!pendingFile) return;
    
    // Now actually upload and save to database
    if (pendingFile.type === 'students') {
      uploadStudentsMutation.mutate(pendingFile.file);
    } else if (pendingFile.type === 'vacancies') {
      uploadVacanciesMutation.mutate(pendingFile.file);
    } else {
      uploadEntranceResultsMutation.mutate(pendingFile.file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'students' | 'vacancies' | 'entrance-results') => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0], type);
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Upload className="w-5 h-5 mr-2 text-primary" />
          File Management
        </CardTitle>
        <p className="text-sm text-muted-foreground">Upload entrance results, student choices and vacancy data</p>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Show message if no rounds exist */}
        {currentSession && selectedAcademicYear === currentSession && rounds && rounds.length === 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-amber-900 mb-1">No Counseling Rounds Found</h4>
                <p className="text-sm text-amber-800 mb-3">
                  No counseling rounds have been created for {currentSession}. Please create counseling rounds before uploading files.
                </p>
                <Button
                  size="sm"
                  onClick={() => window.location.href = '/counseling-rounds'}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Go to Counseling Rounds
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Academic Year Selector - Locked to Current Session */}
        <div className="p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4" />
            <label className="text-sm font-medium">Academic Year</label>
            {currentSession && (
              <Badge variant="outline" className="ml-auto">
                Current Session
              </Badge>
            )}
          </div>
          {currentSession ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-background border rounded-md">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{currentSession}</span>
                <Badge variant="secondary" className="ml-auto">Locked</Badge>
              </div>
              <input type="hidden" value={currentSession} />
            </div>
          ) : (
            <AcademicYearSelector
              value={selectedAcademicYear}
              onValueChange={(year) => {
                setSelectedAcademicYear(year);
                setSelectedCounselingTitle(null);
              }}
              showLabel={false}
              className="max-w-xs"
            />
          )}
          {currentSession && (
            <p className="text-xs text-muted-foreground mt-2">
              Files will be associated with the selected counseling round for {currentSession} (or active round if none selected)
            </p>
          )}
          {!currentSession && (
            <p className="text-xs text-amber-600 mt-2">
              Waiting for current session information...
            </p>
          )}
        </div>

        {/* Counseling Round Selector */}
        {selectedAcademicYear && rounds && rounds.length > 0 && (
          <div className="p-4 bg-muted rounded-lg">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Counseling Title <span className="text-red-500">*</span></Label>
                <Select
                  value={selectedCounselingTitle || undefined}
                  onValueChange={(value) => {
                    setSelectedCounselingTitle(value);
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select counseling title (required)" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(rounds.map(r => r.roundName).filter(Boolean))).map((title) => (
                      <SelectItem key={title} value={title || "unknown"}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Files must be associated with a specific counseling title
                </p>
              </div>

            </div>
          </div>
        )}

        {/* Entrance Results Upload */}
        {selectedCounselingTitle && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">Student Entrance Results</label>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setColumnRequirementsType('entrance-results');
                  setShowColumnRequirements(true);
                }}
                title="Preview column requirements"
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadEntranceResultsTemplateMutation.mutate()}
                disabled={downloadEntranceResultsTemplateMutation.isPending}
                data-testid="button-download-entrance-template"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadEntranceResultsTemplateMutation.isPending ? 'Downloading...' : 'Download Template'}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => downloadEntranceResultsTestDataMutation.mutate()}
                disabled={downloadEntranceResultsTestDataMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadEntranceResultsTestDataMutation.isPending ? 'Downloading...' : 'Download Test Data'}
              </Button>
            </div>
          </div>
          <div 
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              isDragging ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'entrance-results')}
            onClick={() => entranceResultsFileRef.current?.click()}
            data-testid="upload-area-entrance-results"
          >
            <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Click to upload or drag and drop</p>
            <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx) or CSV files only</p>
            <input
              ref={entranceResultsFileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.csv"
              onChange={(e) => handleFileInputChange(e, 'entrance-results')}
              data-testid="input-entrance-results-file"
            />
          </div>
          {uploadEntranceResultsMutation.isSuccess && (
            <div className="mt-2 flex items-center text-sm text-green-600">
              <Check className="w-4 h-4 mr-1" />
              <span>Entrance results file uploaded successfully</span>
            </div>
          )}
        </div>
        )}

        {/* Student Choices Upload */}
        {selectedCounselingTitle && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">Student Choices File</label>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setColumnRequirementsType('students');
                  setShowColumnRequirements(true);
                }}
                title="Preview column requirements"
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadStudentChoicesTemplateMutation.mutate()}
                disabled={downloadStudentChoicesTemplateMutation.isPending}
                data-testid="button-download-student-template"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadStudentChoicesTemplateMutation.isPending ? 'Downloading...' : 'Download Template'}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => downloadStudentChoicesTestDataMutation.mutate()}
                disabled={downloadStudentChoicesTestDataMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadStudentChoicesTestDataMutation.isPending ? 'Downloading...' : 'Download Test Data'}
              </Button>
            </div>
          </div>
          <div 
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              isDragging ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'students')}
            onClick={() => studentFileRef.current?.click()}
            data-testid="upload-area-students"
          >
            <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Click to upload or drag and drop</p>
            <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx) or CSV files only</p>
            <input
              ref={studentFileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.csv"
              onChange={(e) => handleFileInputChange(e, 'students')}
              data-testid="input-students-file"
            />
          </div>
          {uploadStudentsMutation.isSuccess && (
            <div className="mt-2 flex items-center text-sm text-green-600">
              <Check className="w-4 h-4 mr-1" />
              <span>Student choices file uploaded successfully</span>
            </div>
          )}
        </div>
        )}

        {/* Vacancy Upload */}
        {selectedCounselingTitle && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">Vacancy Data File</label>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setColumnRequirementsType('vacancies');
                  setShowColumnRequirements(true);
                }}
                title="Preview column requirements"
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadVacanciesTemplateMutation.mutate()}
                disabled={downloadVacanciesTemplateMutation.isPending}
                data-testid="button-download-vacancy-template"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadVacanciesTemplateMutation.isPending ? 'Downloading...' : 'Download Template'}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => downloadVacanciesTestDataMutation.mutate()}
                disabled={downloadVacanciesTestDataMutation.isPending}
                data-testid="button-download-vacancy-test-data"
                className="bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadVacanciesTestDataMutation.isPending ? 'Downloading...' : 'Download Test Data'}
              </Button>
            </div>
          </div>
          <div 
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              isDragging ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'vacancies')}
            onClick={() => vacancyFileRef.current?.click()}
            data-testid="upload-area-vacancies"
          >
            <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Click to upload or drag and drop</p>
            <p className="text-xs text-muted-foreground mt-1">CSV files only</p>
            <input
              ref={vacancyFileRef}
              type="file"
              className="hidden"
              accept=".csv"
              onChange={(e) => handleFileInputChange(e, 'vacancies')}
              data-testid="input-vacancies-file"
            />
          </div>
          {uploadVacanciesMutation.isSuccess && (
            <div className="mt-2 flex items-center text-sm text-green-600">
              <Check className="w-4 h-4 mr-1" />
              <span>Vacancy data file uploaded successfully</span>
            </div>
          )}
        </div>
        )}

        {!selectedCounselingTitle && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Please select a counseling title above to upload files</p>
          </div>
        )}

        {selectedCounselingTitle && (
        <div className="flex space-x-3">
          <Button 
            className="flex-1"
            disabled={uploadStudentsMutation.isPending || uploadVacanciesMutation.isPending || uploadEntranceResultsMutation.isPending}
            data-testid="button-validate-files"
          >
            <Check className="w-4 h-4 mr-2" />
            {(uploadStudentsMutation.isPending || uploadVacanciesMutation.isPending || uploadEntranceResultsMutation.isPending) ? "Processing..." : "Validate Files"}
          </Button>
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => setShowPreview(true)}
            data-testid="button-preview-data"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Data
          </Button>
        </div>
        )}
      </CardContent>
    </Card>

    {/* Preview Data Dialog */}
    <Dialog open={showPreview} onOpenChange={setShowPreview}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Data Preview
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(false)}
              data-testid="button-close-preview"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Students Preview */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Student Records ({studentsData?.length || 0})</h3>
            {studentsData && studentsData.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">App No</th>
                        <th className="p-2 text-left">Merit</th>
                        <th className="p-2 text-left">Name</th>
                        <th className="p-2 text-left">Stream</th>
                        <th className="p-2 text-left">Choice 1</th>
                        <th className="p-2 text-left">Choice 2</th>
                        <th className="p-2 text-left">Choice 3</th>
                        <th className="p-2 text-left">Choice 4</th>
                        <th className="p-2 text-left">Choice 5</th>
                        <th className="p-2 text-left">Choice 6</th>
                        <th className="p-2 text-left">Choice 7</th>
                        <th className="p-2 text-left">Choice 8</th>
                        <th className="p-2 text-left">Choice 9</th>
                        <th className="p-2 text-left">Choice 10</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentsData.slice(0, 10).map((student) => (
                        <tr key={student.id} className="border-t">
                          <td className="p-2">{student.appNo}</td>
                          <td className="p-2">{student.meritNumber}</td>
                          <td className="p-2">{student.name}</td>
                          <td className="p-2">{student.stream}</td>
                          <td className="p-2">{student.choice1 || '-'}</td>
                          <td className="p-2">{student.choice2 || '-'}</td>
                          <td className="p-2">{student.choice3 || '-'}</td>
                          <td className="p-2">{student.choice4 || '-'}</td>
                          <td className="p-2">{student.choice5 || '-'}</td>
                          <td className="p-2">{student.choice6 || '-'}</td>
                          <td className="p-2">{student.choice7 || '-'}</td>
                          <td className="p-2">{student.choice8 || '-'}</td>
                          <td className="p-2">{student.choice9 || '-'}</td>
                          <td className="p-2">{student.choice10 || '-'}</td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              student.allocationStatus === 'allotted' 
                                ? 'bg-green-100 text-green-800' 
                                : student.allocationStatus === 'not_allotted'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {student.allocationStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {studentsData.length > 10 && (
                  <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                    Showing first 10 of {studentsData.length} records
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No student data found</p>
                <p className="text-sm">Upload a student choices file to see data here</p>
              </div>
            )}
          </div>

          {/* Vacancies Preview */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Vacancy Records ({vacanciesData?.length || 0})</h3>
            {vacanciesData && vacanciesData.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">District</th>
                        <th className="p-2 text-center">Medical</th>
                        <th className="p-2 text-center">Commerce</th>
                        <th className="p-2 text-center">Non-Medical</th>
                        <th className="p-2 text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vacanciesData.map((vacancy) => (
                        <tr key={vacancy.id} className="border-t">
                          <td className="p-2 font-medium">{vacancy.district}</td>
                          <td className="p-2 text-center">{vacancy.stream === 'Medical' ? vacancy.totalSeats : 0}</td>
                          <td className="p-2 text-center">{vacancy.stream === 'Commerce' ? vacancy.totalSeats : 0}</td>
                          <td className="p-2 text-center">{vacancy.stream === 'NonMedical' ? vacancy.totalSeats : 0}</td>
                          <td className="p-2 text-center font-medium">
                            {vacancy.totalSeats || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No vacancy data found</p>
                <p className="text-sm">Upload a vacancy data file to see data here</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Data Preview Modal */}
    {pendingFile && (
      <DataPreviewModal
        isOpen={showValidationPreview}
        onClose={() => {
          setShowValidationPreview(false);
          setPendingFile(null);
          setCurrentUploadId(undefined);
        }}
        onConfirm={handleConfirmUpload}
        validationResults={pendingFile.validationResults}
        fileType={pendingFile.type as 'students' | 'vacancies' | 'entrance-results'}
        fileName={pendingFile.file.name}
        isUploading={uploadStudentsMutation.isPending || uploadVacanciesMutation.isPending || uploadEntranceResultsMutation.isPending}
        uploadId={currentUploadId}
      />
    )}

    {/* Column Requirements Dialog */}
    <Dialog open={showColumnRequirements} onOpenChange={setShowColumnRequirements}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Column Requirements
            {columnRequirementsType === 'entrance-results' && ' - Entrance Results'}
            {columnRequirementsType === 'students' && ' - Student Choices'}
            {columnRequirementsType === 'vacancies' && ' - Vacancies'}
          </DialogTitle>
          <DialogDescription>
            Required columns and their formats for the Excel/CSV template. 
            <span className="block mt-2 text-amber-600 font-medium">
              Note: Academic Year and Counseling Title are selected in the form above, not included in the file.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {columnRequirementsType === 'entrance-results' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Column Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Merit Number</TableCell>
                  <TableCell>Integer</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Unique merit ranking number (ascending = better rank)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Application Number</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Unique application identifier</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Roll Number</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Unique roll number</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Student Name</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Full name of the student</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Marks</TableCell>
                  <TableCell>Integer</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Total marks obtained</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Gender</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Must be: Male or Female</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Category</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Must be: Open, WHH, Disabled, or Private</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Stream</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="outline">Optional</Badge></TableCell>
                  <TableCell>Must be: Medical, Commerce, or NonMedical</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          {columnRequirementsType === 'students' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Column Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">App No</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Unique application number</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Merit Number</TableCell>
                  <TableCell>Integer</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Merit ranking number (ascending = better rank)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Name</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Full name of the student</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Gender</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Must be: Male or Female</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Category</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Must be: Open, WHH, Disabled, or Private</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Stream</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Must be: Medical, Commerce, or NonMedical</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 1</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>First preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 2</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Second preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 3</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Third preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 4</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Fourth preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 5</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Fifth preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 6</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Sixth preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 7</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Seventh preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 8</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Eighth preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 9</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Ninth preference district (must be valid Punjab district)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Choice 10</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                  <TableCell>Tenth preference district (must be valid Punjab district)</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          {columnRequirementsType === 'vacancies' && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Column Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                <TableRow>
                  <TableCell className="font-medium">UDISE Code</TableCell>
                  <TableCell>String</TableCell>
                  <TableCell><Badge variant="outline">Optional</Badge></TableCell>
                  <TableCell>Unique school identifier code (11 digits, optional)</TableCell>
                </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">District</TableCell>
                    <TableCell>String</TableCell>
                    <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                    <TableCell>Must be a valid Punjab district name</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Stream</TableCell>
                    <TableCell>String</TableCell>
                    <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                    <TableCell>Must be: Medical, Commerce, or NonMedical</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Gender</TableCell>
                    <TableCell>String</TableCell>
                    <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                    <TableCell>Must be: Male or Female</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Category</TableCell>
                    <TableCell>String</TableCell>
                    <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                    <TableCell>Must be: Open, WHH, Disabled, or Private</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Total Seats</TableCell>
                    <TableCell>Integer</TableCell>
                    <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                    <TableCell>Total number of seats available (non-negative)</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Available Seats</TableCell>
                    <TableCell>Integer</TableCell>
                    <TableCell><Badge variant="destructive">Required</Badge></TableCell>
                    <TableCell>Currently available seats (typically equals Total Seats initially)</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-900">
                  <strong>Important:</strong> Academic Year and Counseling Title are automatically set from your selections above. 
                  Do NOT include these columns in your file - they will be ignored if present.
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
