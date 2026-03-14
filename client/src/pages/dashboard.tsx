import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import StatsCards from "@/components/dashboard/stats-cards";
import AuditLogPreview from "@/components/dashboard/audit-log-preview";
import DistrictSummary from "@/components/dashboard/district-summary";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Upload, Users, Play, FileText, BarChart3, Settings, Maximize2, UploadCloud, ShieldQuestion } from "lucide-react";
import FlowDiagramModal from "@/components/dashboard/flow-diagram-modal";
import CounselingProgress from "@/components/dashboard/counseling-progress";

import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingDiagram, setIsUploadingDiagram] = useState(false);
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false);
  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: activeRound } = useQuery({
    queryKey: ["/api/counseling/active-round"],
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
        {/* Active Round Banner */}
        {activeRound != null && (
          <div className="mb-6 p-4 rounded-lg border-2 border-primary/20 bg-primary/5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                 <ShieldQuestion className="w-5 h-5" /> 
                 Active Counseling Session
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                 Currently resolving <strong>{String((activeRound as any).roundName)}</strong> (Round {String((activeRound as any).roundNumber)})
              </p>
            </div>
          </div>
        )}

        <StatsCards stats={stats} isLoading={statsLoading} />

        {/* Progress Tracker */}
        {user?.role === 'central_admin' && (
          <div className="mt-8">
            <CounselingProgress />
          </div>
        )}



        {/* Counseling Flow Diagram Preview */}
        {user?.role === 'central_admin' && (
          <div className="mt-8">
            <Card className="overflow-hidden border-2 border-primary/20">
              <CardHeader className="bg-primary/5 pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Counseling Flow Diagram</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Visual guide of the complete counseling process for Central and District Admins
                  </p>
                </div>
                <div className="flex space-x-2">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      setIsUploadingDiagram(true);
                      const formData = new FormData();
                      formData.append('diagram', file);

                      try {
                        const res = await fetch('/api/upload-diagram', { method: 'POST', body: formData });
                        if (res.ok) {
                          toast({ title: "Success", description: "Diagram updated" });
                          // Force refresh iframe by updating timestamp if needed, but a page reload is safest.
                          window.location.reload();
                        } else throw new Error(await res.text());
                      } catch (err: any) {
                        toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
                      } finally {
                        setIsUploadingDiagram(false);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }
                    }}
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="bg-white"
                    disabled={isUploadingDiagram}
                  >
                    <UploadCloud className="w-4 h-4 mr-2" />
                    Upload PDF
                  </Button>
                  <Button
                    onClick={() => setIsFlowModalOpen(true)}
                    variant="outline"
                    className="bg-white"
                  >
                    <Maximize2 className="w-4 h-4 mr-2" />
                    View Full Screen
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-white">
                <div className="h-[400px] w-full relative group cursor-pointer" onClick={() => setIsFlowModalOpen(true)}>
                  <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                    <Button variant="secondary" className="pointer-events-none shadow-lg">
                      <Maximize2 className="w-4 h-4 mr-2" />
                      Click to Expand
                    </Button>
                  </div>
                  <object
                    data={`/api/documents/counseling_flow_diagram.pdf?v=${Date.now()}#toolbar=0&navpanes=0&scrollbar=0`}
                    type="application/pdf"
                    className="w-full h-full border-0 pointer-events-none object-cover"
                    title="Counseling Flow Diagram View"
                  >
                    <div className="flex items-center justify-center h-full text-muted-foreground bg-slate-50">
                      <p>Diagram preview not available. Click to upload or expand.</p>
                    </div>
                  </object>
                </div>
              </CardContent>
            </Card>

            <FlowDiagramModal
              isOpen={isFlowModalOpen}
              onClose={() => setIsFlowModalOpen(false)}
            />
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AuditLogPreview />
          <DistrictSummary />
        </div>
      </main>
    </div>
  );
}
