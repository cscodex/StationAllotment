import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { Menu, Bell, Clock, Users, CheckCircle, XCircle, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { DistrictStatus } from "@shared/schema";

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

  const deadline = settings?.find((s: any) => s.key === 'allocation_deadline')?.value;
  const deadlineDate = deadline ? new Date(deadline) : null;
  const daysLeft = deadlineDate ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  const finalizedDistricts = districtStatuses?.filter(ds => ds.isFinalized).length || 0;
  const totalDistricts = districtStatuses?.length || 0;
  const pendingDistricts = totalDistricts - finalizedDistricts;

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
          
          <Button variant="ghost" size="sm" className="relative" data-testid="button-notifications">
            <Bell className="w-4 h-4" />
            <Badge variant="destructive" className="absolute -top-1 -right-1 w-2 h-2 p-0" />
          </Button>
        </div>
      </div>
    </header>
  );
}
