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
    navigate("/dashboard");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b shadow-sm">
      <div className="container mx-auto px-4 py-2">
        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          
          <Button
            variant={location.pathname === "/" ? "default" : "outline"}
            size="sm"
            onClick={handleHome}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Button>
          
          <Button
            variant={location.pathname === "/dashboard" ? "default" : "outline"}
            size="sm"
            onClick={handleDashboard}
            className="gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GlobalNavigation;
