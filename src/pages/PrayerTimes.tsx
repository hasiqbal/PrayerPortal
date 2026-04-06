import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import PrayerTimesTable from '@/components/features/PrayerTimesTable';
import EditPrayerTimeModal from '@/components/features/EditPrayerTimeModal';
import CsvImportModal from '@/components/features/CsvImportModal';
import { fetchPrayerTimes, bulkUpdatePrayerTimes } from '@/lib/api';
import { PrayerTime } from '@/types';
import { toast } from 'sonner';
import {
  Loader2, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, Minus, Plus, CalendarCheck, Upload, Search,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { isBST, lastSundayOf } from '@/lib/dateUtils';

// ─── Hijri offset persistence ─────────────────────────────────────────────────
const HIJRI_OFFSET_KEY = 'hijri_offset';
function loadOffset(): number {
  try { return parseInt(localStorage.getItem(HIJRI_OFFSET_KEY) ?? '0', 10) || 0; } catch { return 0; }
}
function saveOffset(n: number) {
  try { localStorage.setItem(HIJRI_OFFSET_KEY, String(n)); } catch { /* noop */ }
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const YEAR_RANGE: number[] = [];
for (let y = CURRENT_YEAR - 5; y <= CURRENT_YEAR + 10; y++) YEAR_RANGE.push(y);

function monthIsBST(year: number, month: number): boolean {
  return isBST(year, month, 15);
}

function fridayCount(year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    if (new Date(year, month - 1, d).getDay() === 5) count++;
  }
  return count;
}

// ─── JumuahYearModal ─────────────────────────────────────────────────────────
interface JumuahYearModalProps {
  open: boolean;
  onClose: () => void;
  year: number;
  queryClient: ReturnType<typeof useQueryClient>;
}

const JumuahYearModal = ({ open, onClose, year, queryClient }: JumuahYearModalProps) => {
  const [gmt1, setGmt1] = useState('');
  const [gmt2, setGmt2] = useState('');
  const [bst1, setBst1] = useState('');
  const [bst2, setBst2] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(
    () => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  );
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

  const toggleMonth = (m: number) => {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedMonths.size === 12) setSelectedMonths(new Set());
    else setSelectedMonths(new Set([1,2,3,4,5,6,7,8,9,10,11,12]));
  };

  const handleApply = async () => {
    if (selectedMonths.size === 0) { toast.error('Select at least one month.'); return; }
    const gmtPayload = { jumu_ah_1: gmt1.trim() || null, jumu_ah_2: gmt2.trim() || null };
    const bstPayload = { jumu_ah_1: bst1.trim() || null, jumu_ah_2: bst2.trim() || null };
    if (!gmt1.trim() && !gmt2.trim() && !bst1.trim() && !bst2.trim()) {
      toast.error("Enter at least one Jumu'ah time (GMT or BST)."); return;
    }
    setSaving(true);
    let totalFridays = 0;
    const failedMonths: number[] = [];
    for (const month of Array.from(selectedMonths).sort((a, b) => a - b)) {
      const bst = monthIsBST(year, month);
      const payload = bst ? bstPayload : gmtPayload;
      if (!payload.jumu_ah_1 && !payload.jumu_ah_2) continue;
      setProgress(`Updating ${MONTHS_SHORT[month - 1]}…`);
      try {
        let rows = queryClient.getQueryData<PrayerTime[]>(['prayer_times', month]);
        if (!rows) { rows = await fetchPrayerTimes(month); queryClient.setQueryData(['prayer_times', month], rows); }
        const fridays = rows.filter((r) => new Date(year, month - 1, r.day).getDay() === 5);
        if (fridays.length === 0) continue;
        const updated = await bulkUpdatePrayerTimes(fridays.map((r) => r.id), payload);
        totalFridays += fridays.length;
        queryClient.setQueryData<PrayerTime[]>(['prayer_times', month], (old) => {
          if (!old) return old;
          const map = new Map(updated.map((r) => [r.id, r]));
          return old.map((r) => map.get(r.id) ?? r);
        });
      } catch { failedMonths.push(month); }
    }
    setSaving(false); setProgress('');
    if (failedMonths.length > 0) {
      toast.error(`Failed for: ${failedMonths.map((m) => MONTHS_SHORT[m - 1]).join(', ')}`);
    } else {
      toast.success(`Jumu'ah times set for ${totalFridays} Friday${totalFridays !== 1 ? 's' : ''} across ${selectedMonths.size} month${selectedMonths.size !== 1 ? 's' : ''} in ${year}.`);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <CalendarCheck size={16} className="text-teal-600" />
            Set Jumu'ah Times — {year}
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Set separate times for GMT (winter) and BST (summer) months. Times in HH:MM (24-hour) format.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 uppercase tracking-wide">GMT</span>
              <span className="text-xs text-slate-500">Nov – Mar (winter)</span>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs font-medium text-slate-600">Jumu'ah 1 (1st time)</Label>
                <Input value={gmt1} onChange={(e) => setGmt1(e.target.value)} placeholder="e.g. 12:45" className="font-mono text-sm h-8 mt-1 bg-white" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Jumu'ah 2 (2nd time)</Label>
                <Input value={gmt2} onChange={(e) => setGmt2(e.target.value)} placeholder="e.g. 13:30" className="font-mono text-sm h-8 mt-1 bg-white" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-800 uppercase tracking-wide">BST</span>
              <span className="text-xs text-emerald-600">Apr – Oct (summer)</span>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs font-medium text-emerald-700">Jumu'ah 1 (1st time)</Label>
                <Input value={bst1} onChange={(e) => setBst1(e.target.value)} placeholder="e.g. 13:30" className="font-mono text-sm h-8 mt-1 bg-white" />
              </div>
              <div>
                <Label className="text-xs font-medium text-emerald-700">Jumu'ah 2 (2nd time)</Label>
                <Input value={bst2} onChange={(e) => setBst2(e.target.value)} placeholder="e.g. 14:30" className="font-mono text-sm h-8 mt-1 bg-white" />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Apply to months</span>
            <button onClick={toggleAll} className="text-xs text-primary hover:underline font-medium">
              {selectedMonths.size === 12 ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {MONTHS_SHORT.map((abbr, i) => {
              const month = i + 1;
              const bst = monthIsBST(year, month);
              const isMixed = month === 3 || month === 10;
              const selected = selectedMonths.has(month);
              const fridays = fridayCount(year, month);
              return (
                <button
                  key={month}
                  onClick={() => toggleMonth(month)}
                  title={`${MONTHS_FULL[i]} — ${fridays} Friday${fridays !== 1 ? 's' : ''} — ${isMixed ? '⚡ Clock change' : bst ? 'BST' : 'GMT'}`}
                  className={`relative flex flex-col items-center py-2 px-1 rounded-lg border text-xs font-medium transition-all ${
                    selected
                      ? bst ? 'border-emerald-400 bg-emerald-100 text-emerald-800' : 'border-slate-400 bg-slate-200 text-slate-800'
                      : 'border-border bg-card text-muted-foreground hover:border-border/80 opacity-50'
                  }`}
                >
                  {isMixed && <span className="absolute -top-1 -right-1 text-[9px] leading-none">⚡</span>}
                  <span className="font-semibold">{abbr}</span>
                  <span className={`text-[9px] mt-0.5 font-normal ${selected ? '' : 'opacity-60'}`}>{fridays}F</span>
                  <span className={`text-[8px] font-bold mt-0.5 ${bst ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {isMixed ? '⚡' : bst ? 'BST' : 'GMT'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            ⚡ March &amp; October are clock-change months — they use the mid-month timezone to determine which times to apply.
            {selectedMonths.size > 0 && (
              <span className="ml-1 font-medium text-foreground/70">
                {Array.from(selectedMonths).reduce((sum, m) => sum + fridayCount(year, m), 0)} total Fridays selected.
              </span>
            )}
          </p>
        </div>

        {saving && progress && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
            <Loader2 size={13} className="animate-spin" />{progress}
          </div>
        )}

        <DialogFooter className="gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleApply}
            disabled={saving || selectedMonths.size === 0}
            className="gap-2"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Applying…</> : <>Apply to {selectedMonths.size} Month{selectedMonths.size !== 1 ? 's' : ''}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const PrayerTimes = () => {
  const [selectedYear,  setSelectedYear]  = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [editingRow,    setEditingRow]    = useState<PrayerTime | null>(null);
  const [jumuahModal,   setJumuahModal]   = useState(false);
  const [csvModal,      setCsvModal]      = useState(false);
  const [csvPreload,    setCsvPreload]    = useState<string | undefined>(undefined);
  const [hijriOffset,   setHijriOffset]   = useState<number>(loadOffset);
  const [jumpInput,     setJumpInput]     = useState('');
  const [highlightDay,  setHighlightDay]  = useState<number | null>(null);
  const [searchParams, setSearchParams]   = useSearchParams();

  // Auto-open CSV import modal if navigated from Excel Converter
  useEffect(() => {
    if (searchParams.get('import') === '1') {
      const stored = sessionStorage.getItem('csv_import_payload');
      if (stored) {
        setCsvPreload(stored);
        sessionStorage.removeItem('csv_import_payload');
        setCsvModal(true);
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const changeOffset = (delta: number) => {
    setHijriOffset((prev) => {
      const next = Math.max(-30, Math.min(30, prev + delta));
      saveOffset(next);
      return next;
    });
  };

  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['prayer_times', selectedMonth],
    queryFn: () => fetchPrayerTimes(selectedMonth),
    staleTime: 30_000,
  });

  const handleSaved = useCallback((updated: PrayerTime) => {
    queryClient.setQueryData<PrayerTime[]>(['prayer_times', selectedMonth], (old) =>
      old ? old.map((r) => (r.id === updated.id ? updated : r)) : old
    );
    setEditingRow(null);
  }, [queryClient, selectedMonth]);

  const handleJumpToDay = () => {
    const day = parseInt(jumpInput.trim(), 10);
    if (isNaN(day) || day < 1 || day > 31) {
      setHighlightDay(null);
      return;
    }
    setHighlightDay(day);
    // scroll to the row — works for both mobile cards and desktop table rows
    setTimeout(() => {
      const el = document.querySelector(`[data-day="${day}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
    // auto-clear highlight after 3 seconds
    setTimeout(() => setHighlightDay(null), 3000);
  };

  const handleCsvImported = useCallback((updatedByMonth: Map<number, PrayerTime[]>) => {
    // Update cache for every month that was imported
    updatedByMonth.forEach((updated, m) => {
      queryClient.setQueryData<PrayerTime[]>(['prayer_times', m], (old) => {
        if (!old) return old;
        const map = new Map(updated.map((r) => [r.id, r]));
        return old.map((r) => map.get(r.id) ?? r);
      });
    });
    setCsvModal(false);
  }, [queryClient]);

  const monthHasBSTChange = (m: number) => m === 3 || m === 10;
  const _bstStartDay = lastSundayOf(selectedYear, 3);

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
        <div className="px-4 sm:px-8 pt-4 sm:pt-8 pb-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                Prayer Times
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {MONTHS_FULL[selectedMonth - 1]} {selectedYear} · {data?.length ?? 0} days ·{' '}
                {isBST(selectedYear, selectedMonth, 15) ? (
                  <span className="font-medium" style={{color:'hsl(var(--primary))'}}>BST (UTC+1)</span>
                ) : (
                  <span className="text-slate-500 font-medium">GMT (UTC+0)</span>
                )}
                {monthHasBSTChange(selectedMonth) && (
                  <span className="ml-2 text-amber-600 font-medium text-xs">⚡ Clock change this month</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:justify-end">
              {/* Hijri offset */}
              <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1 bg-card" title="Moroccan Hijri calendar offset (days)">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Hijri</span>
                <button onClick={() => changeOffset(-1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-secondary transition-colors"><Minus size={10} /></button>
                <span className={`text-xs font-bold tabular-nums w-8 text-center ${hijriOffset === 0 ? 'text-muted-foreground' : hijriOffset > 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                  {hijriOffset > 0 ? `+${hijriOffset}` : hijriOffset === 0 ? '±0' : hijriOffset}
                </span>
                <button onClick={() => changeOffset(1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-secondary transition-colors"><Plus size={10} /></button>
                {hijriOffset !== 0 && (
                  <button onClick={() => { saveOffset(0); setHijriOffset(0); }} className="ml-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">reset</button>
                )}
              </div>

              {/* Jump to day */}
              <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1 bg-card">
                <Search size={12} className="text-muted-foreground shrink-0" />
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJumpToDay(); }}
                  placeholder="Day"
                  className="w-12 bg-transparent text-xs font-mono outline-none text-foreground placeholder:text-muted-foreground/60"
                />
                <button
                  onClick={handleJumpToDay}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  Go
                </button>
              </div>

              <Button variant="outline" size="sm" onClick={() => setCsvModal(true)} className="gap-2 border-primary/30 text-primary hover:bg-primary/5">
                <Upload size={14} />
                Import CSV
              </Button>

              <Button variant="outline" size="sm" onClick={() => setJumuahModal(true)} className="gap-2 border-primary/40 text-primary hover:bg-primary/5">
                <CalendarCheck size={14} />
                Set Jumu'ah
              </Button>

              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                Refresh
              </Button>
            </div>
          </div>

          {/* ── Year selector ── */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">Year</span>
            <button onClick={() => setSelectedYear((y) => Math.max(y - 1, YEAR_RANGE[0]))} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors">
              <ChevronLeft size={13} />
            </button>
            <div className="flex items-center gap-1 flex-wrap">
              {YEAR_RANGE.map((y) => {
                const active = selectedYear === y;
                const isCurrent = y === CURRENT_YEAR;
                return (
                  <button
                    key={y}
                    onClick={() => setSelectedYear(y)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                      active ? 'border-transparent text-white shadow-sm'
                        : isCurrent ? 'border-primary/30 hover:bg-primary/5' 
                        : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80'
                    }`}
                    style={active ? { background: 'hsl(var(--primary))' } : {}}
                  >
                    {y}
                    {isCurrent && !active && <span className="ml-0.5 inline-block w-1 h-1 rounded-full bg-primary align-middle" style={{background:'hsl(var(--primary))'}} />}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSelectedYear((y) => Math.min(y + 1, YEAR_RANGE[YEAR_RANGE.length - 1]))} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>

          {/* ── Month selector ── */}
          <div className="flex items-center gap-1.5 flex-wrap pb-5 border-b border-border overflow-x-auto">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">Month</span>
            {MONTHS_SHORT.map((abbr, i) => {
              const month = i + 1;
              const active = selectedMonth === month;
              const isCurrent = month === CURRENT_MONTH && selectedYear === CURRENT_YEAR;
              const hasClock = monthHasBSTChange(month);
              return (
                <button
                  key={month}
                  onClick={() => setSelectedMonth(month)}
                  className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    active ? 'border-transparent text-white shadow-sm' : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80'
                  }`}
                  style={active ? { background: 'hsl(var(--primary))' } : {}}
                  title={hasClock ? 'Clock change this month (BST/GMT transition)' : undefined}
                >
                  {abbr}
                  {hasClock && <span className="absolute -top-1 -right-1 text-[9px] leading-none">⚡</span>}
                  {isCurrent && !active && <span className="ml-1 inline-block w-1 h-1 rounded-full align-middle" style={{background:'hsl(var(--primary))'}} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="px-4 sm:px-8 pt-3 pb-1 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-[#fef9ec] border border-amber-200" />Jumu'ah (Friday)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-[#eff6ff] border border-blue-200" />Today</span>
          <span className="flex items-center gap-1.5"><span className="inline-block px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[9px]">BST</span>British Summer Time (UTC+1)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[9px]">GMT</span>Greenwich Mean Time (UTC+0)</span>
          <span className="flex items-center gap-1.5"><span className="text-[10px]">⚡</span>Clock change month</span>
        </div>

        {/* ── Content ── */}
        <div className="px-2 sm:px-8 py-4 flex-1 overflow-x-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Loading prayer times…</span>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
              <AlertCircle size={16} />
              Failed to load data. Check your connection and try refreshing.
            </div>
          )}
          {!isLoading && !isError && data && (
            <PrayerTimesTable data={data} year={selectedYear} hijriOffset={hijriOffset} onEdit={setEditingRow} highlightDay={highlightDay} />
          )}
        </div>
      </main>

      <JumuahYearModal open={jumuahModal} onClose={() => setJumuahModal(false)} year={selectedYear} queryClient={queryClient} />

      <EditPrayerTimeModal row={editingRow} onClose={() => setEditingRow(null)} onSaved={handleSaved} />

      <CsvImportModal
        open={csvModal}
        onClose={() => { setCsvModal(false); setCsvPreload(undefined); }}
        month={selectedMonth}
        monthName={MONTHS_FULL[selectedMonth - 1]}
        year={selectedYear}
        onImported={handleCsvImported}
        preloadedCsv={csvPreload}
      />
    </div>
  );
};

export default PrayerTimes;
