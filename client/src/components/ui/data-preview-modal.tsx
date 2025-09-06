import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious, 
  PaginationEllipsis 
} from "@/components/ui/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, AlertTriangle, FileSpreadsheet, X, Upload } from "lucide-react";

interface DataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  validationResults: {
    isValid: boolean;
    message: string;
    errors: string[];
    warnings: string[];
    recordCount: number;
    allRecords: any[];
  };
  fileType: 'students' | 'vacancies' | 'entrance-results';
  fileName: string;
  isUploading: boolean;
}

const ITEMS_PER_PAGE = 20;

export function DataPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  validationResults,
  fileType,
  fileName,
  isUploading
}: DataPreviewModalProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil((validationResults.allRecords?.length || 0) / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentRecords = validationResults.allRecords?.slice(startIndex, endIndex) || [];

  const renderStudentTable = (records: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-2 text-left font-medium">App No</th>
            <th className="p-2 text-left font-medium">Merit</th>
            <th className="p-2 text-left font-medium">Name</th>
            <th className="p-2 text-left font-medium">Stream</th>
            <th className="p-2 text-left font-medium">Gender</th>
            <th className="p-2 text-left font-medium">Category</th>
            <th className="p-2 text-left font-medium">Choice 1</th>
            <th className="p-2 text-left font-medium">Choice 2</th>
            <th className="p-2 text-left font-medium">Choice 3</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={index} className="border-b hover:bg-muted/20">
              <td className="p-2">{record.appNo || '-'}</td>
              <td className="p-2">{record.meritNumber || '-'}</td>
              <td className="p-2 font-medium">{record.name || '-'}</td>
              <td className="p-2">
                <Badge variant="outline">{record.stream || '-'}</Badge>
              </td>
              <td className="p-2">{record.gender || '-'}</td>
              <td className="p-2">{record.category || '-'}</td>
              <td className="p-2">{record.choice1 || '-'}</td>
              <td className="p-2">{record.choice2 || '-'}</td>
              <td className="p-2">{record.choice3 || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderVacancyTable = (records: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-2 text-left font-medium">District</th>
            <th className="p-2 text-left font-medium">Stream</th>
            <th className="p-2 text-left font-medium">Gender</th>
            <th className="p-2 text-left font-medium">Category</th>
            <th className="p-2 text-center font-medium">Total Seats</th>
            <th className="p-2 text-center font-medium">Available Seats</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={index} className="border-b hover:bg-muted/20">
              <td className="p-2 font-medium">{record.district || '-'}</td>
              <td className="p-2">
                <Badge variant="outline">{record.stream || '-'}</Badge>
              </td>
              <td className="p-2">{record.gender || '-'}</td>
              <td className="p-2">{record.category || '-'}</td>
              <td className="p-2 text-center font-mono">{record.totalSeats || 0}</td>
              <td className="p-2 text-center font-mono">{record.availableSeats || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderEntranceResultsTable = (records: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-2 text-left font-medium">Merit No</th>
            <th className="p-2 text-left font-medium">App No</th>
            <th className="p-2 text-left font-medium">Roll No</th>
            <th className="p-2 text-left font-medium">Student Name</th>
            <th className="p-2 text-center font-medium">Marks</th>
            <th className="p-2 text-left font-medium">Gender</th>
            <th className="p-2 text-left font-medium">Category</th>
            <th className="p-2 text-left font-medium">Stream</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={index} className="border-b hover:bg-muted/20">
              <td className="p-2 font-mono">{record.meritNo || '-'}</td>
              <td className="p-2">{record.applicationNo || '-'}</td>
              <td className="p-2 font-mono">{record.rollNo || '-'}</td>
              <td className="p-2 font-medium">{record.studentName || '-'}</td>
              <td className="p-2 text-center font-mono font-medium">{record.marks || 0}</td>
              <td className="p-2">{record.gender || '-'}</td>
              <td className="p-2">{record.category || '-'}</td>
              <td className="p-2">
                <Badge variant="outline">{record.stream || '-'}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderTable = () => {
    if (!currentRecords.length) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No records to display</p>
        </div>
      );
    }

    switch (fileType) {
      case 'students':
        return renderStudentTable(currentRecords);
      case 'vacancies':
        return renderVacancyTable(currentRecords);
      case 'entrance-results':
        return renderEntranceResultsTable(currentRecords);
      default:
        return null;
    }
  };

  const getTitle = () => {
    switch (fileType) {
      case 'students':
        return 'Student Choices Preview';
      case 'vacancies':
        return 'Vacancy Data Preview';
      case 'entrance-results':
        return 'Entrance Results Preview';
      default:
        return 'Data Preview';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5" />
              <span>{getTitle()}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-testid="button-close-preview"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* File Info Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>File: {fileName}</span>
                <div className="flex items-center space-x-2">
                  {validationResults.isValid ? (
                    <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Valid
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" />
                      Invalid
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {validationResults.recordCount} records
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-3">
                {validationResults.message}
              </p>

              {/* Validation Errors */}
              {validationResults.errors.length > 0 && (
                <Alert variant="destructive" className="mb-3">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-2">
                      Found {validationResults.errors.length} validation errors:
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {validationResults.errors.slice(0, 10).map((error, index) => (
                        <div key={index} className="text-xs font-mono bg-destructive/10 p-1 rounded">
                          {error}
                        </div>
                      ))}
                      {validationResults.errors.length > 10 && (
                        <div className="text-xs text-muted-foreground">
                          ... and {validationResults.errors.length - 10} more errors
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {validationResults.warnings?.length > 0 && (
                <Alert className="mb-3">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-2">Warnings:</div>
                    <div className="space-y-1">
                      {validationResults.warnings.map((warning, index) => (
                        <div key={index} className="text-xs">{warning}</div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Records {startIndex + 1}-{Math.min(endIndex, validationResults.recordCount)} of {validationResults.recordCount}</span>
                {totalPages > 1 && (
                  <div className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {renderTable()}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                
                {/* Page Numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  if (pageNum > totalPages) return null;
                  
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => setCurrentPage(pageNum)}
                        isActive={currentPage === pageNum}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                {totalPages > 5 && currentPage < totalPages - 2 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isUploading}
            data-testid="button-cancel-upload"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!validationResults.isValid || isUploading}
            data-testid="button-confirm-upload"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Confirm & Upload to Database
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}