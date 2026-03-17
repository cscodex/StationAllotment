import { useState, createContext, useContext, useEffect } from "react";
import Sidebar from "./sidebar";
import { cn } from "@/lib/utils";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MainLayoutProps {
  children: React.ReactNode;
}

// Context for sidebar toggle - allows children to trigger sidebar open
const SidebarContext = createContext<{ toggleMobile: () => void, isCollapsed: boolean, toggleCollapse: () => void }>({ 
  toggleMobile: () => { },
  isCollapsed: false,
  toggleCollapse: () => { }
});
export const useSidebarToggle = () => useContext(SidebarContext);

export default function MainLayout({ children }: MainLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Close mobile sidebar on route change (in case they click a link)
  useEffect(() => {
    const handlePopState = () => setMobileSidebarOpen(false);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <SidebarContext.Provider value={{ 
      toggleMobile: () => setMobileSidebarOpen((o) => !o),
      isCollapsed,
      toggleCollapse: () => setIsCollapsed((c) => !c)
    }}>
      <div className="h-screen flex bg-background">
        {/* Desktop Persistent Sidebar */}
        <div className={cn(
          "hidden md:block transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 relative",
          isCollapsed ? "w-16" : "w-64"
        )}>
          <Sidebar className="w-full h-full" isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed(!isCollapsed)} />
        </div>

        {/* Mobile Sidebar Overlay */}
        <div className={cn(
          "fixed inset-0 z-50 md:hidden",
          mobileSidebarOpen ? "block" : "hidden"
        )}>
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative h-full flex w-64 max-w-[80vw]">
            <Sidebar className="w-full h-full" isCollapsed={false} />
            <div className="flex-1 opacity-0" onClick={() => setMobileSidebarOpen(false)}></div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {children}
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
