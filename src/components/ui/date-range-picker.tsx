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
        <Button
          variant="outline"
          className={cn('w-full justify-start text-left font-normal h-9', !value?.from && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align={align}>
        <div className="p-3">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={{ from: value?.from, to: value?.to } as any}
            onSelect={(r: any) => onChange?.(r || {})}
            defaultMonth={value?.from}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { onChange?.({}); }}>Clear</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Apply</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
