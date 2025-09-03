import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import StatsCards from "@/components/dashboard/stats-cards";
import AuditLogPreview from "@/components/dashboard/audit-log-preview";
import DistrictSummary from "@/components/dashboard/district-summary";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Upload, Users, Play, FileText, BarChart3, Settings } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Dashboard" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Dashboard" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <StatsCards stats={stats} isLoading={statsLoading} />

        {/* Quick Links Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {user?.role === 'central_admin' && (
            <>
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Upload className="w-5 h-5 mr-2 text-primary" />
                    File Management
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload student data and vacancy files
                  </p>
                  <Link href="/file-management">
                    <Button className="w-full" data-testid="button-file-management">
                      Manage Files
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Play className="w-5 h-5 mr-2 text-primary" />
                    Allocation Process
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Run seat allocation algorithm
                  </p>
                  <Link href="/allocation">
                    <Button className="w-full" data-testid="button-allocation">
                      Manage Allocation
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="w-5 h-5 mr-2 text-primary" />
                    District Admins
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Manage district administrator accounts
                  </p>
                  <Link href="/district-admin-list">
                    <Button className="w-full" data-testid="button-district-admins">
                      View Admins
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </>
          )}
          
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" />
                Student Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Search and view student data
              </p>
              <Link href="/students">
                <Button className="w-full" data-testid="button-students">
                  View Students
                </Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-primary" />
                Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Generate allocation reports
              </p>
              <Link href="/reports">
                <Button className="w-full" data-testid="button-reports">
                  View Reports
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AuditLogPreview />
          <DistrictSummary />
        </div>
      </main>
    </div>
  );
}
