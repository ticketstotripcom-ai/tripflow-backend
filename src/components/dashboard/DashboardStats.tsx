import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { Users, TrendingUp, CheckCircle, Flame, Target, Calendar } from "lucide-react";
import { isWorkingCategoryStatus, isBookedStatus } from "@/lib/leadStatus";
import { useMemo, useState } from "react";
import LeadDetailDialog from "./LeadDetailDialog"; // ✅ Changed import name
import UpcomingTripsDialog from "./UpcomingTripsDialog";
import HotLeadsDialog from "./HotLeadsDialog";
import { parseFlexibleDate } from "@/lib/dateUtils";

interface DashboardStatsProps {
  leads: SheetLead[];
}

type StatCategory = 'total' | 'working' | 'booked' | 'hot' | 'upcomingTrips';

const DashboardStats = ({ leads }: DashboardStatsProps) => {
  const [selectedCategory, setSelectedCategory] = useState<StatCategory | null>(null);

  // ⚙️ WORKING LEADS
  const workingLeads = useMemo(() =>
    leads.filter(lead => isWorkingCategoryStatus(lead.status)),
    [leads]
  );

  // ✅ BOOKED LEADS
  const bookedLeads = useMemo(() =>
    leads.filter(lead => isBookedStatus(lead.status)),
    [leads]
  );

  // 🗓️ UPCOMING TRIPS (booked from today onward by travel date)
  const upcomingTrips = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return leads
      .filter((l) => isBookedStatus(l.status))
      .map((l) => ({ lead: l, td: parseFlexibleDate(l.travelDate) }))
      .filter((x) => x.td && x.td.getTime() >= today.getTime())
      .sort((a, b) => (a.td!.getTime() - b.td!.getTime()))
      .map((x) => x.lead);
  }, [leads]);

  // 🔥 HOT LEADS
  const hotLeads = useMemo(() => {
    const list = leads.filter(lead => {
      const s = (lead.status || "").toLowerCase();
      return s.includes("hot") || s.includes("negotiations");
    });
    return list
      .slice()
      .sort((a, b) => {
        const ta = parseFlexibleDate(a.travelDate) || parseFlexibleDate(a.dateAndTime) || new Date(0);
        const tb = parseFlexibleDate(b.travelDate) || parseFlexibleDate(b.dateAndTime) || new Date(0);
        // Prefer more recent first if using dateAndTime, otherwise nearer travel date first
        const aIsTravel = !!parseFlexibleDate(a.travelDate);
        const bIsTravel = !!parseFlexibleDate(b.travelDate);
        if (aIsTravel && bIsTravel) return (ta.getTime() - tb.getTime()); // ascending by travel date
        return tb.getTime() - ta.getTime(); // descending by last updated/created
      });
  }, [leads]);

  const totalLeads = leads.length;
  const conversionRate = totalLeads > 0 ? ((bookedLeads.length / totalLeads) * 100).toFixed(1) : '0';
  const activeEngagement = workingLeads.length + hotLeads.length;
  const activeEngagementPercent = totalLeads > 0 ? ((activeEngagement / totalLeads) * 100).toFixed(1) : '0';

  const topStats = [
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
      title: "Working On",
      value: workingLeads.length,
      icon: TrendingUp,
      color: "text-teal-600",
      bgColor: "bg-teal-50 dark:bg-teal-950/20",
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
    {
      title: "Upcoming Trips",
      value: upcomingTrips.length,
      icon: Calendar,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50 dark:bg-indigo-950/20",
      category: 'upcomingTrips' as StatCategory,
      leads: upcomingTrips,
    },
  ];

  const analyticsCards = [
    {
      title: "Conversion Rate",
      value: `${conversionRate}%`,
      subtitle: `${bookedLeads.length} of ${totalLeads} leads converted`,
      status: parseFloat(conversionRate) >= 5 ? "Good" : "Needs Focus",
      statusColor: parseFloat(conversionRate) >= 5 ? "text-green-600" : "text-red-600",
      icon: Target,
    },
    {
      title: "Active Engagement",
      value: `${activeEngagementPercent}%`,
      subtitle: `${activeEngagement} leads being worked on`,
      status: parseFloat(activeEngagementPercent) >= 50 ? "Good" : "Improve",
      statusColor: parseFloat(activeEngagementPercent) >= 50 ? "text-green-600" : "text-orange-600",
      icon: TrendingUp,
    },
  ];

  const handleCardClick = (category: StatCategory) => {
    const stat = topStats.find(s => s.category === category);
    if (stat && stat.leads.length > 0) {
      setSelectedCategory(category);
    }
  };

  const selectedStat = topStats.find(s => s.category === selectedCategory);

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {topStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card 
                key={stat.title} 
                className={`transition-all duration-300 animate-fade-in ${
                  stat.leads.length > 0 
                    ? 'cursor-pointer hover:shadow-lg hover:scale-105 active:scale-95' 
                    : 'opacity-50 cursor-not-allowed'
                }`}
                onClick={() => handleCardClick(stat.category)}
                aria-disabled={stat.leads.length === 0}
                tabIndex={stat.leads.length === 0 ? -1 : 0}
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
                    {stat.leads.length > 0 ? 'Click to view details →' : 'No leads to display'}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {analyticsCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {card.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                  <p className={`text-xs font-medium mt-2 ${card.statusColor}`}>
                    {card.status}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {selectedStat && selectedCategory !== 'hot' && selectedCategory !== 'upcomingTrips' && (
        <LeadDetailDialog
          open={!!selectedCategory && selectedStat.leads.length > 0}
          onClose={() => setSelectedCategory(null)}
          title={selectedStat.title}
          leads={selectedStat.leads}
          color={selectedStat.color}
        />
      )}

      {selectedCategory === 'hot' && (
        <HotLeadsDialog
          open={selectedCategory === 'hot'}
          onClose={() => setSelectedCategory(null)}
          leads={hotLeads}
        />
      )}

      {selectedCategory === 'upcomingTrips' && (
        <UpcomingTripsDialog
          open={selectedCategory === 'upcomingTrips'}
          onClose={() => setSelectedCategory(null)}
          leads={upcomingTrips}
        />
      )}
    </>
  );
};

export default DashboardStats;
