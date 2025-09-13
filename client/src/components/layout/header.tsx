import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { Menu, Bell, Clock, Users, CheckCircle, XCircle, Eye, Lock, Unlock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import type { DistrictStatus, Student } from "@shared/schema";

interface HeaderProps {
  title: string;
  breadcrumbs?: { name: string; href?: string }[];
  onMobileMenuToggle?: () => void;
}

export default function Header({ title, breadcrumbs = [], onMobileMenuToggle }: HeaderProps) {
  const { user } = useAuth();
  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  // Fetch district statuses for central admin
  const { data: districtStatuses } = useQuery<DistrictStatus[]>({
    queryKey: ["/api/district-status"],
    enabled: user?.role === 'central_admin',
  });

  // Fetch students for locked count display for central admin
  const { data: studentsData } = useQuery<{ students: Student[] }>({
    queryKey: ["/api/students"],
    enabled: user?.role === 'central_admin',
  });

  // Fetch unlock requests for notifications count
  const { data: unlockRequests } = useQuery({
    queryKey: ["/api/unlock-requests"],
    enabled: user?.role === 'central_admin',
  });

  const pendingUnlockRequests = Array.isArray(unlockRequests) 
    ? unlockRequests.filter((req: any) => req.status === 'pending').length 
    : 0;

  const deadline = Array.isArray(settings) ? settings.find((s: any) => s.key === 'allocation_deadline')?.value : null;
  const deadlineDate = deadline ? new Date(deadline) : null;
  const daysLeft = deadlineDate ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  const finalizedDistricts = districtStatuses?.filter(ds => ds.isFinalized).length || 0;
  const totalDistricts = districtStatuses?.length || 0;
  const pendingDistricts = totalDistricts - finalizedDistricts;

  // Calculate locked student counts for central admin
  const students = studentsData?.students || [];
  const lockedStudents = students.filter(s => s.lockedBy).length;
  const totalStudents = students.length;
  const unlockedStudents = totalStudents - lockedStudents;

  return (
    <header className="bg-card border-b border-border p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={onMobileMenuToggle}
            data-testid="button-mobile-menu"
          >
            <Menu className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold" data-testid="text-page-title">{title}</h2>
            {breadcrumbs.length > 0 && (
              <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
                {breadcrumbs.map((crumb, index) => (
                  <span key={index}>
                    {index > 0 && <span className="mx-1">›</span>}
                    <span className={index === breadcrumbs.length - 1 ? "text-foreground" : ""}>
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </nav>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {deadlineDate && daysLeft !== null && (
            <Badge variant={daysLeft <= 3 ? "destructive" : "secondary"} className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span data-testid="text-deadline">
                {daysLeft > 0 ? `${daysLeft} days left` : "Deadline passed"}
              </span>
            </Badge>
          )}

          {user?.role === 'central_admin' && studentsData && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2" data-testid="button-locked-students-status">
                  <Lock className="w-4 h-4" />
                  <span>{lockedStudents}/{totalStudents}</span>
                  <Badge variant={unlockedStudents > 0 ? "secondary" : "default"} className="ml-1">
                    {unlockedStudents > 0 ? "Unlocked" : "All Locked"}
                  </Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Student Lock Status</h4>
                    <Badge variant={lockedStudents === totalStudents ? "default" : "secondary"}>
                      {lockedStudents}/{totalStudents} Locked
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Lock className="w-4 h-4 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium">Locked</p>
                        <p className="text-lg font-bold text-blue-600">{lockedStudents}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Unlock className="w-4 h-4 text-amber-600" />
                      <div>
                        <p className="text-sm font-medium">Unlocked</p>
                        <p className="text-lg font-bold text-amber-600">{unlockedStudents}</p>
                      </div>
                    </div>
                  </div>

                  {totalStudents > 0 && (
                    <div className="p-3 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        {lockedStudents === totalStudents 
                          ? "All students are locked and ready for allocation." 
                          : `${unlockedStudents} students still need to be locked before final allocation.`}
                      </p>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          {user?.role === 'central_admin' && districtStatuses && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2" data-testid="button-district-status">
                  <Users className="w-4 h-4" />
                  <span>{finalizedDistricts}/{totalDistricts}</span>
                  <Badge variant={pendingDistricts > 0 ? "destructive" : "default"} className="ml-1">
                    {pendingDistricts > 0 ? "Pending" : "All Done"}
                  </Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">District Status</h4>
                    <Badge variant={pendingDistricts === 0 ? "default" : "secondary"}>
                      {finalizedDistricts}/{totalDistricts} Finalized
                    </Badge>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {districtStatuses.map((district) => (
                      <div key={district.id} className="flex items-center justify-between p-2 rounded border">
                        <div className="flex items-center space-x-2">
                          {district.isFinalized ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          <span className="font-medium">{district.district}</span>
                        </div>
                        <div className="text-right text-sm text-gray-600">
                          <div>{district.lockedStudents}/{district.totalStudents} locked</div>
                          <div className="text-xs">{district.studentsWithChoices} with choices</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {pendingDistricts > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm text-amber-600 flex items-center space-x-1">
                        <XCircle className="w-4 h-4" />
                        <span>{pendingDistricts} districts need to finalize their data</span>
                      </p>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          {user?.role === 'central_admin' && (
            <Link href="/notifications">
              <Button variant="ghost" size="sm" className="relative" data-testid="button-notifications">
                <Bell className="w-4 h-4" />
                {pendingUnlockRequests > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-xs p-0"
                  >
                    {pendingUnlockRequests}
                  </Badge>
                )}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
