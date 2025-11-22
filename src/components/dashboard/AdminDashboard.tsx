import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { LeadCard } from "./LeadCard";
import ProgressiveList from "@/components/ProgressiveList";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, FileText, Bell } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeadDetailsDialog from "./LeadDetailsDialog";
import ReminderDialog from "./ReminderDialog";
import AddLeadDialog from "./AddLeadDialog";
import { authService } from "@/lib/authService";
import AssignLeadDialog from "./AssignLeadDialog";
import LeadFilters from "./LeadFilters";
import SearchBar from "./SearchBar";
import DashboardStats from "./DashboardStats";
import UpcomingTrips from "./UpcomingTrips";
import MonthlyBookedReport from "./MonthlyBookedReport";
import CustomerJourney from "./CustomerJourney";
import PullToRefresh from "@/components/PullToRefresh";
import DailyReportDialog from "./DailyReportDialog";
import { notifyAdmin } from "@/utils/notifyTriggers";
import { API_BASE_URL } from "@/config/api";
import { useLocation } from "react-router-dom";
import { stateManager } from "@/lib/stateManager";
import { useCRMData } from "@/hooks/useCRMData";
import {
  normalizeStatus,
  isWorkingCategoryStatus,
  isBookedStatus,
  isCancelCategoryStatus,
} from "@/lib/leadStatus";
import { compareDescByDate, parseFlexibleDate } from "@/lib/dateUtils";

interface AdminDashboardProps {
  swipeEnabled: boolean;
}

