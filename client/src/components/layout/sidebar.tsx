import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
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
  UserCog,
  User,
  LogOut,
  ClipboardCheck,
  Clock,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      { name: "Student Preferences", href: "/district-admin", icon: UserCog, roles: ["district_admin"] },
      { name: "Student Preference Management", href: "/student-preference-management", icon: UserCog, roles: ["central_admin"] },
      { name: "Year Sessions", href: "/year-sessions", icon: Calendar, roles: ["central_admin"] },
      { name: "Counseling Rounds", href: "/counseling-rounds", icon: Calendar, roles: ["central_admin", "district_admin"] },
      { name: "Run Allocation", href: "/allocation", icon: Settings, roles: ["central_admin"] },
      { name: "District Analysis", href: "/district-analysis", icon: BarChart3, roles: ["central_admin"] },
      { name: "Reports", href: "/reports", icon: BarChart3, roles: ["central_admin", "district_admin"] },
      { name: "Export Results", href: "/export-results", icon: Download, roles: ["central_admin"] },
      { name: "Audit Log", href: "/audit-log", icon: History, roles: ["central_admin"] },
      { name: "Manage Admins", href: "/manage-district-admins", icon: Users, roles: ["central_admin"] },
      { name: "Test Cases", href: "/test-cases", icon: ClipboardCheck, roles: ["central_admin"] },
    ],
  },
];

interface SidebarProps {
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ className, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());

  const { data: dbHealth } = useQuery<{status: string; error?: string}>({
    queryKey: ["/api/health/database"],
    refetchInterval: 30000,
  });

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Get timezone name
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneOffset = -currentTime.getTimezoneOffset() / 60;
  const timezoneOffsetString = timezoneOffset >= 0
    ? `UTC+${timezoneOffset}`
    : `UTC${timezoneOffset}`;

  // Format date and time
  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

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
    <div className={cn("h-full bg-card border-r border-border flex flex-col transition-all duration-300", className)}>
      <div className={cn("p-6 border-b border-border flex items-center justify-between", isCollapsed && "p-4 justify-center relative")}>
        <div className={cn("flex items-center space-x-3", isCollapsed && "space-x-0")}>
          <div className="w-8 h-8 flex-shrink-0 bg-primary rounded-lg flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-semibold">Seat Allotment</h1>
              <p className="text-xs text-muted-foreground">Management System</p>
            </div>
          )}
        </div>
        
        {/* Collapse Toggle Button (Desktop Only) */}
        {onToggleCollapse && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggleCollapse}
            className={cn(
              "hidden md:inline-flex text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              isCollapsed && "absolute -right-3 top-6 bg-border w-6 h-6 rounded-full border shadow-sm z-10"
            )}
          >
            {isCollapsed ? (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3"><path d="M5.5 1L4.5 2L10.5 8L4.5 14L5.5 15L12.5 8L5.5 1Z" fill="currentColor"></path></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4"><path d="M9.5 1L10.5 2L4.5 8L10.5 14L9.5 15L2.5 8L9.5 1Z" fill="currentColor"></path></svg>
            )}
          </Button>
        )}
      </div>
      <nav className={cn("flex-1 space-y-2 overflow-y-auto min-h-0 custom-scrollbar", isCollapsed ? "p-2" : "p-4")}>
        {navigation.map((section) => (
          <div key={section.name} className="mb-4">
            {!isCollapsed && (
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {section.name}
              </p>
            )}
            {section.items
              .filter((item) => item.roles.includes(user.role))
              .map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-md transition-colors",
                    isCollapsed ? "justify-center p-2 mb-1" : "space-x-3 px-3 py-2 text-sm",
                    location === item.href
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  data-testid={`link-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <item.icon className={cn("flex-shrink-0", isCollapsed ? "w-5 h-5" : "w-4 h-4")} />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              ))}
          </div>
        ))}
      </nav>

      <div className={cn("p-4 border-t border-border", isCollapsed && "p-2 pb-4")}>
        <div className={cn("flex items-center mb-3", isCollapsed ? "justify-center" : "space-x-3")}>
          <div className="w-8 h-8 flex-shrink-0 bg-secondary rounded-full flex items-center justify-center" title={isCollapsed ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username) : undefined}>
            <ShieldQuestion className="w-4 h-4 text-secondary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="text-user-name">
                {user.firstName && user.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user.username}
              </p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-user-role">
                {user.role === 'central_admin' ? 'Central Admin' : 'District Admin'}
                {user.district && ` - ${user.district}`}
              </p>
            </div>
          )}
        </div>
        <div className={cn("space-y-1", isCollapsed && "flex flex-col items-center")}>
          <Link
            href="/profile"
            className={cn(
              "flex items-center rounded-md transition-colors w-full",
              isCollapsed ? "justify-center p-2" : "space-x-3 px-3 py-2 text-sm",
              location === "/profile"
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            data-testid="link-profile"
            title={isCollapsed ? "Profile Settings" : undefined}
          >
            <User className={cn("flex-shrink-0", isCollapsed ? "w-5 h-5" : "w-4 h-4")} />
            {!isCollapsed && <span>Profile Settings</span>}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full transition-colors mb-2", isCollapsed ? "justify-center p-2 h-auto" : "justify-start text-sm px-3 py-2")}
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className={cn("flex-shrink-0", isCollapsed ? "w-5 h-5" : "w-4 h-4 mr-2")} />
            {!isCollapsed && <span>{logoutMutation.isPending ? "Signing out..." : "Sign Out"}</span>}
          </Button>

          {/* Moved Info Footer */}
          {!isCollapsed && (
            <div className="pt-3 mt-1 border-t border-border/50 text-[10px] text-muted-foreground/80">
              <div className="flex flex-col gap-1 px-1">
                <div className="flex items-center justify-between">
                  <span>{formattedDate} {formattedTime}</span>
                  <span className="font-mono" title={`${timezone} (${timezoneOffsetString})`}>
                    {timezoneOffsetString}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono">Build: c2c799b</span>
                  <div className="flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    {dbHealth?.status === 'ok' ? (
                      <span className="text-green-500 font-medium">Online ✅</span>
                    ) : (
                      <span className="text-red-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[60px]" title={dbHealth?.error || 'Offline'}>Offline ❌</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
