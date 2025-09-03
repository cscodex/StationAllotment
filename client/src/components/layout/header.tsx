import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Menu, Bell, Clock } from "lucide-react";

interface HeaderProps {
  title: string;
  breadcrumbs?: { name: string; href?: string }[];
  onMobileMenuToggle?: () => void;
}

export default function Header({ title, breadcrumbs = [], onMobileMenuToggle }: HeaderProps) {
  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const deadline = settings?.find((s: any) => s.key === 'allocation_deadline')?.value;
  const deadlineDate = deadline ? new Date(deadline) : null;
  const daysLeft = deadlineDate ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

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
          
          <Button variant="ghost" size="sm" className="relative" data-testid="button-notifications">
            <Bell className="w-4 h-4" />
            <Badge variant="destructive" className="absolute -top-1 -right-1 w-2 h-2 p-0" />
          </Button>
        </div>
      </div>
    </header>
  );
}
