import { useState, useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { authService } from "@/lib/authService";
import { secureStorage } from "@/lib/secureStorage";
import { LeadCard } from "./LeadCard";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeadDetailsDialog from "./LeadDetailsDialog";
import AddLeadDialog from "./AddLeadDialog";
import LeadFilters from "./LeadFilters";
import SearchBar from "./SearchBar";
import DashboardStats from "./DashboardStats";
import { useLocation } from "react-router-dom";
import { stateManager } from "@/lib/stateManager";

const ConsultantDashboard = () => {
  const location = useLocation();
  const viewParam = new URLSearchParams(location.search).get('view');
  const isAnalyticsOnly = viewParam === 'analytics';
  const [leads, setLeads] = useState<SheetLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<SheetLead | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => stateManager.getSearchQuery());
  const savedFilters = stateManager.getFilters();
  const [statusFilter, setStatusFilter] = useState(savedFilters.statusFilter);
  const [priorityFilter, setPriorityFilter] = useState(savedFilters.priorityFilter);
  const [dateFilter, setDateFilter] = useState(savedFilters.dateFilter);
  const [activeTab, setActiveTab] = useState(() => {
    if (isAnalyticsOnly) return "dashboard";
    const saved = stateManager.getActiveTab();
    return saved || "new";
  });
  const { toast } = useToast();
  const session = authService.getSession();
  const sheetsServiceRef = useRef<GoogleSheetsService | null>(null);

  const fetchLeads = async (silent = false, forceRefresh = false) => {
    try {
      // Check cache first unless force refresh
      if (!forceRefresh) {
        const cached = stateManager.getCachedLeads();
        if (cached.isValid) {
          const myLeads = cached.leads.filter(lead => 
            lead.consultant && 
            lead.consultant.toLowerCase().includes(session?.user.name.toLowerCase() || '')
          );
          setLeads(myLeads);
          if (!silent) setLoading(false);
          console.log('Using cached leads');
          return;
        }
      }

      if (!silent) setLoading(true);
      
      const credentials = await secureStorage.getCredentials();
      if (!credentials) throw new Error('Google Sheets not configured');

      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: credentials.googleServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });

      const data = await sheetsService.fetchLeads();
      stateManager.setCachedLeads(data);
      
      // Filter leads assigned to this consultant
      const myLeads = data.filter(lead => 
        lead.consultant && 
        lead.consultant.toLowerCase().includes(session?.user.name.toLowerCase() || '')
      );
      
      setLeads(myLeads);
      
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
      
      return matchesSearch && matchesStatus && matchesPriority && matchesDate;
    });
  }, [leads, searchQuery, statusFilter, priorityFilter, dateFilter]);

  // Categorize leads by status
  const newLeads = useMemo(() => 
    filteredLeads.filter(lead => 
      lead.status.toLowerCase().includes('unfollowed') || 
      lead.status.toLowerCase().includes('follow-up')
    ), [filteredLeads]
  );

  const workingLeads = useMemo(() => 
    filteredLeads.filter(lead => 
      lead.status.toLowerCase().includes('working') || 
      lead.status.toLowerCase().includes('whatsapp') ||
      lead.status.toLowerCase().includes('proposal') ||
      lead.status.toLowerCase().includes('negotiations') ||
      lead.status.toLowerCase().includes('hot')
    ), [filteredLeads]
  );

  const bookedLeads = useMemo(() => 
    filteredLeads.filter(lead => 
      lead.status.toLowerCase().includes('booked with us')
    ), [filteredLeads]
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

      // Optimistic UI update
      setLeads((prev) => prev.map((l) =>
        l.tripId === lead.tripId && l.travellerName === lead.travellerName && l.dateAndTime === lead.dateAndTime
          ? { ...l, status: 'Converted' }
          : l
      ));

      await sheetsService.updateLead(lead, { status: 'Converted' });
      toast({
        title: "Lead Converted!",
        description: `${lead.travellerName} marked as booked.`,
      });
      // Force refresh to bypass cached leads so UI stays consistent
      fetchLeads(false, true);
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
          <p className="text-muted-foreground">Loading your leads...</p>
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
        {leadsToRender.map((lead, index) => (
          <LeadCard
            key={`${lead.tripId}-${index}`} 
            lead={lead} 
            onClick={() => setSelectedLead(lead)}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">My Leads</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage your assigned leads</p>
        </div>
        <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
          <Button onClick={() => setShowAddDialog(true)} className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4">
            <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Add Lead</span>
          </Button>
          <Button onClick={() => fetchLeads(false, true)} variant="outline" className="gap-1 flex-1 sm:flex-initial text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4" disabled={loading}>
            <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
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
      />

      {isAnalyticsOnly ? (
        <div className="space-y-6">
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
          // Force refresh after saving to reflect changes immediately
          onUpdate={() => fetchLeads(false, true)}
          onImmediateUpdate={(updated) => {
            setLeads((prev) => prev.map((l) =>
              l.tripId === updated.tripId && l.travellerName === updated.travellerName && l.dateAndTime === updated.dateAndTime
                ? { ...l, ...updated }
                : l
            ));
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
              } as any,
              ...prev,
            ]);
          }}
        />
      )}
    </div>
  );
};

export default ConsultantDashboard;
