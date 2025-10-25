import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { Users, TrendingUp, CheckCircle, Clock, Flame } from "lucide-react";
import { useMemo, useState } from "react";
import LeadsDetailDialog from "./LeadsDetailDialog";
import HotLeadsDialog from "./HotLeadsDialog";

interface DashboardStatsProps {
  leads: SheetLead[];
}

type StatCategory = 'total' | 'new' | 'working' | 'booked' | 'hot';

const DashboardStats = ({ leads }: DashboardStatsProps) => {
  const [selectedCategory, setSelectedCategory] = useState<StatCategory | null>(null);

  // 🆕 NEW LEADS: blank or "unfollowed"
  const newLeads = useMemo(() =>
    leads.filter(lead => {
      const status = (lead.status || "").toLowerCase();
      const hasData =
        lead.travellerName?.trim() ||
        lead.phone?.trim() ||
        lead.tripId?.trim();

      return (
        hasData &&
        (status === "" || status.includes("unfollowed"))
      );
    }),
    [leads]
  );

  // ⚙️ WORKING LEADS: follow-up + all ongoing statuses
  const workingLeads = useMemo(() =>
    leads.filter(lead => {
      const status = (lead.status || "").toLowerCase();
      return (
        status.includes("follow-up") ||
        status.includes("working") ||
        status.includes("whatsapp") ||
        status.includes("proposal") ||
        status.includes("negotiations")
      );
    }),
    [leads]
  );

  // ✅ BOOKED LEADS: booked with us
  const bookedLeads = useMemo(() =>
    leads.filter(lead =>
      (lead.status || "").toLowerCase().includes("booked with us")
    ),
    [leads]
  );

  // 🔥 HOT LEADS: status contains "hot"
  const hotLeads = useMemo(() =>
    leads.filter(lead =>
      (lead.status || "").toLowerCase().includes("hot")
    ),
    [leads]
  );

  const totalLeads = leads.length;
  const conversionRate = totalLeads > 0 ? ((bookedLeads.length / totalLeads) * 100).toFixed(1) : '0';

  const stats = [
    {
      title: "Total Leads",
      value: totalLeads,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
      category: 'total' as StatCategory,
      leads: leads,
    },
    {
      title: "New/Unfollowed",
      value: newLeads.length,
      icon: Clock,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950/20",
      category: 'new' as StatCategory,
      leads: newLeads,
    },
    {
      title: "Working On",
      value: workingLeads.length,
      icon: TrendingUp,
      color: "text-warning",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
      category: 'working' as StatCategory,
      leads: workingLeads,
    },
    {
      title: "Hot Leads",
      value: hotLeads.length,
      icon: Flame,
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-950/20",
      category: 'hot' as StatCategory,
      leads: hotLeads,
    },
    {
      title: "Booked",
      value: bookedLeads.length,
      icon: CheckCircle,
      color: "text-success",
      bgColor: "bg-green-50 dark:bg-green-950/20",
      category: 'booked' as StatCategory,
      leads: bookedLeads,
    },
  ];

  const handleCardClick = (category: StatCategory) => {
    setSelectedCategory(category);
  };

  const selectedStat = stats.find(s => s.category === selectedCategory);

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card 
                key={stat.title} 
                className="hover:shadow-lg transition-all duration-300 animate-fade-in cursor-pointer hover:scale-105 active:scale-95"
                onClick={() => handleCardClick(stat.category)}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <div className={`${stat.bgColor} p-2 rounded-lg`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.value}</div>
                  {stat.title === "Booked" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {conversionRate}% conversion rate
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Click to view details →
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Detail Dialog for Total, New, Working, Booked */}
      {selectedStat && selectedCategory !== 'hot' && (
        <LeadsDetailDialog
          open={!!selectedCategory}
          onClose={() => setSelectedCategory(null)}
          title={selectedStat.title}
          leads={selectedStat.leads}
          color={selectedStat.color}
        />
      )}

      {/* Hot Leads List Dialog */}
      {selectedCategory === 'hot' && (
        <HotLeadsDialog
          open={selectedCategory === 'hot'}
          onClose={() => setSelectedCategory(null)}
          leads={hotLeads}
        />
      )}
    </>
  );
};

export default DashboardStats;
