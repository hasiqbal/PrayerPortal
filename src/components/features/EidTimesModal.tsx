import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabaseAdmin } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Moon, Star, ChevronLeft, ChevronRight, CheckCircle2, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EidType = 'eid_al_fitr' | 'eid_al_adha';

export interface EidPrayer {
  id?: string;
  eid_type: EidType;
  year: number;
  jamaat_number: number;
  time: string | null;
  is_active: boolean;
  notes?: string | null;
}

// ─── SQL setup string (shown in banner if table missing) ───────────────────────

export const EID_SQL_SETUP = `-- Run in your Supabase SQL Editor (lhaqqqatdztuijgdfdcf):
create table if not exists public.eid_prayers (
  id             uuid primary key default gen_random_uuid(),
  eid_type       text not null check (eid_type in ('eid_al_fitr', 'eid_al_adha')),
  year           integer not null,
  jamaat_number  integer not null check (jamaat_number between 1 and 7),
  time           text,
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (eid_type, year, jamaat_number)
);

alter table public.eid_prayers enable row level security;

create policy if not exists "anon_select_eid_prayers"
  on public.eid_prayers for select to anon using (true);

create policy if not exists "auth_all_eid_prayers"
  on public.eid_prayers for all to authenticated using (true) with check (true);

create policy if not exists "service_all_eid_prayers"
  on public.eid_prayers for all to service_role using (true) with check (true);`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchEidPrayers(year: number): Promise<EidPrayer[]> {
  const { data, error } = await supabaseAdmin
    .from('eid_prayers')
    .select('*')
    .eq('year', year)
    .order('eid_type')
    .order('jamaat_number');

  if (error) {
    console.error('[eid_prayers] Fetch error:', error.message);
    return [];
  }
  return (data ?? []) as EidPrayer[];
}

async function saveEidPrayers(
  eidType: EidType,
  year: number,
  times: string[],
): Promise<{ ok: boolean; saved: number; cleared: number; error?: string }> {
  let saved = 0;
  let cleared = 0;

  for (let i = 0; i < 7; i++) {
    const jamaat = i + 1;
    const rawTime = (times[i] ?? '').trim();

    if (!rawTime) {
      // Delete entry if it exists (time cleared)
      const { error } = await supabaseAdmin
        .from('eid_prayers')
        .delete()
        .eq('eid_type', eidType)
        .eq('year', year)
        .eq('jamaat_number', jamaat);
      if (!error) cleared++;
    } else {
      const { error } = await supabaseAdmin
        .from('eid_prayers')
        .upsert(
          {
            eid_type: eidType,
            year,
            jamaat_number: jamaat,
            time: rawTime,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'eid_type,year,jamaat_number' },
        );
      if (error) {
        return { ok: false, saved, cleared, error: error.message };
      }
      saved++;
    }
  }

  return { ok: true, saved, cleared };
}

// ─── EID SQL Banner ───────────────────────────────────────────────────────────

