import { useState, useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { authService } from "@/lib/authService";
import { LeadCard } from "./LeadCard";
import ProgressiveList from "@/components/ProgressiveList";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeadDetailsDialog from "./LeadDetailsDialog";
import ReminderDialog from "./ReminderDialog";
import AddLeadDialog from "./AddLeadDialog";
import LeadFilters from "./LeadFilters";
import SearchBar from "./SearchBar";
import DashboardStats from "./DashboardStats";
import MonthlyBookedReport from "./MonthlyBookedReport";
import CustomerJourney from "./CustomerJourney";
import PullToRefresh from "@/components/PullToRefresh";
import DailyReportDialog from "./DailyReportDialog";
import { useLocation } from "react-router-dom";
import { stateManager } from "@/lib/stateManager";
import { useCRMData } from "@/hooks/useCRMData";
import {
  normalizeStatus,
  isWorkingCategoryStatus,
  isBookedStatus,
  isNewCategoryStatus,
  isCancelCategoryStatus,
} from "@/lib/leadStatus";
import { compareDescByDate, parseFlexibleDate } from "@/lib/dateUtils";

interface ConsultantDashboardProps {
  swipeEnabled: boolean;
}

const ConsultantDashboard = ({ swipeEnabled }: ConsultantDashboardProps) => {
  const location = useLocation();
  const viewParam = new URLSearchParams(location.search).get("view");
  const isAnalyticsOnly = viewParam === "analytics";

  const { leads, loading, error, syncData } = useCRMData();
  const [selectedLead, setSelectedLead] = useState<SheetLead | null>(null);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderLead, setReminderLead] = useState<{ id: string; name: string } | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => stateManager.getSearchQuery());

  const savedFilters = stateManager.getFilters();
  const [statusFilter, setStatusFilter] = useState(savedFilters.statusFilter);
  const [priorityFilter, setPriorityFilter] = useState(savedFilters.priorityFilter);
  const [dateFilter, setDateFilter] = useState(savedFilters.dateFilter);
  const [dateFromFilter, setDateFromFilter] = useState(savedFilters.dateFromFilter || "");
  const [dateToFilter, setDateToFilter] = useState(savedFilters.dateToFilter || "");

  const [activeTab, setActiveTab] = useState(() => {
    if (isAnalyticsOnly) return "dashboard";
    const saved = stateManager.getActiveTab();
    return saved || "working";
  });

  const { toast } = useToast();
  const session = authService.getSession();
  const sheetsServiceRef = useRef<GoogleSheetsService | null>(null);

  const myLeads = useMemo(() => {
    if (!session) return [];
    const uname = String(session.user.name || '').toLowerCase().trim();
    const uemail = String((session as any).user.email || '').toLowerCase().trim();
    const matches = (consultant?: string) => {
      const c = String(consultant || '').toLowerCase().trim();
      if (!c) return false;
      return (
        (uname && (c === uname || c.includes(uname))) ||
        (uemail && (c === uemail || c.includes(uemail)))
      );
    };
    return leads.filter((lead) => matches(lead.consultant));
  }, [leads, session]);

  // Deep-link: open lead if pending target is set when leads update
  useEffect(() => {
    try {
      const pending = stateManager.consumePendingTarget();
      if (pending) {
        const match = myLeads.find((l) => {
          const tn = (pending.travellerName || '').toLowerCase();
          const ld = (pending.dateAndTime || '').trim();
          return (
            (tn && (l.travellerName || '').toLowerCase().includes(tn)) ||
            (ld && (l.dateAndTime || '').trim() === ld) ||
            (pending.tripId && l.tripId && l.tripId === pending.tripId)
          );
        });
        if (match) setSelectedLead(match);
      }
    } catch {}
  }, [myLeads]);

  // âœ… Filter + Search logic
  const filteredLeads = useMemo(() => {
    const queryLower = (searchQuery || "").toLowerCase();
    const queryDigits = (searchQuery || "").replace(/\D+/g, "");

    return myLeads.filter((lead) => {
      const matchesSearch =
        !searchQuery ||
        Object.values(lead)
          .join(" ")
          .toLowerCase()
          .includes(queryLower) ||
        (queryDigits && JSON.stringify(lead).includes(queryDigits));

      const matchesStatus =
        statusFilter === "All Statuses" ||
        normalizeStatus(lead.status) === normalizeStatus(statusFilter);

      const matchesPriority =
        priorityFilter === "All Priorities" ||
        (lead.priority || "").toLowerCase() === priorityFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [leads, searchQuery, statusFilter, priorityFilter]);

  const newLeads = useMemo(
    () => filteredLeads.filter((l) => isNewCategoryStatus(l.status)),
    [filteredLeads]
  );
  const workingLeads = useMemo(
    () => filteredLeads.filter((l) => isWorkingCategoryStatus(l.status)),
    [filteredLeads]
  );
  const bookedLeads = useMemo(
    () => filteredLeads.filter((l) => isBookedStatus(l.status)),
    [filteredLeads]
  );
  const cancelLeads = useMemo(
    () => filteredLeads.filter((l) => isCancelCategoryStatus(l.status)),
    [filteredLeads]
  );

  // âœ… Handle swipe left (cancel)
  const handleSwipeLeft = async (lead: SheetLead) => {
    try {
      // Optimistic UI update
      const newLeads = myLeads.map((l) =>
        l.tripId === lead.tripId &&
        l.travellerName === lead.travellerName &&
        l.dateAndTime === lead.dateAndTime
          ? { ...l, status: "Cancellations" }
          : l
      );
      // Not updating global state here, letting sync handle it

      const credentials = await secureStorage.getCredentials();
      if (!credentials) throw new Error("Credentials not found");

      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: credentials.googleServiceAccountJson,
        sheetId:
          credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || "",
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings,
      });

      await sheetsService.updateLead(lead, { status: "Cancellations" });

      toast({
        title: "Lead Cancelled",
        description: `${lead.travellerName} moved to cancellations.`,
      });

      syncData(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to cancel lead",
        description: error.message,
      });
    }
  };

  // âœ… Handle swipe right (reminder)
  const handleSwipeRight = (lead: SheetLead) => {
    setReminderLead({ id: lead.tripId, name: lead.travellerName });
    setShowReminderDialog(true);
    toast({ title: "Reminder", description: `Add reminder for ${lead.travellerName}` });
  };

  // âœ… Render leads grid
  const renderLeadGrid = (leadsToRender: SheetLead[]) => {
    if (loading && leads.length === 0) {
      return (
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your leads...</p>
        </div>
      );
    }

    if (leadsToRender.length === 0)
      return (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">No leads found matching criteria.</p>
        </div>
      );

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <ProgressiveList
          items={leadsToRender}
          batchSize={24}
          initialBatches={2}
          renderItem={(lead, index) => (
            <LeadCard
              key={`${lead.tripId}-${index}`}
              lead={lead}
              onClick={() => setSelectedLead(lead)}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              swipeEnabled={swipeEnabled}
            />
          )}
        />
      </div>
    );
  };

  return (
    <PullToRefresh onRefresh={() => syncData(true)}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              My Leads
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Your assigned leads</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowAddDialog(true)} className="gap-1">
              <Plus className="h-4 w-4" /> Add Lead
            </Button>
            <Button
              onClick={() => setShowDailyReport(true)}
              variant="secondary"
              disabled={loading}
              className="gap-1"
            >
              <FileText className="h-4 w-4" /> Daily Report
            </Button>
            <Button
              onClick={() => syncData(true)}
              variant="outline"
              disabled={loading}
              className="gap-1"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={(q) => {
            setSearchQuery(q);
            stateManager.setSearchQuery(q);
          }}
        />

        <LeadFilters
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
          dateFilter={dateFilter}
          dateFromFilter={dateFromFilter}
          dateToFilter={dateToFilter}
          onStatusChange={(val) => {
            setStatusFilter(val);
            stateManager.setFilters({ statusFilter: val });
          }}
          onPriorityChange={(val) => {
            setPriorityFilter(val);
            stateManager.setFilters({ priorityFilter: val });
          }}
          onDateFilterChange={(val) => {
            setDateFilter(val);
            stateManager.setFilters({ dateFilter: val });
          }}
          onDateRangeChange={(from, to) => {
            setDateFromFilter(from);
            setDateToFilter(to);
            stateManager.setFilters({ dateFromFilter: from, dateToFilter: to });
          }}
        />

        {isAnalyticsOnly ? (
          <div className="space-y-6">
            <DashboardStats leads={filteredLeads} />
            <CustomerJourney leads={filteredLeads} />
            <MonthlyBookedReport leads={filteredLeads} />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(tab) => {
              setActiveTab(tab);
              stateManager.setActiveTab(tab);
            }}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="new">New ({newLeads.length})</TabsTrigger>
              <TabsTrigger value="working">Working ({workingLeads.length})</TabsTrigger>
              <TabsTrigger value="booked">Booked ({bookedLeads.length})</TabsTrigger>
              <TabsTrigger value="cancel">Cancel ({cancelLeads.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="new">{renderLeadGrid(newLeads)}</TabsContent>
            <TabsContent value="working">{renderLeadGrid(workingLeads)}</TabsContent>
            <TabsContent value="booked">{renderLeadGrid(bookedLeads)}</TabsContent>
            <TabsContent value="cancel">{renderLeadGrid(cancelLeads)}</TabsContent>
          </Tabs>
        )}

        {selectedLead && (
          <LeadDetailsDialog
            lead={selectedLead}
            open={!!selectedLead}
            onClose={() => setSelectedLead(null)}
            onUpdate={() => syncData(true)}
          />
        )}

        {showReminderDialog && reminderLead && (
          <ReminderDialog
            open={showReminderDialog}
            onClose={() => setShowReminderDialog(false)}
            leadTripId={reminderLead.id}
            leadName={reminderLead.name}
            onReminderSet={() => {
              setShowReminderDialog(false);
              toast({
                title: "Reminder Set",
                description: `Reminder created for ${reminderLead.name}`,
              });
            }}
          />
        )}

        {showAddDialog && (
          <AddLeadDialog
            open={showAddDialog}
            onClose={() => setShowAddDialog(false)}
            onSuccess={() => syncData(true)}
          />
        )}

        {showDailyReport && myLeads.length > 0 && !error && (
          <DailyReportDialog
            open={showDailyReport}
            onClose={() => setShowDailyReport(false)}
            mode="consultant"
            leads={myLeads}
          />
        )}
      </div>
    </PullToRefresh>
  );
};

export default ConsultantDashboard;
