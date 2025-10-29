import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/authService";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ConsultantDashboard from "@/components/dashboard/ConsultantDashboard";

const Index = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState(authService.getSession());

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate("/auth");
    }
  }, [navigate]);

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-subtle pb-24 sm:pb-20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle pb-24 sm:pb-20">
      <main className="w-full px-2 sm:px-4 py-3 sm:py-6 space-y-4 sm:space-y-6">
        {session.user.role === 'admin' ? <AdminDashboard /> : <ConsultantDashboard />}
      </main>
    </div>
  );
};

export default Index;