export const EidSqlBanner = ({ onDismiss }: { onDismiss: () => void }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-2 sm:mx-0 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <Moon size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-700">eid_prayers table needs setup</p>
          <p className="text-xs text-amber-600 mt-1">
            Run this SQL once in your <strong>Supabase dashboard → SQL Editor</strong>:
          </p>
          <pre className="mt-2 p-3 bg-white border border-amber-200 rounded-lg text-[10px] font-mono text-slate-700 overflow-x-auto max-h-40 whitespace-pre-wrap leading-relaxed">
            {EID_SQL_SETUP}
          </pre>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => { navigator.clipboard.writeText(EID_SQL_SETUP); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy SQL'}
            </button>
            <button onClick={onDismiss} className="text-xs font-medium text-amber-500 hover:text-amber-700 transition-colors">
              Dismiss (after running SQL)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Tab config ───────────────────────────────────────────────────────────────

const EID_TABS: { type: EidType; label: string; arabic: string; hijriDate: string; color: string; bg: string; border: string }[] = [
  {
    type:      'eid_al_fitr',
    label:     'Eid al-Fitr',
    arabic:    'عيد الفطر',
    hijriDate: '1 Shawwal',
    color:     '#15803d',
    bg:        'hsl(142 50% 96%)',
    border:    'hsl(142 50% 80%)',
  },
  {
    type:      'eid_al_adha',
    label:     'Eid al-Adha',
    arabic:    'عيد الأضحى',
    hijriDate: '10 Dhul Hijjah',
    color:     '#b45309',
    bg:        'hsl(38 80% 97%)',
    border:    'hsl(38 80% 78%)',
  },
];

// ─── Modal ────────────────────────────────────────────────────────────────────

interface EidTimesModalProps {
  open: boolean;
  onClose: () => void;
  year: number;
  onSaved?: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - 1 + i);

const EidTimesModal = ({ open, onClose, year: initialYear, onSaved }: EidTimesModalProps) => {
  const [year,         setYear]         = useState(initialYear);
  const [activeTab,    setActiveTab]    = useState<EidType>('eid_al_fitr');
  const [times,        setTimes]        = useState<Record<EidType, string[]>>({
    eid_al_fitr: Array(7).fill(''),
    eid_al_adha: Array(7).fill(''),
  });
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [tableError,   setTableError]   = useState(false);
  const [savedCounts,  setSavedCounts]  = useState<Record<EidType, number>>({ eid_al_fitr: 0, eid_al_adha: 0 });

  // Load Eid times when year or open changes
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSaved(false);
    fetchEidPrayers(year).then((rows) => {
      if (rows.length === 0) {
        // Check if the table exists by attempting a probe select
        supabaseAdmin.from('eid_prayers').select('id').limit(1).then(({ error }) => {
          if (error && (error.message.includes('does not exist') || error.message.includes('relation'))) {
            setTableError(true);
          }
        });
      }

      const newTimes: Record<EidType, string[]> = {
        eid_al_fitr: Array(7).fill(''),
        eid_al_adha: Array(7).fill(''),
      };
      const counts: Record<EidType, number> = { eid_al_fitr: 0, eid_al_adha: 0 };

      for (const row of rows) {
        const idx = row.jamaat_number - 1;
        if (idx >= 0 && idx < 7) {
          newTimes[row.eid_type][idx] = row.time ?? '';
          if (row.time) counts[row.eid_type]++;
        }
      }

      setTimes(newTimes);
      setSavedCounts(counts);
      setLoading(false);
    });
  }, [open, year]);

  const handleTimeChange = (eidType: EidType, idx: number, val: string) => {
    setTimes((prev) => {
      const next = { ...prev };
      next[eidType] = [...prev[eidType]];
      next[eidType][idx] = val;
      return next;
    });
    setSaved(false);
  };

  const clearAll = (eidType: EidType) => {
    setTimes((prev) => ({ ...prev, [eidType]: Array(7).fill('') }));
    setSaved(false);
  };

  const handleSave = async (eidType: EidType) => {
    setSaving(true);
    setSaved(false);
    const result = await saveEidPrayers(eidType, year, times[eidType]);
    setSaving(false);

    if (!result.ok) {
      if (result.error?.includes('does not exist') || result.error?.includes('relation') || result.error?.includes('schema cache')) {
        setTableError(true);
      }
      toast.error(`Save failed: ${result.error}`);
      return;
    }

    // Update saved counts
    setSavedCounts((prev) => ({ ...prev, [eidType]: result.saved }));
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
    onSaved?.();
    toast.success(`✓ ${EID_TABS.find(t => t.type === eidType)?.label} — ${result.saved} jamaat${result.saved !== 1 ? 's' : ''} saved for ${year}`);
  };

  const activeTabConfig = EID_TABS.find(t => t.type === activeTab)!;
  const filledCount = times[activeTab].filter(t => t.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg max-h-[92vh] overflow-y-auto mx-2 sm:mx-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: activeTabConfig.bg, border: `1.5px solid ${activeTabConfig.border}` }}>
              <Moon size={19} style={{ color: activeTabConfig.color }} />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base font-bold text-[hsl(150_30%_12%)]">
                Eid Prayer Times
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Up to 7 optional jamaats per Eid</p>
            </div>

            {/* Year stepper */}
            <div className="flex items-center gap-1 border border-[hsl(140_20%_88%)] rounded-lg px-2 py-1.5 bg-[hsl(140_30%_97%)]">
              <button
                onClick={() => setYear(y => Math.max(y - 1, YEAR_OPTS[0]))}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white transition-colors"
              >
                <ChevronLeft size={11} />
              </button>
              <span className="text-xs font-bold tabular-nums w-12 text-center">{year}</span>
              <button
                onClick={() => setYear(y => Math.min(y + 1, YEAR_OPTS[YEAR_OPTS.length - 1]))}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white transition-colors"
              >
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Table error banner */}
        {tableError && (
          <EidSqlBanner onDismiss={() => setTableError(false)} />
        )}

        {/* Tabs */}
        <div className="flex rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden bg-[hsl(140_20%_97%)] p-1 gap-1">
          {EID_TABS.map((tab) => {
            const count = savedCounts[tab.type];
            return (
              <button
                key={tab.type}
                onClick={() => setActiveTab(tab.type)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${activeTab === tab.type ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                style={activeTab === tab.type ? { color: tab.color } : {}}
              >
                <Moon size={13} />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: tab.color + '18', color: tab.color }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Eid info banner */}
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: activeTabConfig.bg, border: `1px solid ${activeTabConfig.border}` }}>
          <Star size={15} style={{ color: activeTabConfig.color }} />
          <div>
            <p className="text-xs font-bold" style={{ color: activeTabConfig.color }}>{activeTabConfig.label}</p>
            <p className="text-[11px]" style={{ color: activeTabConfig.color + 'aa' }}>
              Displayed on <strong>{activeTabConfig.hijriDate}</strong> in the prayer times table
            </p>
          </div>
          <p className="ml-auto font-bold text-sm" style={{ color: activeTabConfig.color, fontFamily: 'serif' }} dir="rtl">
            {activeTabConfig.arabic}
          </p>
        </div>

        {/* Jamaat time inputs */}
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading saved times…</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Jamaat Times — {year} · {filledCount} set
              </p>
              {filledCount > 0 && (
                <button
                  onClick={() => clearAll(activeTab)}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 size={11} /> Clear all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {Array.from({ length: 7 }, (_, i) => {
                const idx = i;
                const num = i + 1;
                const val = times[activeTab][idx] ?? '';
                const isFilled = !!val.trim();

                return (
                  <div key={num} className="flex items-center gap-3">
                    {/* Label */}
                    <div
                      className="w-20 shrink-0 flex items-center gap-2"
                    >
                      <span
                        className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: isFilled ? activeTabConfig.color + '18' : 'hsl(140 20% 94%)',
                          color: isFilled ? activeTabConfig.color : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {num}
                      </span>
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Jamaat {num}
                      </Label>
                    </div>

                    {/* Time input */}
                    <Input
                      value={val}
                      onChange={(e) => handleTimeChange(activeTab, idx, e.target.value)}
                      placeholder={idx === 0 ? 'e.g. 07:00' : 'optional'}
                      className={`font-mono text-sm h-9 flex-1 transition-all ${isFilled ? 'border-opacity-70' : ''}`}
                      style={isFilled ? { borderColor: activeTabConfig.border } : {}}
                    />

                    {/* Filled indicator */}
                    {isFilled ? (
                      <span className="text-[10px] font-semibold shrink-0" style={{ color: activeTabConfig.color }}>✓</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">—</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground">
              Leave jamaats empty to not show them. Times are in <strong>HH:MM</strong> 24-hour format.
            </p>
          </div>
        )}

        {/* Save confirmation */}
        {saved && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-700">Changes saved successfully</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {filledCount} jamaat{filledCount !== 1 ? 's' : ''} for {activeTabConfig.label} {year} are now stored in the database.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="pt-1 gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="border-[hsl(140_20%_88%)]">
            Close
          </Button>
          <Button
            onClick={() => handleSave(activeTab)}
            disabled={saving || loading || tableError}
            style={{ background: activeTabConfig.color, color: 'white' }}
          >
            {saving
              ? <><Loader2 size={13} className="animate-spin mr-1.5" />Saving…</>
              : <>Save {activeTabConfig.label} {year}</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EidTimesModal;
export { fetchEidPrayers };
export type { EidTimesModalProps };
