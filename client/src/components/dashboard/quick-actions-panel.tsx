import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Play, Search, Download, History } from "lucide-react";
import { Link } from "wouter";
import AllocationModal from "@/components/modals/allocation-modal";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function QuickActionsPanel() {
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const { user } = useAuth();

  const { data: allocationStatus } = useQuery({
    queryKey: ["/api/allocation/status"],
  });

  const steps = [
    {
      title: "Data Upload",
      status: "complete",
      icon: Check,
      color: "text-green-500",
    },
    {
      title: "Validation", 
      status: "complete",
      icon: Check,
      color: "text-green-500",
    },
    {
      title: "Allocation Run",
      status: allocationStatus?.completed ? "complete" : "pending",
      icon: allocationStatus?.completed ? Check : Clock,
      color: allocationStatus?.completed ? "text-green-500" : "text-amber-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Allocation Status */}
      <Card>
        <CardHeader>
          <CardTitle>Allocation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm">{step.title}</span>
                <div className="flex items-center">
                  <step.icon className={`w-4 h-4 mr-2 ${step.color}`} />
                  <span className={`text-sm font-medium capitalize ${step.color}`}>
                    {step.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          {user?.role === 'central_admin' && !allocationStatus?.completed && (
            <Button 
              className="w-full mt-4" 
              onClick={() => setShowAllocationModal(true)}
              data-testid="button-run-allocation"
            >
              <Play className="w-4 h-4 mr-2" />
              Run Allocation
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Link href="/students">
              <Button variant="outline" className="w-full justify-start" data-testid="button-search-student">
                <Search className="w-4 h-4 mr-2" />
                Search Student
              </Button>
            </Link>
            
            {user?.role === 'central_admin' && (
              <Link href="/export-results">
                <Button variant="outline" className="w-full justify-start" data-testid="button-export-results">
                  <Download className="w-4 h-4 mr-2" />
                  Export Results
                </Button>
              </Link>
            )}
            
            {user?.role === 'central_admin' && (
              <Link href="/audit-log">
                <Button variant="outline" className="w-full justify-start" data-testid="button-view-audit-log">
                  <History className="w-4 h-4 mr-2" />
                  View Audit Log
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      <AllocationModal 
        open={showAllocationModal} 
        onOpenChange={setShowAllocationModal} 
      />
    </div>
  );
}
