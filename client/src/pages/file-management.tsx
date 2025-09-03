import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import FileUploadSection from "@/components/dashboard/file-upload-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Check, X, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function FileManagement() {
  const { data: files } = useQuery({
    queryKey: ["/api/files"],
  });

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <FileUploadSection />
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" />
                Upload History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {files?.map((file: any) => (
                  <div key={file.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" data-testid={`file-${file.id}`}>
                        {file.originalName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {file.type} • {(file.size / 1024).toFixed(1)} KB
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
                      </p>
                      {file.validationResults?.errors?.length > 0 && (
                        <div className="mt-1">
                          <p className="text-xs text-red-600">
                            {file.validationResults.errors[0]}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      {getStatusBadge(file.status)}
                    </div>
                  </div>
                )) || (
                  <p className="text-sm text-muted-foreground">No files uploaded yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
