import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight } from "lucide-react";
import { authService } from "@/lib/authService";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-redirect to dashboard if already authenticated
    if (authService.isAuthenticated()) {
      navigate("/dashboard?view=leads", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4>
      <div className="text-center space-y-8 max-w-2xl animate-fade-in">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center shadow-glow">
            <TrendingUp className="h-10 w-10 text-white" />
          </div>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Tickets To Trip
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-lg mx-auto">
          Professional CRM for travel consultants. Manage leads, track conversations, and close deals faster.
        </p>

        <div className="flex gap-4 justify-center pt-4">
          <Button size="lg" onClick={() => navigate("/auth")} className="shadow-soft">
            Get Started <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
