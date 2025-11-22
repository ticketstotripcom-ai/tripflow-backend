import { useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, LayoutDashboard } from "lucide-react";
import { stateManager } from "@/lib/stateManager";
import { emitGlobalPopupClose } from "@/hooks/useGlobalPopupClose";

interface BottomNavigationProps {
  onDashboardClick?: () => void;
}

const BottomNavigation = ({ onDashboardClick }: BottomNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.log('[BottomNavigation] mounted at route:', location.pathname + (location.search || ''));
    return () => console.log('[BottomNavigation] unmounted');
  }, []);

  const handleBack = () => {
    emitGlobalPopupClose();
    navigate(-1); // uniform history back (was window.history.back())
  };

  // Home: go to root ("/") just like top navigation
  const handleHome = () => {
    emitGlobalPopupClose();
    // Always reset Home to Working tab and clear filters
    stateManager.setActiveTab('working');
    stateManager.setFilters({
      statusFilter: 'All Statuses',
      priorityFilter: 'All Priorities',
      dateFilter: '',
      dateFromFilter: '',
      dateToFilter: '',
      consultantFilter: 'All Consultants',
    });
    navigate("/");
  };

  // Dashboard - navigate directly to analytics view
  const handleDashboard = () => {
    emitGlobalPopupClose();
    if (onDashboardClick) {
      onDashboardClick();
    } else {
      // Clear filters when going to dashboard analytics view
      stateManager.setFilters({
        statusFilter: 'All Statuses',
        priorityFilter: 'All Priorities',
        dateFilter: '',
        dateFromFilter: '',
        dateToFilter: '',
        consultantFilter: 'All Consultants',
      });
      stateManager.setActiveTab('dashboard');
      navigate("/dashboard?view=analytics");
    }
  };

  return (
    <div className="bottom-nav bg-card/80 backdrop-blur-md shadow-soft" role="navigation" aria-label="Bottom navigation">
      <div className="container mx-auto px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0)+0.75rem)]">
        <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto justify-items-center">
          <Button
            variant="outline"
            size="icon"
            aria-label="Back"
            onClick={handleBack}
            className="h-12 w-12 transition-transform hover:scale-105"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button
            variant={location.pathname === "/" ? "default" : "outline"}
            size="icon"
            aria-label="Home"
            onClick={handleHome}
            className="h-12 w-12 transition-transform hover:scale-105"
          >
            <Home className="h-5 w-5" />
          </Button>
          <Button
            variant={location.pathname.startsWith("/dashboard") ? "default" : "outline"}
            size="icon"
            aria-label="Dashboard"
            onClick={handleDashboard}
            className="h-12 w-12 transition-transform hover:scale-105"
          >
            <LayoutDashboard className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BottomNavigation;
