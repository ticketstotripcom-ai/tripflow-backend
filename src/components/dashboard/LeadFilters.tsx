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

const LEAD_SCORES = ["All Scores", "High (80+)", "Medium (40-79)", "Low (<40)"];

// Add leadScoreFilter and onLeadScoreChange props

const LeadFilters = ({
  statusFilter,
  priorityFilter,
  dateFilter,
  consultantFilter,
  leadScoreFilter,
  onStatusChange,
  onPriorityChange,
  onDateFilterChange,
  onConsultantChange,
  onLeadScoreChange,
  consultants = [],
  showConsultantFilter = false,
}: LeadFiltersProps & { leadScoreFilter?: string; onLeadScoreChange?: (val: string) => void }) => {
  //...

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-card rounded-lg border shadow-sm">
        {/* Existing filters */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Lead Score</Label>
          <Select value={leadScoreFilter} onValueChange={onLeadScoreChange}>
            {LEAD_SCORES.map((score) => (
              <SelectItem key={score} value={score}>
                {score}
              </SelectItem>
            ))}
          </Select>
        </div>
        {/* ... */}
      </div>
      {/* Clear All button as before */}
    </div>
  );
};

export default LeadFilters;
