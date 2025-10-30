import { useState, useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { LeadCard } from "./LeadCard";
import ProgressiveList from "@/components/ProgressiveList";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeadDetailsDialog from "./LeadDetailsDialog";
import ReminderDialog from "./ReminderDialog";
import AddLeadDialog from "./AddLeadDialog";
import AssignLeadDialog from "./AssignLeadDialog";
import LeadFilters from "./LeadFilters";
import SearchBar from "./SearchBar";
import DashboardStats from "./DashboardStats";
import UpcomingTrips from "./UpcomingTrips";
import MonthlyBookedReport from "./MonthlyBookedReport";
import CustomerJourney from "./CustomerJourney";
import PullToRefresh from "@/components/PullToRefresh";
import DailyReportDialog from "./DailyReportDialog";
import { useLocation } from "react-router-dom";
import { stateManager } from "@/lib/stateManager";
import { normalizeStatus, isWorkingCategoryStatus, isBookedStatus, isCancelCategoryStatus } from "@/lib/leadStatus";
import { compareDescByDate } from "@/lib/dateUtils";

const AdminDashboard = () => {
  const location = useLocation();
  const viewParam = new URLSearchParams(location.search).get('view');
  const isAnalyticsOnly = viewParam === 'analytics';
  console.log('AdminDashboard - view param:', viewParam, 'isAnalyticsOnly:', isAnalyticsOnly);
  const [leads, setLeads] = useState<SheetLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<SheetLead | null>(null);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderLead, setReminderLead] = useState<{ id: string; name: string } | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [leadToAssign, setLeadToAssign] = useState<SheetLead | null>(null);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => stateManager.getSearchQuery());
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

  const fetchLeads = async (silent = false, forceRefresh = false) => {
    try {
      setError(null);
      // Check cache first unless force refresh
      if (!forceRefresh) {
        const cached = stateManager.getCachedLeads();
        if (cached.isValid) {
          setLeads(cached.leads);
          if (!silent) setLoading(false);
          console.log('Using cached leads');
          return;
        }
      }

      if (!silent) setLoading(true);
      
      const credentials = await secureStorage.getCredentials();
      // Graceful analytics-only fallback when credentials are missing
      if (!credentials || (!credentials.googleApiKey && !credentials.googleServiceAccountJson)) {
        if (isAnalyticsOnly) {
          // No creds in analytics-only mode: show empty analytics without error
          setLeads([]);
          if (!silent) setLoading(false);
          return;
        }
        throw new Error('Google Sheets not configured');
      }

      let data: SheetLead[] = [];
      if (credentials.sheets && credentials.sheets.length > 0) {
        const services = credentials.sheets.map((s) => new GoogleSheetsService({
          apiKey: credentials.googleApiKey,
          serviceAccountJson: credentials.googleServiceAccountJson,
          sheetId: s.sheetId,
          worksheetNames: s.worksheetNames || credentials.worksheetNames,
          columnMappings: s.columnMappings || credentials.columnMappings,
        }));
        const results = await Promise.all(services.map(svc => svc.fetchLeads(forceRefresh)));
        data = results.flat();
      } else {
        const sheetsService = new GoogleSheetsService({
          apiKey: credentials.googleApiKey,
          serviceAccountJson: credentials.googleServiceAccountJson,
          sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
          worksheetNames: credentials.worksheetNames,
          columnMappings: credentials.columnMappings
        });
        data = await sheetsService.fetchLeads(forceRefresh);
      }
      setLeads(data);
      stateManager.setCachedLeads(data);
      
      if (silent) {
        console.log('Background sync completed');
      }
    } catch (error: any) {
      if (!silent && !isAnalyticsOnly) {
        toast({
          variant: "destructive",
          title: "Error fetching leads",
          description: error.message,
        });
      } else {
        console.error('Background sync error:', error);
      }
      if (!silent && !isAnalyticsOnly) setError(error.message || 'Failed to load dashboard data');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // Silent background sync honoring cache TTL to avoid extra fetches
  useEffect(() => {
    const interval = setInterval(() => {
      const cached = stateManager.getCachedLeads();
      if (!cached.isValid) {
        fetchLeads(true); // Silent sync only when cache is stale
      }
    }, 15000); // check more frequently but fetch only if stale
    return () => clearInterval(interval);
  }, []);

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
      // Date filters: exact date or range (using lead.dateAndTime)
      const leadDate = lead.dateAndTime;
      let matchesDate = true;
      if (dateFilter) {
        matchesDate = leadDate === dateFilter;
      }
      if ((dateFromFilter || dateToFilter) && leadDate) {
        const ld = new Date(leadDate + 'T00:00:00');
        if (dateFromFilter) {
          const from = new Date(dateFromFilter + 'T00:00:00');
          if (ld < from) matchesDate = false;
        }
        if (dateToFilter) {
          const to = new Date(dateToFilter + 'T23:59:59');
          if (ld > to) matchesDate = false;
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
    [filteredLeads]
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

      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: credentials.googleServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });

      // Optimistic UI update
      setLeads((prev) => prev.map((l) =>
        l.tripId === lead.tripId && l.travellerName === lead.travellerName && l.dateAndTime === lead.dateAndTime
          ? { ...l, status: 'Cancellations' }
          : l
      ));

      await sheetsService.updateLead(lead, { status: 'Cancellations' });
      toast({
        title: "Lead moved to Cancellations",
        description: `${lead.travellerName} moved to cancellations.`,
      });
      // Force refresh to bypass cached leads so UI stays consistent
      fetchLeads(false, true);
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
    if (loading) {
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
              onPriorityUpdated={(l, p) => {
                setLeads(prev => prev.map(x => (
                  x.tripId === l.tripId && x.travellerName === l.travellerName && x.dateAndTime === l.dateAndTime
                    ? { ...x, priority: p }
                    : x
                )));
              }}
            />
          )}
        />
      </div>
    );
  };

  return (
    <PullToRefresh onRefresh={() => fetchLeads(false, true)}>
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">All Leads</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage and assign leads to consultants</p>
        </div>
        <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
          <Button onClick={() => setShowAddDialog(true)} className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4">
            <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Add Lead</span>
          </Button>
          <Button onClick={() => setShowDailyReport(true)} variant="secondary" className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4">
            <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Daily Report</span>
          </Button>
          <Button onClick={() => fetchLeads(false, true)} variant="outline" className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4" disabled={loading}>
            <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-sm">Failed to load dashboard data.</p>
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
          <UpcomingTrips leads={filteredLeads} />
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
          // Force refresh after saving to reflect changes immediately
          onUpdate={() => fetchLeads(false, true)}
          onImmediateUpdate={(updated) => {
            // Optimistically update list so user sees instant change
            setLeads((prev) => prev.map((l) =>
              l.tripId === updated.tripId && l.travellerName === updated.travellerName && l.dateAndTime === updated.dateAndTime
                ? { ...l, ...updated }
                : l
            ));
          }}
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
          // Force refresh after adding to include the new lead immediately
          onSuccess={() => fetchLeads(false, true)}
          onImmediateAdd={(newLead) => {
            setLeads((prev) => [
              {
                tripId: newLead.tripId || '',
                dateAndTime: newLead.dateAndTime || '',
                consultant: (newLead as any).consultant || '',
                status: newLead.status || 'Unfollowed',
                travellerName: newLead.travellerName || '',
                travelDate: newLead.travelDate || '',
                travelState: newLead.travelState || '',
                remarks: newLead.remarks || '',
                nights: newLead.nights || '',
                pax: newLead.pax || '',
                hotelCategory: newLead.hotelCategory || '',
                mealPlan: newLead.mealPlan || '',
                phone: newLead.phone || '',
                email: newLead.email || '',
                priority: newLead.priority as any,
                remarkHistory: [],
                notes: '',
                _rowNumber: undefined,
              },
              ...prev,
            ]);
          }}
        />
      )}

      {leadToAssign && (
        <AssignLeadDialog
          open={!!leadToAssign}
          onClose={() => setLeadToAssign(null)}
          lead={leadToAssign}
          consultants={consultants}
          // Force refresh after assignment to reflect consultant change immediately
          onSuccess={() => fetchLeads(false, true)}
        />
      )}

      {showDailyReport && (
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
