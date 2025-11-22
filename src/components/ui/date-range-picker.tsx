import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

export type DateRange = { from?: Date; to?: Date };

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  placeholder?: string;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

export function DateRangePicker({ value, onChange, placeholder = 'Select date range', className, align = 'end' }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const label = React.useMemo(() => {
    if (value?.from && value?.to) {
      return `${format(value.from, 'MMM d, yyyy')} - ${format(value.to, 'MMM d, yyyy')}`;
    }
    if (value?.from) {
      return `${format(value.from, 'MMM d, yyyy')} - …`;
    }
    return placeholder;
  }, [value, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn('relative w-full h-10 flex items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', !value?.from && 'text-muted-foreground', className)}>
          <div className="flex items-center">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {label}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0" align={align}>
        <div className="p-3">
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={value?.from || value?.to ? value : undefined}
            onSelect={(r: DateRange | undefined) => onChange?.(r ?? { from: undefined, to: undefined })}
            defaultMonth={value?.from || value?.to}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { onChange?.({ from: undefined, to: undefined }); }}>Clear</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Apply</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
