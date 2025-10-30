import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, LayoutDashboard } from "lucide-react";

const GlobalNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    navigate(-1);
  };

  const handleHome = () => {
    navigate("/");
  };

  const handleDashboard = () => {
    navigate("/dashboard?view=analytics");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b shadow-sm">
      <div className="w-full px-2 sm:px-4 py-2">
        <div className="flex gap-1 sm:gap-2 items-center justify-center max-w-md mx-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="gap-1 flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-4"
          >
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">Back</span>
          </Button>
          
          <Button
            variant={location.pathname === "/" ? "default" : "outline"}
            size="sm"
            onClick={handleHome}
            className="gap-1 flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-4"
          >
            <Home className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">Home</span>
          </Button>
          
          <Button
            variant={location.pathname === "/dashboard" ? "default" : "outline"}
            size="sm"
            onClick={handleDashboard}
            className="gap-1 flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-4"
          >
            <LayoutDashboard className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">Dashboard</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GlobalNavigation;
