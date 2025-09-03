import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, History, Filter } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { AuditLog } from "@/types";

export default function AuditLog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["/api/audit-logs", { limit, offset: page * limit }],
  });

  const filteredLogs = auditLogs?.filter((log: AuditLog) => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details?.username?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getActionBadge = (action: string) => {
    const actionMap: Record<string, { variant: any; className: string }> = {
      'user_login': { variant: 'outline', className: 'bg-blue-100 text-blue-800 border-blue-200' },
      'user_logout': { variant: 'outline', className: 'bg-gray-100 text-gray-800 border-gray-200' },
      'file_upload': { variant: 'secondary', className: 'bg-green-100 text-green-800' },
      'allocation_run': { variant: 'secondary', className: 'bg-purple-100 text-purple-800' },
      'student_preferences_update': { variant: 'outline', className: 'bg-amber-100 text-amber-800 border-amber-200' },
      'export_csv': { variant: 'outline', className: 'bg-teal-100 text-teal-800 border-teal-200' },
      'export_pdf': { variant: 'outline', className: 'bg-red-100 text-red-800 border-red-200' },
      'setting_update': { variant: 'outline', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    };

    const config = actionMap[action] || { variant: 'outline', className: '' };
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {action.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const getActionDescription = (log: AuditLog) => {
    switch (log.action) {
      case 'user_login':
        return `User "${log.details?.username}" logged in`;
      case 'user_logout':
        return `User "${log.details?.username}" logged out`;
      case 'file_upload':
        return `File uploaded: ${log.details?.filename} (${log.details?.type})`;
      case 'allocation_run':
        return 'Seat allocation algorithm executed';
      case 'student_preferences_update':
        return `Student preferences updated for Merit No. ${log.details?.meritNumber || 'N/A'}`;
      case 'export_csv':
        return 'Allocation results exported as CSV';
      case 'export_pdf':
        return 'Allocation results exported as PDF';
      case 'setting_update':
        return `Setting "${log.details?.key}" updated`;
      case 'user_create':
        return `New user created: ${log.details?.username} (${log.details?.role})`;
      default:
        return `${log.action.replace(/_/g, ' ')} performed on ${log.resource}`;
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Audit Log" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Operations" },
          { name: "Audit Log" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <History className="w-5 h-5 mr-2 text-primary" />
              System Activity Audit Trail
            </CardTitle>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search actions, resources, or users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-audit-logs"
                />
              </div>
              <Button variant="outline" size="sm" data-testid="button-filter-audit-logs">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Time Ago</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log: AuditLog) => (
                        <TableRow key={log.id} data-testid={`audit-log-row-${log.id}`}>
                          <TableCell className="font-mono text-xs">
                            {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            {getActionBadge(log.action)}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <p className="text-sm">{getActionDescription(log)}</p>
                            {log.details && Object.keys(log.details).length > 0 && (
                              <details className="mt-1">
                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                  View details
                                </summary>
                                <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.resource}
                            {log.resourceId && (
                              <span className="block text-xs font-mono">
                                ID: {log.resourceId}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.ipAddress || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {filteredLogs.length === 0 && (
                  <div className="text-center py-8">
                    <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {searchTerm ? "No audit logs found matching your search." : "No audit logs available."}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredLogs.length} audit log entries
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      data-testid="button-previous-page"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={filteredLogs.length < limit}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
