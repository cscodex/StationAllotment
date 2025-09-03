import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import type { AuditLog } from "@/types";

export default function AuditLogPreview() {
  const { data: auditLogs } = useQuery({
    queryKey: ["/api/audit-logs"],
  });

  const getActivityColor = (action: string) => {
    switch (action) {
      case 'file_upload':
        return 'bg-green-500';
      case 'allocation_run':
        return 'bg-blue-500';
      case 'user_login':
        return 'bg-amber-500';
      case 'student_preferences_update':
        return 'bg-primary';
      default:
        return 'bg-gray-500';
    }
  };

  const getActivityDescription = (log: AuditLog) => {
    switch (log.action) {
      case 'file_upload':
        return `File uploaded: ${log.details?.filename || 'Unknown file'}`;
      case 'allocation_run':
        return 'Seat allocation completed';
      case 'user_login':
        return `User logged in: ${log.details?.username || 'Unknown user'}`;
      case 'student_preferences_update':
        return `Student preferences updated (Merit No. ${log.details?.meritNumber || 'Unknown'})`;
      default:
        return `${log.action} performed`;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <History className="w-5 h-5 mr-2 text-primary" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {auditLogs?.slice(0, 5).map((log: AuditLog) => (
            <div key={log.id} className="flex items-start space-x-3">
              <div className={`w-2 h-2 rounded-full mt-2 ${getActivityColor(log.action)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" data-testid={`audit-log-${log.id}`}>
                  {getActivityDescription(log)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          )) || (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          )}
        </div>
        <Link href="/audit-log">
          <Button variant="ghost" className="w-full mt-4 text-primary" data-testid="button-view-full-audit-log">
            View full audit log →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
