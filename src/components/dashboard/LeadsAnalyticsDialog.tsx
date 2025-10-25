import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SheetLead } from "@/lib/googleSheets";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, TrendingUp, Users as UsersIcon, Calendar } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LeadsAnalyticsDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  leads: SheetLead[];
  color: string;
}

const LeadsAnalyticsDialog = ({ open, onClose, title, leads, color }: LeadsAnalyticsDialogProps) => {
  
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
      .slice(0, 8); // Top 8 states
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className={`text-2xl ${color}`}>
            {title} - Detailed Analytics ({leads.length} leads)
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-6">
            
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

            {/* Monthly Trend Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Monthly Trend (Last 6 Months)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {monthlyTrend.map(({ month, count }) => (
                    <div key={month} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{month}</span>
                        <span className="text-muted-foreground">{count} leads</span>
                      </div>
                      <div className="h-8 bg-muted rounded-lg overflow-hidden">
                        <div
                          className={`h-full ${color.replace('text-', 'bg-')} transition-all duration-500 flex items-center justify-end pr-2`}
                          style={{ width: `${(count / maxMonthCount) * 100}%` }}
                        >
                          {count > 0 && (
                            <span className="text-xs font-bold text-white">{count}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {monthlyTrend.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No data available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Leads by State (Horizontal Bar Chart) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Top Destinations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leadsByState.map(({ state, count }) => (
                    <div key={state} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{state}</span>
                        <span className="text-muted-foreground">{count} leads ({((count / leads.length) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="h-8 bg-muted rounded-lg overflow-hidden">
                        <div
                          className={`h-full ${color.replace('text-', 'bg-')} transition-all duration-500 flex items-center justify-end pr-2`}
                          style={{ width: `${(count / maxStateCount) * 100}%` }}
                        >
                          <span className="text-xs font-bold text-white">{count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Leads by Status (Pie Chart as Horizontal Bars) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leadsByStatus.map(({ status, count }) => (
                    <div key={status} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{status}</span>
                        <span className="text-muted-foreground">{count} leads ({((count / leads.length) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="h-6 bg-muted rounded-lg overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                          style={{ width: `${(count / leads.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default LeadsAnalyticsDialog;
