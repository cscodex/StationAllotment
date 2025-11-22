import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AcademicYearSelector } from "@/components/ui/academic-year-selector";
import { 
  Calendar, 
  Plus, 
  Play, 
  CheckCircle, 
  Clock, 
  Edit,
  AlertTriangle,
  XCircle,
  Trash2,
  Rocket,
  Minus
} from "lucide-react";
import { format } from "date-fns";

const roundRowSchema = z.object({
  startDate: z.string().min(1, "Start date and time is required"),
});

const createRoundsSchema = z.object({
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, "Format: YYYY-YYYY (e.g., 2024-2025)"),
  roundName: z.string().min(1, "Counseling title is required"),
  rounds: z.array(roundRowSchema).min(1, "At least one round is required"),
});

type RoundRow = z.infer<typeof roundRowSchema>;
type CreateRoundsForm = z.infer<typeof createRoundsSchema>;

interface CounselingRound {
  id: string;
  academicYear: string;
  roundNumber: number;
  roundName: string | null;
  startDate: string;
  isActive: boolean;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CounselingRounds() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRound, setEditingRound] = useState<CounselingRound | null>(null);
  const [editStartDate, setEditStartDate] = useState<string>("");
  const [roundRows, setRoundRows] = useState<RoundRow[]>([
    { startDate: "" }
  ]);

  // Fetch current session
  const { data: currentSessionData } = useQuery<{ currentSession: string }>({
    queryKey: ["/api/session/current"],
    enabled: true,
  });
  const currentSession = currentSessionData?.currentSession || "";

  const form = useForm<CreateRoundsForm>({
    resolver: zodResolver(createRoundsSchema),
    defaultValues: {
      academicYear: selectedAcademicYear || "",
      roundName: "",
      rounds: roundRows,
    },
  });
  
  // Sync form when selectedAcademicYear changes
  useEffect(() => {
    if (selectedAcademicYear) {
      form.setValue("academicYear", selectedAcademicYear);
    }
  }, [selectedAcademicYear, form]);
  
  // Sync form when roundRows changes
  useEffect(() => {
    form.setValue("rounds", roundRows);
  }, [roundRows.length, form]);

  // Fetch counseling rounds
  const { data: rounds, isLoading, error, refetch } = useQuery<CounselingRound[]>({
    queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }],
    queryFn: async ({ queryKey }) => {
      if (!selectedAcademicYear) return [];
      const url = `/api/counseling-rounds?academicYear=${encodeURIComponent(selectedAcademicYear)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch rounds:", res.status, errorText);
        let errorMessage = `Failed to fetch: ${res.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If parsing fails, use the text as is
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      const data = await res.json();
      console.log(`Fetched ${data.length} rounds for ${selectedAcademicYear}:`, data);
      return data;
    },
    enabled: !!selectedAcademicYear,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Bulk create rounds mutation
  const bulkCreateRoundsMutation = useMutation({
    mutationFn: async (data: CreateRoundsForm) => {
      const rounds = data.rounds.map(round => ({
        academicYear: data.academicYear,
        roundName: data.roundName,
        startDate: round.startDate,
      }));
      const res = await apiRequest("POST", "/api/counseling-rounds/bulk", { rounds });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      const count = Array.isArray(data) ? data.length : (data?.count || 1);
      toast({
        title: "Success",
        description: `${count} counseling round(s) created successfully`,
      });
      setShowCreateDialog(false);
      setRoundRows([{ startDate: "" }]);
      form.reset({
        academicYear: selectedAcademicYear || "",
        roundName: "",
        rounds: [{ startDate: "" }],
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create counseling rounds",
        variant: "destructive",
      });
    },
  });

  // Delete round mutation
  const deleteRoundMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/counseling-rounds/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      toast({
        title: "Success",
        description: "Counseling round deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete counseling round",
        variant: "destructive",
      });
    },
  });

  // Run allocation mutation
  const runAllocationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/counseling-rounds/${id}/run-allocation`);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      refetch();
      toast({
        title: "Allocation Completed",
        description: `Allocated ${data.allottedStudents} out of ${data.totalStudents} students`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to run allocation",
        variant: "destructive",
      });
    },
  });

  // Activate round mutation
  const activateRoundMutation = useMutation({
    mutationFn: async ({ id, academicYear }: { id: string; academicYear: string }) => {
      const res = await apiRequest("POST", `/api/counseling-rounds/${id}/activate`, { academicYear });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      toast({
        title: "Success",
        description: "Counseling round activated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to activate counseling round",
        variant: "destructive",
      });
    },
  });

  // Complete round mutation
  const completeRoundMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/counseling-rounds/${id}/complete`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      toast({
        title: "Success",
        description: "Counseling round completed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete counseling round",
        variant: "destructive",
      });
    },
  });

  // Update round start date mutation
  const updateRoundMutation = useMutation({
    mutationFn: async ({ id, startDate }: { id: string; startDate: string }) => {
      const res = await apiRequest("PUT", `/api/counseling-rounds/${id}`, { startDate });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counseling-rounds", { academicYear: selectedAcademicYear }] });
      refetch();
      setEditingRound(null);
      setEditStartDate("");
      toast({
        title: "Success",
        description: "Start date updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update start date",
        variant: "destructive",
      });
    },
  });

  const handleCreateRounds = (data: CreateRoundsForm) => {
    // Ensure rounds array is properly populated from form
    const formRounds = data.rounds || roundRows;
    if (!formRounds || formRounds.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one round",
        variant: "destructive",
      });
      return;
    }
    
    // Validate all rounds have dates
    const invalidRounds = formRounds.filter(r => !r.startDate);
    if (invalidRounds.length > 0) {
      toast({
        title: "Error",
        description: "Please fill in all date fields",
        variant: "destructive",
      });
      return;
    }
    
    bulkCreateRoundsMutation.mutate({
      ...data,
      rounds: formRounds,
    });
  };

  const addRoundRow = () => {
    const newRows = [...roundRows, { startDate: "" }];
    setRoundRows(newRows);
    form.setValue("rounds", newRows);
  };

  const removeRoundRow = (index: number) => {
    if (roundRows.length > 1) {
      const newRows = roundRows.filter((_, i) => i !== index);
      setRoundRows(newRows);
      form.setValue("rounds", newRows);
    }
  };

  const handleDelete = (round: CounselingRound) => {
    if (confirm(`Delete ${round.roundName} - Round ${round.roundNumber}? This action cannot be undone.`)) {
      deleteRoundMutation.mutate(round.id);
    }
  };

  const handleRunAllocation = (round: CounselingRound) => {
    if (confirm(`Run allocation for ${round.roundName} - Round ${round.roundNumber}? This will assign vacant seats to eligible students.`)) {
      runAllocationMutation.mutate(round.id);
    }
  };

  const canDelete = (round: CounselingRound) => {
    return !round.isActive && !round.isCompleted;
  };

  const isPastRound = (round: CounselingRound) => {
    const startDate = new Date(round.startDate);
    const now = new Date();
    return startDate < now;
  };

  const handleActivate = (round: CounselingRound) => {
    if (confirm(`Activate ${round.roundName || `Round ${round.roundNumber}`}? This will deactivate any other active round for ${round.academicYear}.`)) {
      activateRoundMutation.mutate({ id: round.id, academicYear: round.academicYear });
    }
  };

  const handleComplete = (round: CounselingRound) => {
    if (confirm(`Mark ${round.roundName || `Round ${round.roundNumber}`} as completed?`)) {
      completeRoundMutation.mutate(round.id);
    }
  };

  const handleEdit = (round: CounselingRound) => {
    // Check if startDate exists and is valid
    if (!round.startDate || round.startDate === 'null' || round.startDate === null) {
      console.error('No startDate in round:', round);
      toast({
        title: "Error",
        description: "This round has no start date. Please delete and recreate it with a valid date.",
        variant: "destructive",
      });
      return;
    }
    
    // Convert startDate to datetime-local format
    // Handle invalid dates that might default to 1970
    const startDate = new Date(round.startDate);
    
    // Check if date is valid (not 1970 epoch)
    if (isNaN(startDate.getTime()) || startDate.getFullYear() < 2000) {
      console.error('Invalid date received:', {
        roundId: round.id,
        startDate: round.startDate,
        parsed: startDate.toISOString(),
        timestamp: startDate.getTime(),
        year: startDate.getFullYear()
      });
      toast({
        title: "Error",
        description: `Invalid date detected (${round.startDate}). Please delete this round and recreate it with a valid date.`,
        variant: "destructive",
      });
      return;
    }
    
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const hours = String(startDate.getHours()).padStart(2, '0');
    const minutes = String(startDate.getMinutes()).padStart(2, '0');
    const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
    setEditStartDate(datetimeLocal);
    setEditingRound(round);
  };

  const handleSaveEdit = () => {
    if (editingRound && editStartDate) {
      updateRoundMutation.mutate({ id: editingRound.id, startDate: editStartDate });
    }
  };

  if (user?.role !== 'central_admin') {
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Counseling Rounds" />
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
        title="Counseling Rounds Management" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Operations" },
          { name: "Counseling Rounds" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Academic Year Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                Select Academic Year
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <AcademicYearSelector
                  value={selectedAcademicYear}
                  onValueChange={setSelectedAcademicYear}
                  className="max-w-xs"
                />
                {currentSession && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="w-4 h-4" />
                    <span>
                      <strong>Note:</strong> You can only create counseling rounds and run allocations for the current session ({currentSession}).
                      {selectedAcademicYear && selectedAcademicYear !== currentSession && (
                        <span className="text-destructive ml-1">
                          Selected year is not the current session.
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Rounds List */}
          {selectedAcademicYear && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Counseling Rounds - {selectedAcademicYear}</CardTitle>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Round
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : error ? (
                  <div className="text-red-600 p-4 border border-red-300 rounded bg-red-50">
                    <p className="font-semibold mb-2">Error loading rounds:</p>
                    <p className="text-sm mb-3">{error instanceof Error ? error.message : String(error)}</p>
                    <Button onClick={() => refetch()} className="mt-2" size="sm" variant="outline">
                      Retry
                    </Button>
                  </div>
                ) : rounds && rounds.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Counseling Title</TableHead>
                        <TableHead>Round No.</TableHead>
                        <TableHead>Start Date & Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rounds.map((round) => (
                        <TableRow key={round.id}>
                          <TableCell className="font-medium">
                            {round.roundName}
                          </TableCell>
                          <TableCell className="font-medium">
                            {round.roundNumber}
                          </TableCell>
                          <TableCell>
                            {round.startDate && round.startDate !== 'null' ? (
                              (() => {
                                try {
                                  const date = new Date(round.startDate);
                                  if (!isNaN(date.getTime())) {
                                    return format(date, "MMM dd, yyyy HH:mm");
                                  }
                                } catch (e) {
                                  console.error('Error formatting date:', round.startDate, e);
                                }
                                return <span className="text-muted-foreground italic">Invalid date</span>;
                              })()
                            ) : (
                              <span className="text-muted-foreground italic">No date set</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {round.isCompleted ? (
                              <Badge variant="default" className="bg-green-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Completed
                              </Badge>
                            ) : round.isActive ? (
                              <Badge variant="default" className="bg-blue-600">
                                <Play className="w-3 h-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="w-3 h-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2 flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(round)}
                                disabled={round.isCompleted}
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                              {round.isActive && !round.isCompleted && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleRunAllocation(round)}
                                    disabled={runAllocationMutation.isPending}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    <Rocket className="w-3 h-3 mr-1" />
                                    Run Allocation
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleComplete(round)}
                                    disabled={completeRoundMutation.isPending}
                                  >
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Complete
                                  </Button>
                                </>
                              )}
                              {canDelete(round) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(round)}
                                  disabled={deleteRoundMutation.isPending || isPastRound(round)}
                                  className="text-red-600 hover:text-red-700"
                                  title={isPastRound(round) ? "Cannot delete past counseling rounds" : "Delete round"}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">
                      No counseling rounds found for {selectedAcademicYear}
                    </p>
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Round
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!selectedAcademicYear && (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Please select an academic year to view or create counseling rounds
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Create Rounds Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Counseling Rounds</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateRounds)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="academicYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Academic Year</FormLabel>
                      <FormControl>
                        <AcademicYearSelector
                          value={field.value}
                          onValueChange={field.onChange}
                          showLabel={false}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="roundName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Counseling Title *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Meritorious School, Regular Counseling, Special Counseling" {...field} />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        Each counseling can have multiple rounds. Round numbers (1, 2, 3...) will be automatically assigned within each counseling.
                      </p>
                    </FormItem>
                  )}
                />
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <FormLabel>Rounds</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addRoundRow}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Round
                    </Button>
                  </div>
                  
                  <div className="space-y-3 border rounded-lg p-4">
                    {roundRows.map((_, index) => (
                      <div key={index} className="flex items-end gap-2 p-3 bg-muted/50 rounded-md">
                        <div className="flex-1">
                          <FormField
                            control={form.control}
                            name={`rounds.${index}.startDate`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Start Date & Time</FormLabel>
                                <FormControl>
                                  <Input type="datetime-local" {...field} />
                                </FormControl>
                                <FormMessage />
                                <p className="text-xs text-muted-foreground">
                                  Round will automatically activate when this date/time is reached
                                </p>
                              </FormItem>
                            )}
                          />
                        </div>
                        {roundRows.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeRoundRow(index)}
                            className="mb-0"
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateDialog(false);
                      setRoundRows([{ startDate: "" }]);
                      form.reset({
                        academicYear: selectedAcademicYear || "",
                        roundName: "",
                        rounds: [{ startDate: "" }],
                      });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={bulkCreateRoundsMutation.isPending}>
                    {bulkCreateRoundsMutation.isPending ? "Creating..." : `Create ${roundRows.length} Round(s)`}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Edit Start Date Dialog */}
        <Dialog open={!!editingRound} onOpenChange={(open) => !open && setEditingRound(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Start Date & Time</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Start Date & Time</label>
                <Input
                  type="datetime-local"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Round will automatically activate when this date/time is reached
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingRound(null);
                  setEditStartDate("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={!editStartDate || updateRoundMutation.isPending}
              >
                {updateRoundMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

