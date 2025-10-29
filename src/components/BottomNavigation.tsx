import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, LayoutDashboard } from "lucide-react";

interface BottomNavigationProps {
  onDashboardClick?: () => void;
}

const BottomNavigation = ({ onDashboardClick }: BottomNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    navigate(-1); // uniform history back (was window.history.back())
  };

  // Home: go to root ("/") just like top navigation
  const handleHome = () => {
    navigate("/");
  };

  // Dashboard
  const handleDashboard = () => {
    if (onDashboardClick) {
      onDashboardClick();
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t shadow-elegant z-50">
      <div className="container mx-auto px-4 py-3">
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
