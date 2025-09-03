import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Check, 
  AlertTriangle,
  Calendar,
  Users,
  BarChart3
} from "lucide-react";

export default function ExportResults() {
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const { toast } = useToast();

  const { data: allocationStatus } = useQuery({
    queryKey: ["/api/allocation/status"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      const response = await fetch('/api/export/csv', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `allocation_results_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "CSV file has been downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export CSV file",
        variant: "destructive",
      });
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const response = await fetch('/api/export/pdf', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `allocation_results_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "PDF file has been downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Export Failed", 
        description: "Failed to export PDF file",
        variant: "destructive",
      });
    } finally {
      setIsExportingPDF(false);
    }
  };

  const canExport = allocationStatus?.completed;

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Export Results" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Operations" },
          { name: "Export Results" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Export Options */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Download className="w-5 h-5 mr-2 text-primary" />
                  Export Allocation Results
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Download the complete allocation results in your preferred format
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {!canExport ? (
                  <div className="text-center p-8 bg-amber-50 rounded-lg border border-amber-200">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-amber-800 mb-2">
                      Allocation Not Completed
                    </h3>
                    <p className="text-sm text-amber-600 mb-4">
                      Please complete the seat allocation process before exporting results.
                    </p>
                    <Button 
                      onClick={() => window.location.href = '/allocation'}
                      variant="outline"
                      data-testid="button-go-to-allocation"
                    >
                      Go to Allocation
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 mb-4">
                      <Check className="w-5 h-5 text-green-500" />
                      <span className="text-sm font-medium text-green-700">
                        Allocation completed successfully
                      </span>
                    </div>

                    {/* CSV Export */}
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <FileSpreadsheet className="w-6 h-6 text-green-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">CSV Export</h3>
                            <p className="text-sm text-muted-foreground mb-3">
                              Export complete allocation data as a CSV file. Includes all student records, 
                              choices, and allocation results. Perfect for further analysis or data processing.
                            </p>
                            <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-3">
                              <span>• All student records</span>
                              <span>• Choice preferences</span>
                              <span>• Allocation status</span>
                              <span>• Merit numbers</span>
                            </div>
                            <Button 
                              onClick={handleExportCSV}
                              disabled={isExportingCSV}
                              data-testid="button-export-csv"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              {isExportingCSV ? "Exporting..." : "Export CSV"}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* PDF Export */}
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-6 h-6 text-red-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">PDF Report</h3>
                            <p className="text-sm text-muted-foreground mb-3">
                              Generate a comprehensive PDF report with allocation summary, 
                              statistics, and detailed results. Ideal for official documentation and reports.
                            </p>
                            <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-3">
                              <span>• Summary statistics</span>
                              <span>• Allocation breakdown</span>
                              <span>• Student listings</span>
                              <span>• Official format</span>
                            </div>
                            <Button 
                              onClick={handleExportPDF}
                              disabled={isExportingPDF}
                              data-testid="button-export-pdf"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              {isExportingPDF ? "Generating..." : "Export PDF"}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Export Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Export Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Export Status</span>
                    <Badge variant={canExport ? "secondary" : "outline"} className={canExport ? "bg-green-100 text-green-800" : ""}>
                      {canExport ? "Ready" : "Pending"}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Records</span>
                    <span className="font-medium" data-testid="export-total-records">
                      {stats?.totalStudents || 0}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Allocated</span>
                    <span className="font-medium text-green-600" data-testid="export-allocated-count">
                      {stats ? stats.totalStudents - stats.pendingAllocations : 0}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Not Allocated</span>
                    <span className="font-medium text-red-600" data-testid="export-not-allocated-count">
                      {stats?.pendingAllocations || 0}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Completion Rate</span>
                    <span className="font-medium" data-testid="export-completion-rate">
                      {stats?.completionRate || 0}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Export Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-start space-x-2">
                    <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Export Date</p>
                      <p className="text-muted-foreground">
                        {new Date().toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-2">
                    <Users className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Data Scope</p>
                      <p className="text-muted-foreground">
                        All student records with complete allocation details
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Format</p>
                      <p className="text-muted-foreground">
                        CSV for data analysis, PDF for reporting
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
