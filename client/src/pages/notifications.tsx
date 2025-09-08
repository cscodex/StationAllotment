import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { 
  Bell, 
  Check, 
  X, 
  Clock, 
  User, 
  FileText, 
  AlertTriangle,
  CheckCircle 
} from "lucide-react";

interface UnlockRequest {
  id: string;
  studentId: string;
  studentName: string;
  studentMeritNumber: number;
  districtAdmin: string;
  district: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export default function Notifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: unlockRequests, isLoading } = useQuery({
    queryKey: ["/api/unlock-requests"],
    enabled: user?.role === 'central_admin',
  });

  const respondToRequestMutation = useMutation({
    mutationFn: async ({ requestId, action }: { requestId: string; action: 'approve' | 'reject' }) => {
      return await apiRequest('PUT', `/api/unlock-requests/${requestId}/respond`, { action });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/unlock-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({
        title: variables.action === 'approve' ? "Request Approved" : "Request Rejected",
        description: `Unlock request has been ${variables.action === 'approve' ? 'approved and student unlocked' : 'rejected'}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });
    }
  });

  const handleResponse = (requestId: string, action: 'approve' | 'reject') => {
    respondToRequestMutation.mutate({ requestId, action });
  };

  const pendingRequests = (unlockRequests as UnlockRequest[] || []).filter(req => req.status === 'pending');
  const processedRequests = (unlockRequests as UnlockRequest[] || []).filter(req => req.status !== 'pending');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Approved
        </Badge>;
      case 'rejected':
        return <Badge variant="destructive">
          <X className="w-3 h-3 mr-1" />
          Rejected
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Notifications & Communications" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Notifications" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="w-5 h-5 mr-2 text-primary" />
                Communication Center
                {pendingRequests.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingRequests.length} Pending
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="pending" className="w-full">
                <TabsList>
                  <TabsTrigger value="pending" className="relative">
                    Pending Requests
                    {pendingRequests.length > 0 && (
                      <Badge variant="secondary" className="ml-2 bg-red-100 text-red-800">
                        {pendingRequests.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="processed">
                    Processed Requests
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="mt-6">
                  <div className="space-y-4">
                    {isLoading ? (
                      <div className="flex items-center justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : pendingRequests.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
                        <p className="text-muted-foreground">No pending unlock requests</p>
                      </div>
                    ) : (
                      pendingRequests.map((request: UnlockRequest) => (
                        <Card key={request.id} className="border-l-4 border-l-amber-500">
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-semibold">{request.studentName}</span>
                                  <Badge variant="outline">Merit #{request.studentMeritNumber}</Badge>
                                  {getStatusBadge(request.status)}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">District:</span> {request.district}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Admin:</span> {request.districtAdmin}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Requested:</span>{' '}
                                    {new Date(request.requestedAt).toLocaleDateString()}
                                  </div>
                                </div>

                                <div className="mb-4">
                                  <div className="flex items-start gap-2">
                                    <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    <div>
                                      <div className="text-sm font-medium mb-1">Reason:</div>
                                      <div className="text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                        {request.reason}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex gap-2 ml-4">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResponse(request.id, 'reject')}
                                  disabled={respondToRequestMutation.isPending}
                                  data-testid={`button-reject-${request.id}`}
                                >
                                  <X className="w-4 h-4 mr-1" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleResponse(request.id, 'approve')}
                                  disabled={respondToRequestMutation.isPending}
                                  data-testid={`button-approve-${request.id}`}
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  Approve & Unlock
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="processed" className="mt-6">
                  <div className="space-y-4">
                    {processedRequests.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">No processed requests yet</p>
                      </div>
                    ) : (
                      processedRequests.map((request: UnlockRequest) => (
                        <Card key={request.id}>
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-semibold">{request.studentName}</span>
                                  <Badge variant="outline">Merit #{request.studentMeritNumber}</Badge>
                                  {getStatusBadge(request.status)}
                                </div>
                                
                                <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">District:</span> {request.district}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Admin:</span> {request.districtAdmin}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Processed:</span>{' '}
                                    {request.reviewedAt ? new Date(request.reviewedAt).toLocaleDateString() : 'N/A'}
                                  </div>
                                </div>

                                <div className="text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                  {request.reason}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}