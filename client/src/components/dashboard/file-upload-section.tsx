import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Check, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Student, Vacancy } from "@shared/schema";

export default function FileUploadSection() {
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const studentFileRef = useRef<HTMLInputElement>(null);
  const vacancyFileRef = useRef<HTMLInputElement>(null);

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

  const uploadStudentsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: "File uploaded successfully",
        description: data.validationResults?.message || "Student choices file processed",
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

  const uploadVacanciesMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent, type: 'students' | 'vacancies') => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0], type);
    }
  };

  const handleFileUpload = (file: File, type: 'students' | 'vacancies') => {
    if (type === 'students') {
      uploadStudentsMutation.mutate(file);
    } else {
      uploadVacanciesMutation.mutate(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'students' | 'vacancies') => {
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
        <p className="text-sm text-muted-foreground">Upload student choices and vacancy data</p>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Student Choices Upload */}
        <div>
          <label className="block text-sm font-medium mb-3">Student Choices File</label>
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

        {/* Vacancy Upload */}
        <div>
          <label className="block text-sm font-medium mb-3">Vacancy Data File</label>
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

        <div className="flex space-x-3">
          <Button 
            className="flex-1"
            disabled={uploadStudentsMutation.isPending || uploadVacanciesMutation.isPending}
            data-testid="button-validate-files"
          >
            <Check className="w-4 h-4 mr-2" />
            {uploadStudentsMutation.isPending || uploadVacanciesMutation.isPending ? "Processing..." : "Validate Files"}
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
                          <td className="p-2 text-center">{vacancy.medicalVacancies}</td>
                          <td className="p-2 text-center">{vacancy.commerceVacancies}</td>
                          <td className="p-2 text-center">{vacancy.nonMedicalVacancies}</td>
                          <td className="p-2 text-center font-medium">
                            {(vacancy.medicalVacancies || 0) + (vacancy.commerceVacancies || 0) + (vacancy.nonMedicalVacancies || 0)}
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
    </>
  );
}
