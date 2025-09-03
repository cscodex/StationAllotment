import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import StatsCards from "@/components/dashboard/stats-cards";
import FileUploadSection from "@/components/dashboard/file-upload-section";
import QuickActionsPanel from "@/components/dashboard/quick-actions-panel";
import AuditLogPreview from "@/components/dashboard/audit-log-preview";
import DistrictSummary from "@/components/dashboard/district-summary";
import { useAuth } from "@/hooks/useAuth";

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          {user?.role === 'central_admin' && (
            <div className="lg:col-span-2">
              <FileUploadSection />
            </div>
          )}
          
          <div className={user?.role === 'central_admin' ? "" : "lg:col-span-3"}>
            <QuickActionsPanel />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AuditLogPreview />
          <DistrictSummary />
        </div>
      </main>
    </div>
  );
}
