import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import FileManagement from "@/pages/file-management";
import Students from "@/pages/students";
import Vacancies from "@/pages/vacancies";
import Allocation from "@/pages/allocation";
import ExportResults from "@/pages/export-results";
import AuditLog from "@/pages/audit-log";
import DistrictAdmin from "@/pages/district-admin";
import Reports from "@/pages/reports";
import MainLayout from "@/components/layout/main-layout";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/file-management" component={FileManagement} />
        <Route path="/students" component={Students} />
        <Route path="/vacancies" component={Vacancies} />
        <Route path="/allocation" component={Allocation} />
        <Route path="/export-results" component={ExportResults} />
        <Route path="/reports" component={Reports} />
        <Route path="/audit-log" component={AuditLog} />
        <Route path="/district-admin" component={DistrictAdmin} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
