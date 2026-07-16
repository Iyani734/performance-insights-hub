import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DateRange = { preset: string; from?: string; to?: string };

const PRESETS = [
  { value: "4", label: "Last 4 weeks" },
  { value: "8", label: "Last 8 weeks" },
  { value: "12", label: "Last 12 weeks" },
  { value: "26", label: "Last 26 weeks" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range…" },
];

export function DateRangeSelect({ value, onChange, className }: { value: DateRange; onChange: (v: DateRange) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");

  const label = value.preset === "custom" && value.from && value.to
    ? `${value.from} → ${value.to}`
    : PRESETS.find(p => p.value === value.preset)?.label ?? "Select range";

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[220px] justify-between font-normal">
            <span className="flex items-center gap-2"><CalendarIcon className="w-4 h-4 opacity-60" />{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-3 space-y-3">
          <Select value={value.preset} onValueChange={(v) => {
            if (v !== "custom") { onChange({ preset: v }); setOpen(false); }
            else onChange({ preset: "custom", from, to });
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          {value.preset === "custom" && (
            <div className="space-y-2 pt-1 border-t">
              <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <Button size="sm" className="w-full" disabled={!from || !to} onClick={() => { onChange({ preset: "custom", from, to }); setOpen(false); }}>Apply</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
