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
    window.history.back();
  };

  const handleHome = () => {
    navigate('/dashboard?view=leads');
  };

  const handleDashboard = () => {
    if (onDashboardClick) {
      onDashboardClick();
    } else {
      navigate('/dashboard?view=analytics');
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t shadow-elegant z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
          <Button
            variant="outline"
            onClick={handleBack}
            className="gap-2 transition-all hover:scale-105"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            variant="outline"
            onClick={handleHome}
            className="gap-2 transition-all hover:scale-105"
          >
            <Home className="h-4 w-4" />
            Home
          </Button>
          <Button
            variant="outline"
            onClick={handleDashboard}
            className="gap-2 transition-all hover:scale-105"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BottomNavigation;
