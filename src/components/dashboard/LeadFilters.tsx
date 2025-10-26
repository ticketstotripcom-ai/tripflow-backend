import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
}: LeadFiltersProps) => {
  const handleClearAll = () => {
    onStatusChange("All Statuses");
    onPriorityChange("All Priorities");
    onDateFilterChange("");
    if (onConsultantChange) {
      onConsultantChange("All Consultants");
    }
  };

  const hasActiveFilters = 
    statusFilter !== "All Statuses" || 
    priorityFilter !== "All Priorities" || 
    dateFilter !== "" ||
    (consultantFilter && consultantFilter !== "All Consultants");

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

      <div className="space-y-2">
        <Label className="text-xs font-medium">Date Filter</Label>
        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => onDateFilterChange(e.target.value)}
          className="h-9"
        />
      </div>

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
