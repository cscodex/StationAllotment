import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
    Calendar,
    Plus,
    CheckCircle,
    Clock,
    Star,
    AlertTriangle,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { format } from "date-fns";

interface YearSession {
    id: string;
    sessionName: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export default function YearSessions() {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newStartDate, setNewStartDate] = useState("");
    const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());

    const toggleSessionExpansion = (id: string) => {
        setExpandedSessionIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Fetch all year sessions
    const { data: sessions, isLoading, error } = useQuery<YearSession[]>({
        queryKey: ["/api/year-sessions"],
        queryFn: async () => {
            const res = await fetch("/api/year-sessions", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch sessions");
            return res.json();
        },
    });

    // Create new session mutation
    const createMutation = useMutation({
        mutationFn: async (startDate: string) => {
            const res = await apiRequest("POST", "/api/year-sessions", { startDate });
            return await res.json();
        },
        onSuccess: (data: YearSession) => {
            queryClient.invalidateQueries({ queryKey: ["/api/year-sessions"] });
            setShowCreateDialog(false);
            setNewStartDate("");
            toast({
                title: "Session Created",
                description: `Session ${data.sessionName} created successfully`,
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Error",
                description: error.message || "Failed to create session",
                variant: "destructive",
            });
        },
    });

    // Set as current session mutation
    const setCurrentMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await apiRequest("PUT", `/api/year-sessions/${id}/set-current`);
            return await res.json();
        },
        onSuccess: (data: YearSession) => {
            queryClient.invalidateQueries({ queryKey: ["/api/year-sessions"] });
            queryClient.invalidateQueries({ queryKey: ["/api/session/current"] });
            toast({
                title: "Current Session Updated",
                description: `${data.sessionName} is now the current session`,
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Error",
                description: error.message || "Failed to set current session",
                variant: "destructive",
            });
        },
    });

    // Toggle active status mutation
    const toggleActiveMutation = useMutation({
        mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
            const res = await apiRequest("PUT", `/api/year-sessions/${id}`, { isActive });
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/year-sessions"] });
            toast({
                title: "Session Updated",
                description: "Session status updated successfully",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Error",
                description: error.message || "Failed to update session",
                variant: "destructive",
            });
        },
    });

    const handleCreate = () => {
        if (!newStartDate) {
            toast({
                title: "Error",
                description: "Please select a start date",
                variant: "destructive",
            });
            return;
        }
        createMutation.mutate(newStartDate);
    };

    // Calculate next session name for preview
    const getPreviewSessionName = (dateStr: string): string => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        const month = date.getMonth();
        const year = date.getFullYear();
        if (month >= 3) {
            return `${year}-${year + 1}`;
        } else {
            return `${year - 1}-${year}`;
        }
    };

    if (user?.role !== 'central_admin') {
        return (
            <div className="flex-1 flex flex-col">
                <Header title="Year Sessions" />
                <main className="flex-1 p-6">
                    <Card>
                        <CardContent className="p-6 text-center">
                            <p className="text-muted-foreground">Access restricted to central administrators.</p>
                        </CardContent>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col">
            <Header
                title="Year Sessions Management"
                breadcrumbs={[
                    { name: "Home" },
                    { name: "Settings" },
                    { name: "Year Sessions" }
                ]}
            />

            <main className="flex-1 p-6 overflow-auto">
                <div className="space-y-6">
                    {/* Info Card */}
                    <Card className="border-blue-200 bg-blue-50">
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
                                <div className="text-sm text-blue-800">
                                    <p className="font-medium mb-1">About Year Sessions</p>
                                    <ul className="list-disc list-inside space-y-1 text-blue-700">
                                        <li>Session runs from <strong>April 1</strong> to <strong>March 31</strong></li>
                                        <li>Session name is auto-calculated from start date (e.g., April 2025 → "2025-2026")</li>
                                        <li>Only the <strong>current session</strong> allows creating counseling rounds</li>
                                        <li>Mark a session as current to enable operations for that session</li>
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sessions List */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="flex items-center">
                                <Calendar className="w-5 h-5 mr-2" />
                                Year Sessions
                            </CardTitle>
                            <Button onClick={() => setShowCreateDialog(true)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Create Session
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <p className="text-muted-foreground">Loading...</p>
                            ) : error ? (
                                <p className="text-red-600">Error loading sessions</p>
                            ) : sessions && sessions.length > 0 ? (
                                <>
                                {/* MOBILE LIST VIEW (<md) */}
                                <div className="md:hidden divide-y rounded-md border min-w-full">
                                    {sessions
                                        .sort((a: YearSession, b: YearSession) => b.sessionName.localeCompare(a.sessionName))
                                        .map((session: YearSession) => {
                                            const isExpanded = expandedSessionIds.has(session.id);
                                            return (
                                                <div key={session.id} className={`p-3 bg-white ${session.isCurrent ? "bg-green-50/50" : ""}`}>
                                                    {/* Collapsed view */}
                                                    <div className="flex items-center justify-between gap-2">
                                                        <button
                                                            className="flex-1 text-left flex items-center gap-2 min-w-0"
                                                            onClick={() => toggleSessionExpansion(session.id)}
                                                        >
                                                            {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
                                                            <div className="font-semibold text-sm truncate flex items-center gap-2 flex-grow">
                                                                {session.sessionName}
                                                                {session.isCurrent && (
                                                                    <Badge className="bg-green-600 px-1 py-0 h-4 text-[10px]">
                                                                        <Star className="w-2.5 h-2.5 mr-0.5" />
                                                                        Current
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </button>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {session.isActive ? (
                                                                <Badge variant="outline" className="text-green-600 border-green-600 text-xs px-1.5 py-0">
                                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                                    Active
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-gray-500 text-xs px-1.5 py-0">
                                                                    <Clock className="w-3 h-3 mr-1" />
                                                                    Inactive
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Expanded view */}
                                                    {isExpanded && (
                                                        <div className="mt-3 ml-6 space-y-2 text-sm border-t pt-2">
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                                                <div>
                                                                    <span className="text-muted-foreground text-xs uppercase font-semibold">Start: </span>
                                                                    <span>{format(new Date(session.startDate), "MMM dd, yyyy")}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-muted-foreground text-xs uppercase font-semibold">End: </span>
                                                                    <span>{format(new Date(session.endDate), "MMM dd, yyyy")}</span>
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-wrap gap-1.5 pt-2 mt-2 border-t border-slate-100">
                                                                {!session.isCurrent && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="h-7 text-xs"
                                                                        onClick={() => setCurrentMutation.mutate(session.id)}
                                                                        disabled={setCurrentMutation.isPending}
                                                                    >
                                                                        <Star className="w-3 h-3 mr-1" />
                                                                        Set Current
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-7 text-xs"
                                                                    onClick={() => toggleActiveMutation.mutate({
                                                                        id: session.id,
                                                                        isActive: !session.isActive
                                                                    })}
                                                                    disabled={toggleActiveMutation.isPending || session.isCurrent}
                                                                >
                                                                    {session.isActive ? "Deactivate" : "Activate"}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>

                                {/* DESKTOP TABLE VIEW (>=md) */}
                                <div className="hidden md:block overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Session</TableHead>
                                            <TableHead>Start Date</TableHead>
                                            <TableHead>End Date</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sessions
                                            .sort((a: YearSession, b: YearSession) => b.sessionName.localeCompare(a.sessionName))
                                            .map((session: YearSession) => (
                                                <TableRow key={session.id} className={session.isCurrent ? "bg-green-50" : ""}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            {session.sessionName}
                                                            {session.isCurrent && (
                                                                <Badge className="bg-green-600">
                                                                    <Star className="w-3 h-3 mr-1" />
                                                                    Current
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {format(new Date(session.startDate), "MMM dd, yyyy")}
                                                    </TableCell>
                                                    <TableCell>
                                                        {format(new Date(session.endDate), "MMM dd, yyyy")}
                                                    </TableCell>
                                                    <TableCell>
                                                        {session.isActive ? (
                                                            <Badge variant="outline" className="text-green-600 border-green-600">
                                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                                Active
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-gray-500">
                                                                <Clock className="w-3 h-3 mr-1" />
                                                                Inactive
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            {!session.isCurrent && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => setCurrentMutation.mutate(session.id)}
                                                                    disabled={setCurrentMutation.isPending}
                                                                >
                                                                    <Star className="w-3 h-3 mr-1" />
                                                                    Set Current
                                                                </Button>
                                                            )}
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => toggleActiveMutation.mutate({
                                                                    id: session.id,
                                                                    isActive: !session.isActive
                                                                })}
                                                                disabled={toggleActiveMutation.isPending || session.isCurrent}
                                                                title={session.isCurrent ? "Cannot deactivate current session" : ""}
                                                            >
                                                                {session.isActive ? "Deactivate" : "Activate"}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                                </div>
                                </>
                            ) : (
                                <div className="text-center py-8">
                                    <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                    <p className="text-muted-foreground mb-4">
                                        No year sessions found. Create one to get started.
                                    </p>
                                    <Button onClick={() => setShowCreateDialog(true)}>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Create First Session
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>

            {/* Create Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Year Session</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="startDate">Session Start Date</Label>
                            <Input
                                id="startDate"
                                type="date"
                                value={newStartDate}
                                onChange={(e) => setNewStartDate(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Typically April 1 of the starting year (e.g., 2025-04-01)
                            </p>
                        </div>
                        {newStartDate && (
                            <div className="p-3 bg-muted rounded-md">
                                <p className="text-sm">
                                    <strong>Preview:</strong> Session will be named{" "}
                                    <span className="font-mono bg-primary/10 px-1 rounded">
                                        {getPreviewSessionName(newStartDate)}
                                    </span>
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    End date will be auto-calculated as March 31 of the following year
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={createMutation.isPending || !newStartDate}
                        >
                            {createMutation.isPending ? "Creating..." : "Create Session"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