const AdminDashboard = ({ swipeEnabled }: AdminDashboardProps) => {
  const location = useLocation();
  const viewParam = new URLSearchParams(location.search).get("view");
  const isAnalyticsOnly = viewParam === "analytics";
  console.log("AdminDashboard - view param:", viewParam, "isAnalyticsOnly:", isAnalyticsOnly);
  const { leads: remoteLeads, loading, error, syncData } = useCRMData();
  const [optimisticLeads, setOptimisticLeads] = useState<SheetLead[] | null>(null);
  const leads = useMemo(() => optimisticLeads ?? remoteLeads, [optimisticLeads, remoteLeads]);
  const [selectedLead, setSelectedLead] = useState<SheetLead | null>(null);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderLead, setReminderLead] = useState<{ id: string; name: string } | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [leadToAssign, setLeadToAssign] = useState<SheetLead | null>(null);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const savedFilters = stateManager.getFilters();
  const [statusFilter, setStatusFilter] = useState(savedFilters.statusFilter);
  const [priorityFilter, setPriorityFilter] = useState(savedFilters.priorityFilter);
  const [dateFilter, setDateFilter] = useState(savedFilters.dateFilter);
  const [dateFromFilter, setDateFromFilter] = useState(savedFilters.dateFromFilter || '');
  const [dateToFilter, setDateToFilter] = useState(savedFilters.dateToFilter || '');
  const [consultantFilter, setConsultantFilter] = useState(savedFilters.consultantFilter);
  const [activeTab, setActiveTab] = useState(() => {
    if (isAnalyticsOnly) return "dashboard";
    const saved = stateManager.getActiveTab();
    return saved || "working";
  });
  const { toast } = useToast();
  const sheetsServiceRef = useRef<GoogleSheetsService | null>(null);

  // Reset optimistic overlay when new data arrives
  useEffect(() => {
    setOptimisticLeads(null);
  }, [remoteLeads]);

  // Deep-link: open lead if pending target is set
  useEffect(() => {
    try {
      const pending = stateManager.consumePendingTarget();
      if (pending) {
        const match = leads.find((l) => {
          const tn = (pending.travellerName || "").toLowerCase();
          const ld = (pending.dateAndTime || "").trim();
          return (
            (tn && (l.travellerName || "").toLowerCase().includes(tn)) ||
            (ld && (l.dateAndTime || "").trim() === ld) ||
            (pending.tripId && l.tripId && l.tripId === pending.tripId)
          );
        });
        if (match) setSelectedLead(match);
      }
    } catch {}
  }, [leads]);

  // Get unique consultants
  const consultants = useMemo(() => {
    const uniqueConsultants = [...new Set(leads.map(lead => lead.consultant).filter(Boolean))];
    return uniqueConsultants;
  }, [leads]);

  // Filter and search logic
  const filteredLeads = useMemo(() => {
    const queryLower = (searchQuery || '').toLowerCase();
    const queryDigits = (searchQuery || '').replace(/\D+/g, '');

    const matchesQuery = (lead: SheetLead): boolean => {
      if (!searchQuery) return true;

      const textFields = [
        lead.tripId,
        lead.travellerName,
        lead.phone,
        lead.email,
        lead.consultant,
        lead.status,
        lead.priority || '',
        lead.travelDate,
        lead.travelState,
        lead.remarks,
        lead.nights,
        lead.pax,
        lead.hotelCategory,
        lead.mealPlan,
        lead.dateAndTime,
        lead.notes || ''
      ];

      // Plain text match across all fields
      if (textFields.some(v => String(v || '').toLowerCase().includes(queryLower))) {
        return true;
      }

      // Digit-only matching (helps match numbers like phone/trip IDs regardless of formatting)
      if (queryDigits) {
        const anyDigitsHit = textFields.some(v => String(v || '').replace(/\D+/g, '').includes(queryDigits));
        if (anyDigitsHit) return true;
      }

      // Search within remark history if present
      if ((lead.remarkHistory || []).some(r => String(r).toLowerCase().includes(queryLower))) {
        return true;
      }

      return false;
    };

    return leads.filter(lead => {
      const matchesSearch = matchesQuery(lead);

      const matchesStatus =
        statusFilter === "All Statuses" ||
        normalizeStatus(lead.status) === normalizeStatus(statusFilter);
      const matchesPriority =
        priorityFilter === "All Priorities" ||
        (lead.priority || '').toLowerCase() === priorityFilter.toLowerCase();
      // Date filters: exact date or range (using flexible parsing)
      const leadDateValue = parseFlexibleDate(lead.dateAndTime) || parseFlexibleDate(lead.travelDate);
      let matchesDate = true;
      if (dateFilter) {
        const filterDate = parseFlexibleDate(dateFilter);
        if (!filterDate || !leadDateValue) {
          matchesDate = false;
        } else {
          const leadDay = new Date(leadDateValue);
          const filterDay = new Date(filterDate);
          leadDay.setHours(0, 0, 0, 0);
          filterDay.setHours(0, 0, 0, 0);
          matchesDate = leadDay.getTime() === filterDay.getTime();
        }
      }
      if (matchesDate && (dateFromFilter || dateToFilter)) {
        if (!leadDateValue) {
          matchesDate = false;
        } else {
          const leadDay = new Date(leadDateValue);
          if (dateFromFilter) {
            const fromDate = parseFlexibleDate(dateFromFilter);
            if (fromDate) {
              const from = new Date(fromDate);
              from.setHours(0, 0, 0, 0);
              if (leadDay < from) matchesDate = false;
            }
          }
          if (matchesDate && dateToFilter) {
            const toDate = parseFlexibleDate(dateToFilter);
            if (toDate) {
              const to = new Date(toDate);
              to.setHours(23, 59, 59, 999);
              if (leadDay > to) matchesDate = false;
            }
          }
        }
      }
      const matchesConsultant =
        consultantFilter === "All Consultants" || lead.consultant === consultantFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesDate &&
        matchesConsultant
      );
    });
  }, [leads, searchQuery, statusFilter, priorityFilter, dateFilter, dateFromFilter, dateToFilter, consultantFilter]);

  const applyLocalAssignment = useCallback((updatedLead: SheetLead) => {
    setOptimisticLeads((prev) => {
      const base = prev ?? leads;
      const next = base.map((l) =>
        (l.tripId && l.tripId === updatedLead.tripId) ||
        ((l.travellerName || "").toLowerCase() === (updatedLead.travellerName || "").toLowerCase())
          ? { ...l, consultant: updatedLead.consultant }
          : l
      );
      stateManager.setCachedLeads(next);
      return next;
    });
  }, [leads]);

  // 🆕 NEW LEADS: blank or "unfollowed"
  const newLeads = useMemo(() =>
    filteredLeads.filter(lead => {
  
      const status = (lead.status || "").toLowerCase();
  
      const hasData =
        lead.travellerName?.trim() ||
        lead.phone?.trim() ||
        lead.tripId?.trim();
  
      return (
        hasData &&
        (status === "" || status.includes("unfollowed"))
      );
    }).slice().sort((a,b) => compareDescByDate(a.dateAndTime, b.dateAndTime)),
  );

  // ⚙️ WORKING LEADS: follow-up + all ongoing statuses
  const workingLeads = useMemo(() =>
    filteredLeads.filter(lead => isWorkingCategoryStatus(lead.status)).slice().sort((a,b) => compareDescByDate(a.dateAndTime, b.dateAndTime)),
    [filteredLeads]
  );

  // ✅ BOOKED LEADS: booked with us
  const bookedLeads = useMemo(() =>
    filteredLeads.filter(lead => isBookedStatus(lead.status)).slice().sort((a,b) => compareDescByDate(a.dateAndTime, b.dateAndTime)),
    [filteredLeads]
  );

  // ❌ CANCEL LEADS: cancellations, booked outside, postponed
  const cancelLeads = useMemo(() =>
    filteredLeads.filter(lead => isCancelCategoryStatus(lead.status)).slice().sort((a,b) => compareDescByDate(a.dateAndTime, b.dateAndTime)),
    [filteredLeads]
  );

  // Left swipe = mark cancellation
  const handleSwipeLeft = async (lead: SheetLead) => {
  
    try {
      const credentials = await secureStorage.getCredentials();
      if (!credentials) throw new Error('Credentials not found');
  
      let effectiveServiceAccountJson = credentials.googleServiceAccountJson;
      if (!effectiveServiceAccountJson) {
        try { effectiveServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
      }
      if (!effectiveServiceAccountJson) throw new Error('Service Account JSON missing');
  
      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: effectiveServiceAccountJson,
  
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });
  
      console.log('✅ Using Service Account for Sheets write operation');
      await sheetsService.updateLead(lead, { status: 'Cancellations' });
      toast({
        title: "Lead moved to Cancellations",
        description: `${lead.travellerName} moved to cancellations.`,
      });
      // Refresh to bypass cached leads so UI stays consistent
      syncData(true);
  
    } catch (error: any) {
  
      toast({
        variant: "destructive",
        title: "Failed to cancel lead",
  
        description: error.message,
      });
  
    }
  };

  // Right swipe = open reminder dialog directly
  const handleSwipeRight = (lead: SheetLead) => {
    setReminderLead({ id: lead.tripId, name: lead.travellerName });
    setShowReminderDialog(true);
    toast({ title: "Reminder", description: `Add reminder for ${lead.travellerName}` });
  };

  const renderLeadGrid = (leadsToRender: SheetLead[]) => {
    if (loading && leads.length === 0) {
  
      return (
  
        <div className="text-center py-12">
  
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
  
          <p className="text-muted-foreground">Loading leads...</p>
  
        </div>
  
      );
  
    }
  
    if (leadsToRender.length === 0) {
  
      return (
  
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
  
          <p className="text-muted-foreground">No leads found matching the criteria.</p>
  
        </div>
  
      );
  
    }
  
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
              onAssign={() => setLeadToAssign(lead as any)}
              showAssignButton={true}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              swipeEnabled={swipeEnabled}
              onPriorityUpdated={async () => {
                try { await syncData(true); } catch {}
              }}
            />
          )}
        />
      </div>
    );
  };

  return (
    <PullToRefresh onRefresh={() => syncData(true)}>
    <div className="space-y-3 sm:space-y-6">
  
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
  
        <div>
  
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">All Leads</h2>
  
          <p className="text-xs sm:text-sm text-muted-foreground">Manage and assign leads to consultants</p>
  
        </div>
        <div className="flex gap-1 sm:gap-2 w-full sm:w-auto items-center">
          <Button onClick={() => setShowAddDialog(true)} className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4">
            <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Add Lead</span>
          </Button>
          <Button onClick={() => setShowDailyReport(true)} variant="secondary" className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4" disabled={loading || !!error}>
            <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Daily Report</span>
          </Button>
          <Button
            onClick={async () => {
              try {
                setSendingTest(true);
                // Fire WS toast immediately
                try {
                  await fetch(`${API_BASE_URL}/notify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: 'Test Notification', message: 'Hello Admin, this is a test.', type: 'admin' }),
                  });
                } catch (_) {}
                // Persist to sheet for bell list
                await notifyAdmin('Test Notification', 'Hello Admin, this is a test.', { route: '/dashboard?view=analytics' });
                // Hint the bell to refresh immediately
                window.dispatchEvent(new Event('sheet-notifications-refresh'));
                toast({ title: 'Notification sent', description: 'Check the toast and bell.' });
              } catch (e: any) {
                toast({ variant: 'destructive', title: 'Send failed', description: e?.message || 'Unable to send test notification' });
              } finally {
                setSendingTest(false);
              }
            }}
            variant="outline"
            className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4"
            disabled={sendingTest || loading}
          >
            <Bell className={`h-3 w-3 sm:h-4 sm:w-4 ${sendingTest ? 'animate-pulse' : ''}`} />
            <span>Test Notify</span>
          </Button>
          <Button onClick={() => syncData(true)} variant="outline" className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4" disabled={loading}>
            <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          {/* Notification bell shown in AppHeader globally; avoid duplicate here */}
        </div>
        </div>
  
      {error && (
        <div className="flex items-center justify-between bg-red-50 text-red-800 border border-red-200 rounded p-2 sm:p-3">
          <span className="text-xs sm:text-sm">{error || 'Failed to load dashboard data.'}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => syncData(true)}>Retry</Button>
            <Button size="sm" variant="secondary" onClick={() => window.location.hash = '#/settings'}>Open Settings</Button>
          </div>
        </div>
      )}
  
      {/* No results helper */}
      {!loading && !error && leads.length > 0 && filteredLeads.length === 0 && (
        <div className="flex items-center justify-between bg-amber-50 text-amber-800 border border-amber-200 rounded p-2 sm:p-3">
          <span className="text-xs sm:text-sm">No leads match current filters.</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              setSearchQuery('');
              setStatusFilter('All Statuses');
              setPriorityFilter('All Priorities');
              setDateFilter('');
              setDateFromFilter('');
              setDateToFilter('');
              setConsultantFilter('All Consultants');
              stateManager.setFilters({
                statusFilter: 'All Statuses',
                priorityFilter: 'All Priorities',
                dateFilter: '',
                dateFromFilter: '',
                dateToFilter: '',
                consultantFilter: 'All Consultants',
              });
              stateManager.setSearchQuery('');
            }}>Clear filters</Button>
          </div>
        </div>
      )}
  
      <SearchBar value={searchQuery} onChange={(query) => {
  
        setSearchQuery(query);
  
        stateManager.setSearchQuery(query);
  
      }} />
  
      <LeadFilters
  
        statusFilter={statusFilter}
  
        priorityFilter={priorityFilter}
  
        dateFilter={dateFilter}
        dateFromFilter={dateFromFilter}
        dateToFilter={dateToFilter}
  
        consultantFilter={consultantFilter}
  
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
  
        onConsultantChange={(val) => {
  
          setConsultantFilter(val);
  
          stateManager.setFilters({ consultantFilter: val });
  
        }}
  
        consultants={consultants}
  
        showConsultantFilter={true}
  
      />
  
      {isAnalyticsOnly ? (
        <div className="space-y-6">
          {/* ✅ Analytics View: DashboardStats, CustomerJourney, MonthlyBookedReport, UpcomingTrips */}
          <DashboardStats leads={filteredLeads} />
          <CustomerJourney leads={filteredLeads} />
          <MonthlyBookedReport leads={filteredLeads} />
        </div>
      ) : (
  
        <Tabs value={activeTab} onValueChange={(tab) => {
  
          setActiveTab(tab);
  
          stateManager.setActiveTab(tab);
        }} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
  
            <TabsTrigger value="new">
  
              New Leads ({newLeads.length})
  
            </TabsTrigger>
  
            <TabsTrigger value="working">
  
              Working ({workingLeads.length})
  
            </TabsTrigger>
  
            <TabsTrigger value="booked">
  
              Booked ({bookedLeads.length})
  
            </TabsTrigger>
              <TabsTrigger value="cancel">
                Cancel ({cancelLeads.length})
              </TabsTrigger>
  
            </TabsList>
  
            <TabsContent value="new">
  
              {renderLeadGrid(newLeads)}
  
            </TabsContent>
  
            <TabsContent value="working">
  
              {renderLeadGrid(workingLeads)}
  
            </TabsContent>
  
            <TabsContent value="booked">
  
              {renderLeadGrid(bookedLeads)}
  
            </TabsContent>
  
          <TabsContent value="cancel">
            {renderLeadGrid(cancelLeads)}
          </TabsContent>
  
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
            toast({ title: 'Reminder Set', description: `Reminder created for ${reminderLead.name}` });
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
  
      {leadToAssign && (
        <AssignLeadDialog

          lead={leadToAssign}
          open={!!leadToAssign}
          onClose={() => setLeadToAssign(null)}
          onSuccess={(updatedLead) => {
            applyLocalAssignment(updatedLead);
            // Gentle refresh in background to keep parity with sheet
            void syncData(false);
          }}
          consultants={consultants}
        />
      )}
  
      {showDailyReport && leads.length > 0 && !error && (
        <DailyReportDialog
          open={showDailyReport}
          onClose={() => setShowDailyReport(false)}
          mode="admin"
          leads={leads}
          consultants={consultants}
        />
      )}
    </div>
    </PullToRefresh>
  );
};

export default AdminDashboard;
