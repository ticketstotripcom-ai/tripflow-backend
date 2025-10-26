import { useState, useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { LeadCard } from "./LeadCard";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeadDetailsDialog from "./LeadDetailsDialog";
import AddLeadDialog from "./AddLeadDialog";
import AssignLeadDialog from "./AssignLeadDialog";
import LeadFilters from "./LeadFilters";
import SearchBar from "./SearchBar";
import DashboardStats from "./DashboardStats";
import { useLocation } from "react-router-dom";
import { stateManager } from "@/lib/stateManager";

const AdminDashboard = () => {
  const location = useLocation();
  const viewParam = new URLSearchParams(location.search).get('view');
  const isAnalyticsOnly = viewParam === 'analytics';
  const [leads, setLeads] = useState<SheetLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<SheetLead | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [leadToAssign, setLeadToAssign] = useState<SheetLead | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => stateManager.getSearchQuery());
  const savedFilters = stateManager.getFilters();
  const [statusFilter, setStatusFilter] = useState(savedFilters.statusFilter);
  const [priorityFilter, setPriorityFilter] = useState(savedFilters.priorityFilter);
  const [dateFilter, setDateFilter] = useState(savedFilters.dateFilter);
  const [consultantFilter, setConsultantFilter] = useState(savedFilters.consultantFilter);
  const [activeTab, setActiveTab] = useState(() => {
    if (isAnalyticsOnly) return "dashboard";
    const saved = stateManager.getActiveTab();
    return saved || "new";
  });
  const { toast } = useToast();
  const sheetsServiceRef = useRef<GoogleSheetsService | null>(null);

  const fetchLeads = async (silent = false, forceRefresh = false) => {
    try {
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
      if (!credentials) {
        throw new Error('Google Sheets not configured');
      }

      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: credentials.googleServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });

      const data = await sheetsService.fetchLeads();
      setLeads(data);
      stateManager.setCachedLeads(data);
      
      if (silent) {
        console.log('Background sync completed');
      }
    } catch (error: any) {
      if (!silent) {
        toast({
          variant: "destructive",
          title: "Error fetching leads",
          description: error.message,
        });
      } else {
        console.error('Background sync error:', error);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // Silent background sync every 30 seconds without navigation
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLeads(true); // Silent sync
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Get unique consultants
  const consultants = useMemo(() => {
    const uniqueConsultants = [...new Set(leads.map(lead => lead.consultant).filter(Boolean))];
    return uniqueConsultants;
  }, [leads]);

  // Filter and search logic
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchesSearch = !searchQuery || 
        lead.tripId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.travellerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.phone.includes(searchQuery);
      
      const matchesStatus = statusFilter === "All Statuses" || lead.status === statusFilter;
      const matchesPriority = priorityFilter === "All Priorities" || lead.priority?.toLowerCase() === priorityFilter.toLowerCase();
      const matchesDate = !dateFilter || lead.dateAndTime === dateFilter;
      const matchesConsultant = consultantFilter === "All Consultants" || lead.consultant === consultantFilter;
      
      return matchesSearch && matchesStatus && matchesPriority && matchesDate && matchesConsultant;
    });
  }, [leads, searchQuery, statusFilter, priorityFilter, dateFilter, consultantFilter]);

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
    }),
    [filteredLeads]
  );

  // ⚙️ WORKING LEADS: follow-up + all ongoing statuses
  const workingLeads = useMemo(() =>
    filteredLeads.filter(lead => {
      const status = (lead.status || "").toLowerCase();
      return (
        status.includes("follow-up") ||
        status.includes("working") ||
        status.includes("whatsapp") ||
        status.includes("proposal") ||
        status.includes("negotiations") ||
        status.includes("hot")
      );
    }),
    [filteredLeads]
  );

  // ✅ BOOKED LEADS: booked with us
  const bookedLeads = useMemo(() =>
    filteredLeads.filter(lead =>
      (lead.status || "").toLowerCase().includes("booked with us")
    ),
    [filteredLeads]
  );

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

      await sheetsService.updateLead(lead, { status: 'Converted' });
      toast({
        title: "Lead Converted!",
        description: `${lead.travellerName} marked as booked.`,
      });
      fetchLeads();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to convert lead",
        description: error.message,
      });
    }
  };

  const handleSwipeRight = (lead: SheetLead) => {
    toast({
      title: "Reminder Set!",
      description: `Reminder created for ${lead.travellerName}`,
    });
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {leadsToRender.map((lead, index) => (
          <LeadCard 
            key={`${lead.tripId}-${index}`} 
            lead={lead} 
            onClick={() => setSelectedLead(lead)}
            onAssign={() => setLeadToAssign(lead)}
            showAssignButton={true}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">All Leads</h2>
          <p className="text-muted-foreground">Manage and assign leads to consultants</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Lead
          </Button>
          <Button onClick={() => fetchLeads(false, true)} variant="outline" className="gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <SearchBar value={searchQuery} onChange={(query) => {
        setSearchQuery(query);
        stateManager.setSearchQuery(query);
      }} />

      <LeadFilters
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        dateFilter={dateFilter}
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
        onConsultantChange={(val) => {
          setConsultantFilter(val);
          stateManager.setFilters({ consultantFilter: val });
        }}
        consultants={consultants}
        showConsultantFilter={true}
      />

      {isAnalyticsOnly ? (
        <div className="space-y-6">
          {/* ✅ ONLY DashboardStats - Removed KeyMetricsCards */}
          <DashboardStats leads={leads} />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(tab) => {
          setActiveTab(tab);
          stateManager.setActiveTab(tab);
        }} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="new">
              New Leads ({newLeads.length})
            </TabsTrigger>
            <TabsTrigger value="working">
              Working ({workingLeads.length})
            </TabsTrigger>
            <TabsTrigger value="booked">
              Booked ({bookedLeads.length})
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
        </Tabs>
      )}

      {selectedLead && (
        <LeadDetailsDialog
          lead={selectedLead}
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={fetchLeads}
        />
      )}

      {showAddDialog && (
        <AddLeadDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={fetchLeads}
        />
      )}

      {leadToAssign && (
        <AssignLeadDialog
          open={!!leadToAssign}
          onClose={() => setLeadToAssign(null)}
          lead={leadToAssign}
          consultants={consultants}
          onSuccess={fetchLeads}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
