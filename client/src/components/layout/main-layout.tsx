import { useState, createContext, useContext } from "react";
import Sidebar from "./sidebar";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MainLayoutProps {
  children: React.ReactNode;
}

// Context for sidebar toggle - allows children to trigger sidebar open
const SidebarContext = createContext<{ toggle: () => void }>({ toggle: () => { } });
export const useSidebarToggle = () => useContext(SidebarContext);

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ toggle: () => setSidebarOpen((o) => !o) }}>
      <div className="h-screen flex bg-background">
        {/* Desktop Persistent Sidebar */}
        <div className={cn(
          "hidden md:block transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
          sidebarOpen ? "w-64" : "w-0"
        )}>
          <Sidebar className="w-64 min-w-[16rem]" />
        </div>

        {/* Mobile Sidebar Overlay */}
        <div className={cn(
          "fixed inset-0 z-50 md:hidden",
          sidebarOpen ? "block" : "hidden"
        )}>
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative h-full flex">
            <Sidebar className="w-64 h-full" />
            <div className="flex-1" onClick={() => setSidebarOpen(false)}></div>
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
