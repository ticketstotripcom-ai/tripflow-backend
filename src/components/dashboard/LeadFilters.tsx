import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DateRangePicker, DateRange } from "@/components/ui/date-range-picker";
import { useMemo } from "react";

interface LeadFiltersProps {
  statusFilter: string;
  priorityFilter: string;
  dateFilter: string;
  consultantFilter?: string;
  onStatusChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onConsultantChange?: (value: string) => void;
  consultants?: string[];
  showConsultantFilter?: boolean;
  // New optional date range
  dateFromFilter?: string;
  dateToFilter?: string;
  onDateRangeChange?: (from: string, to: string) => void;
}

const LEAD_STATUSES = [
  "All Statuses",
  "Unfollowed",
  "Follow-up Calls",
  "Working on it",
  "Whatsapp Sent",
  "Proposal 1 Shared",
  "Proposal 2 Shared",
  "Proposal 3 Shared",
  "Negotiations",
  "Hot Leads",
  "Booked With Us",
  "Cancellations",
  "Postponed",
  "Booked Outside",
];

const PRIORITIES = ["All Priorities", "high", "medium", "low"];

const LeadFilters = ({
  statusFilter,
  priorityFilter,
  dateFilter,
  consultantFilter,
  onStatusChange,
  onPriorityChange,
  onDateFilterChange,
  onConsultantChange,
  consultants = [],
  showConsultantFilter = false,
  dateFromFilter = '',
  dateToFilter = '',
  onDateRangeChange,
}: LeadFiltersProps) => {
  const handleClearAll = () => {
    onStatusChange("All Statuses");
    onPriorityChange("All Priorities");
    onDateFilterChange("");
    onDateRangeChange?.('', '');
    if (onConsultantChange) {
      onConsultantChange("All Consultants");
    }
  };

  const hasActiveFilters = 
    statusFilter !== "All Statuses" || 
    priorityFilter !== "All Priorities" || 
    dateFilter !== "" ||
    (dateFromFilter !== '' || dateToFilter !== '') ||
    (consultantFilter && consultantFilter !== "All Consultants");

  const rangeValue: DateRange = useMemo(() => {
    const from = dateFromFilter ? new Date(`${dateFromFilter}T00:00:00`) : undefined;
    const to = dateToFilter ? new Date(`${dateToFilter}T23:59:59`) : undefined;
    return { from, to };
  }, [dateFromFilter, dateToFilter]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card rounded-lg border shadow-sm">
      <div className="space-y-2">
        <Label className="text-xs font-medium">Status</Label>
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Priority</Label>
        <Select value={priorityFilter} onValueChange={onPriorityChange}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {priority}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label className="text-xs font-medium">Lead Date Range</Label>
        <DateRangePicker
          value={rangeValue}
          onChange={(r) => {
            const from = r?.from ? r.from.toISOString().slice(0, 10) : '';
            const to = r?.to ? r.to.toISOString().slice(0, 10) : '';
            // Clear old exact date when using range
            onDateFilterChange('');
            onDateRangeChange?.(from, to);
          }}
        />
      </div>

      {/* From/To inputs removed in favor of a unified date range picker */}

      {showConsultantFilter && onConsultantChange && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Consultant</Label>
          <Select value={consultantFilter} onValueChange={onConsultantChange}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All Consultants">All Consultants</SelectItem>
              {consultants.map((consultant) => (
                <SelectItem key={consultant} value={consultant}>
                  {consultant}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      </div>
      
      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClearAll}
            className="gap-2"
          >
            Clear All Filters
          </Button>
        </div>
      )}
    </div>
  );
};

export default LeadFilters;
