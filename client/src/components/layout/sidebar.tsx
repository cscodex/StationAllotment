import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  BarChart3,
  Upload,
  Users,
  MapPin,
  Settings,
  Calendar,
  Download,
  History,
  GraduationCap,
  ShieldQuestion,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const navigation = [
  {
    name: "Main",
    items: [
      { name: "Dashboard", href: "/", icon: BarChart3, roles: ["central_admin", "district_admin"] },
      { name: "File Management", href: "/file-management", icon: Upload, roles: ["central_admin"] },
      { name: "Students", href: "/students", icon: Users, roles: ["central_admin", "district_admin"] },
      { name: "Vacancies", href: "/vacancies", icon: MapPin, roles: ["central_admin", "district_admin"] },
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Run Allocation", href: "/allocation", icon: Settings, roles: ["central_admin"] },
      { name: "Reports", href: "/reports", icon: BarChart3, roles: ["central_admin", "district_admin"] },
      { name: "Export Results", href: "/export-results", icon: Download, roles: ["central_admin"] },
      { name: "Audit Log", href: "/audit-log", icon: History, roles: ["central_admin"] },
      { name: "District Admins", href: "/district-admin-list", icon: Users, roles: ["central_admin"] },
      { name: "District Admin", href: "/district-admin", icon: ShieldQuestion, roles: ["district_admin"] },
    ],
  },
];

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out",
      });
    },
    onError: (error) => {
      toast({
        title: "Logout Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  if (!user) return null;

  return (
    <div className={cn("w-64 bg-card border-r border-border flex flex-col", className)}>
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Seat Allotment</h1>
            <p className="text-xs text-muted-foreground">Management System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((section) => (
          <div key={section.name} className="mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
              {section.name}
            </p>
            {section.items
              .filter((item) => item.roles.includes(user.role))
              .map((item) => (
                <Link 
                  key={item.name} 
                  href={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors text-sm",
                    location === item.href
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  data-testid={`link-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              ))}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
            <ShieldQuestion className="w-4 h-4 text-secondary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">
              {user.firstName && user.lastName 
                ? `${user.firstName} ${user.lastName}` 
                : user.username}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-user-role">
              {user.role === 'central_admin' ? 'Central Admin' : 'District Admin'}
              {user.district && ` - ${user.district}`}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
        </Button>
      </div>
    </div>
  );
}
