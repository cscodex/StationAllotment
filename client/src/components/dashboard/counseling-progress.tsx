import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function CounselingProgress() {
    const { data: stats } = useQuery<any>({ queryKey: ["/api/dashboard/stats"] });
    const { data: allocationStatus } = useQuery<any>({ queryKey: ["/api/allocation/status"] });
    const { data: files } = useQuery<any[]>({ queryKey: ["/api/files"] });
    const { data: districtStatuses } = useQuery<any[]>({ queryKey: ["/api/district-status"] });
    const { data: studentsResponse } = useQuery<any>({ queryKey: ["/api/students?limit=50000"] });

    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const forceFinalizeMutation = useMutation({
        mutationFn: async (district: string) => {
            await apiRequest("POST", `/api/district-status/${district}/finalize`, {});
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/district-status"] });
            queryClient.invalidateQueries({ queryKey: ["/api/students"] });
            toast({
                title: "District Force Finalized",
                description: "The district has been finalized successfully and remaining students locked.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Finalization Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    const students = Array.isArray(studentsResponse) ? studentsResponse : studentsResponse?.students || [];
    const lockedStudentsCount = students.filter((s: any) => s.lockedBy || s.isLocked).length;
    const unlockedStudentsCount = students.filter((s: any) => !s.lockedBy && !s.isLocked && s.choice1 && s.stream).length;
    
    // Instead of using all students in DB, we only track eligible ones for locking progress
    const eligibleForLocking = lockedStudentsCount + unlockedStudentsCount;
    // Registration still uses total DB entries
    const totalStudentsRegistered = stats?.totalStudents || 0;

    const hasFiles = files && files.some((f: any) => f.status === 'processed');
    const hasMultipleFiles = files && files.filter((f: any) => f.status === 'processed').length >= 2;
    const isFinalized = allocationStatus?.finalized;
    const isAllocated = allocationStatus?.completed;
    const hasLocked = lockedStudentsCount > 0;

    const districts = districtStatuses || [];
    const finalizedCount = districts.filter(d => d.isFinalized).length;
    const totalDistricts = districts.length;

    const filesCount = files?.length || 0;
    const steps = [
        { title: "Upload Files", href: "/file-management", stats: `${filesCount}/3`, percent: Math.min((filesCount / 3) * 100, 100) },
        { title: "Register Students", href: "/students", stats: `${totalStudentsRegistered}`, percent: totalStudentsRegistered > 0 ? 100 : 0 },
        { title: "Lock Choices", href: "/district-admin-list", stats: `${lockedStudentsCount}/${eligibleForLocking}`, percent: eligibleForLocking > 0 ? (lockedStudentsCount / eligibleForLocking) * 100 : 0 },
        { title: "Finalize Data", href: "/reports", stats: `${finalizedCount}/${totalDistricts}`, percent: totalDistricts > 0 ? (finalizedCount / totalDistricts) * 100 : 0 },
        { title: "Run Options", href: "/allocation", stats: isAllocated ? "Done" : "Wait", percent: isAllocated ? 100 : 0 },
    ];

    const getProgressBarColor = (percent: number) => {
        if (percent === 100) return "bg-green-500";
        if (percent >= 50) return "bg-yellow-500";
        if (percent > 0) return "bg-orange-500";
        return "bg-red-500"; // 0 percent is red
    };

    const getStepBadgeStyles = (percent: number) => {
        if (percent === 100) return "bg-green-100 text-green-700 border-green-500";
        if (percent >= 50) return "bg-yellow-100 text-yellow-700 border-yellow-500";
        if (percent > 0) return "bg-orange-100 text-orange-700 border-orange-500";
        return "bg-red-100 text-red-700 border-red-500";
    };

    // Helper for progress bar color
    const getProgressColor = (current: number, max: number) => {
        if (max === 0) return "bg-gray-300";
        const percent = (current / max) * 100;
        if (percent === 100) return "bg-green-500";
        if (percent >= 50) return "bg-yellow-500";
        if (percent > 0) return "bg-blue-500";
        return "bg-red-500";
    };

    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
                <CardTitle>Counseling Progress</CardTitle>
                <CardDescription>Visual state of the station allotment process</CardDescription>
            </CardHeader>
            <CardContent>
                {/* Global Progress Bar Details */}
                <div className="w-full h-2 rounded-full mb-6 flex overflow-hidden gap-1 bg-slate-100">
                    {steps.map((step, idx) => (
                        <div key={idx} className="flex-1 h-full bg-slate-200">
                            <div
                                className={`h-full transition-all duration-500 ${getProgressBarColor(step.percent)}`}
                                style={{ width: `${step.percent}%` }}
                            />
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-5 gap-2 text-center mb-6 border-b pb-6">
                    {steps.map((step, idx) => {
                        const badgeStyles = getStepBadgeStyles(step.percent);
                        return (
                            <Link key={idx} href={step.href}>
                                <div className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                                    <div className={`flex items-center justify-center p-2 rounded-full w-14 h-14 mb-1 border-2 font-bold transition-colors ${badgeStyles}`}>
                                        <span className="text-sm">{step.stats}</span>
                                    </div>
                                    <span className={`text-xs font-semibold ${step.percent > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{step.title}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* District Breakdown */}
                {districts.length > 0 && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-semibold">District-wise Progress</h3>
                            <span className="text-sm font-medium">Finalized: <span className={finalizedCount === totalDistricts ? "text-green-600" : "text-blue-600"}>{finalizedCount} / {totalDistricts}</span></span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 max-h-[300px] overflow-y-auto pr-2">
                            {districts.map((d, i) => {
                                const fillColor = getProgressColor(d.studentsWithChoices, d.totalStudents);
                                const percent = d.totalStudents > 0 ? (d.studentsWithChoices / d.totalStudents) * 100 : 0;

                                return (
                                    <div key={i} className="flex flex-col gap-1 text-sm bg-slate-50 p-3 rounded-md border">
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-xs truncate max-w-[120px]" title={d.district}>{d.district}</span>
                                            <div className="flex gap-2 text-xs items-center">
                                                <span className="text-muted-foreground" title="Students with choices filled / Total">
                                                    Choices: {d.studentsWithChoices}/{d.totalStudents}
                                                </span>
                                                <span className={`${d.isFinalized ? 'text-green-600 font-bold' : 'text-orange-500'}`}>
                                                    {d.isFinalized ? 'Final' : 'Pending'}
                                                </span>
                                                {!d.isFinalized && user?.role === 'central_admin' && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-[10px] px-2 ml-1"
                                                        onClick={() => forceFinalizeMutation.mutate(d.district)}
                                                        disabled={forceFinalizeMutation.isPending}
                                                    >
                                                        Force
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                                            <div
                                                className={`h-full transition-all duration-500 ${fillColor}`}
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
