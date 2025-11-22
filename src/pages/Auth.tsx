import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { authService } from "@/lib/authService";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Redirect if already logged in — go to Home
    if (authService.isAuthenticated()) {
      navigate("/");
    }
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { session, error } = await authService.login(email, password);
      
      if (error || !session) {
        throw error || new Error("Login failed");
      }

      toast({ 
        title: "Welcome back!",
        description: `Logged in as ${session.user.role}`
      });
      // After login land on Home (leads) by default
      navigate("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: error.message || "Invalid credentials. Please check your email and password.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4 pt-20">
      <Card className="w-full max-w-md shadow-soft">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Tickets To Trip
          </CardTitle>
          <CardDescription>
            Sign in with your credentials from Google Sheets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground space-y-2">
            <p>Login credentials from Google Sheets BACKEND SHEET</p>
            <p className="text-xs">Configure Google Sheets in Settings after first login</p>
            <div className="mt-4 p-3 border border-primary/20 rounded-lg bg-primary/5">
              <p className="font-semibold text-primary">Default Admin Account</p>
              <p className="text-xs mt-1">Email: ticketstotrip.com@gmail.com</p>
              <p className="text-xs">Password: 123456</p>
              <p className="text-xs mt-2 text-muted-foreground">Use this to login and setup Google Sheets credentials</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;

