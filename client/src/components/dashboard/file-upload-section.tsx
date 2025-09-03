import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Check, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FileUploadSection() {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const studentFileRef = useRef<HTMLInputElement>(null);
  const vacancyFileRef = useRef<HTMLInputElement>(null);

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
            data-testid="button-preview-data"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Data
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
