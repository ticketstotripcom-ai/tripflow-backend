import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { SheetLead } from "@/lib/googleSheets";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, TrendingUp, Users as UsersIcon, Calendar, X } from "lucide-react";
import { emitGlobalPopupOpen, emitGlobalPopupClose } from "@/hooks/useGlobalPopupClose";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface LeadDetailDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  leads: SheetLead[];
  color: string;
}

const STATE_LIST = [
  "KERALA",
  "RAJASTHAN", 
  "UTTARAKHAND",
  "HIMACHAL PRADESH",
  "KASHMIR",
  "ODISHA",
  "BHUTAN",
  "NORTH EAST",
  "KARNATAKA",
  "TAMIL NADU",
  "GOA",
  "NEPAL",
  "ANDAMAN",
  "UTTAR PRADESH",
  "CHARDHAM",
  "LAKSHADWEEP",
  "GOLDEN TRIANGLE",
  "THAILAND",
  "MAHARASHTRA",
  "DUBAI",
  "GUJARAT",
  "MEGHALAYA",
  "DELHI",
  "LEH",
  "VIETNAM",
  "BALI",
  "ARUNACHAL PRADESH",
  "ANDRA PRADESH",
  "SINGAPORE",
  "AZERBAIJAN",
  "UNITED STATE",
  "PUNJAB"
];

const LeadDetailDialog = ({ open, onClose, title, leads, color }: LeadDetailDialogProps) => {
  useEffect(() => {
    // Only emit popup events when dialog is fully open and interactive
    // Add a small delay to ensure the dialog is actually rendered
    if (open) {
      const timer = setTimeout(() => {
        emitGlobalPopupOpen();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      emitGlobalPopupClose();
    }
  }, [open]);

  // Ensure popup state is closed when this component unmounts
  useEffect(() => {
    return () => {
      emitGlobalPopupClose();
    };
  }, []);
  
  // Group leads by state
  const leadsByState = useMemo(() => {
    const grouped: { [key: string]: SheetLead[] } = {};
    leads.forEach(lead => {
      const state = lead.travelState || 'Unknown';
      if (!grouped[state]) {
        grouped[state] = [];
      }
      grouped[state].push(lead);
    });
    return Object.entries(grouped)
      .map(([state, stateLeads]) => ({ state, count: stateLeads.length, leads: stateLeads }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [leads]);

  // Group leads by status
  const leadsByStatus = useMemo(() => {
    const grouped: { [key: string]: number } = {};
    leads.forEach(lead => {
      const status = lead.status || 'Unknown';
      grouped[status] = (grouped[status] || 0) + 1;
    });
    return Object.entries(grouped)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // Calculate monthly trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const months: { [key: string]: number } = {};
    
    leads.forEach(lead => {
      if (lead.dateAndTime) {
        try {
          const date = new Date(lead.dateAndTime);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          months[monthKey] = (months[monthKey] || 0) + 1;
        } catch (e) {
          // Skip invalid dates
        }
      }
    });

    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, count]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        count
      }));
  }, [leads]);

  const maxMonthCount = Math.max(...monthlyTrend.map(m => m.count), 1);
  const maxStateCount = Math.max(...leadsByState.map(s => s.count), 1);

  const PIE_COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(var(--chart-6))',
    'hsl(var(--chart-7))',
    'hsl(var(--chart-8))',
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-6xl max-h-[85vh] flex flex-col mx-auto">
        <DialogHeader className="flex-shrink-0 pb-4">
          <DialogTitle className={`text-2xl ${color}`}>
            {title} - Detailed Analytics ({leads.length} leads)
          </DialogTitle>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
        </DialogHeader>

        <div className="space-y-6 flex-1 overflow-y-auto pb-20">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <UsersIcon className="h-4 w-4" />
                  Total Leads
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{leads.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Unique States
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{leadsByState.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Avg Per Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {monthlyTrend.length > 0 
                    ? Math.round(monthlyTrend.reduce((sum, m) => sum + m.count, 0) / monthlyTrend.length)
                    : 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Trend Graph */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Monthly Trend (Last 6 Months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyTrend.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyTrend} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))', 
                        borderRadius: '8px' 
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Leads by State Graph */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Top Destinations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leadsByState.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={leadsByState.map(s => ({ name: s.state, count: s.count }))} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))', 
                        borderRadius: '8px' 
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Status Breakdown Graph */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Status Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leadsByStatus.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={leadsByStatus.map(s => ({ name: s.status, count: s.count }))} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))', 
                        borderRadius: '8px' 
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LeadDetailDialog;
