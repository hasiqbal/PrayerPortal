import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrayerTime, PrayerTimeUpdate } from '@/types';
import { updatePrayerTime } from '@/lib/api';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';

interface EditPrayerTimeModalProps {
  row: PrayerTime | null;
  onClose: () => void;
  onSaved: (updated: PrayerTime) => void;
}

const FIELDS: { key: keyof PrayerTimeUpdate; label: string }[] = [
  { key: 'fajr',          label: 'Fajr' },
  { key: 'fajr_jamat',    label: 'Fajr Jamat' },
  { key: 'sunrise',       label: 'Sunrise' },
  { key: 'ishraq',        label: 'Ishraq' },
  { key: 'zawaal',        label: 'Zawaal' },
  { key: 'zuhr',          label: 'Zuhr' },
  { key: 'zuhr_jamat',    label: 'Zuhr Jamat' },
  { key: 'asr',           label: 'Asr' },
  { key: 'asr_jamat',     label: 'Asr Jamat' },
  { key: 'maghrib',       label: 'Maghrib' },
  { key: 'maghrib_jamat', label: 'Maghrib Jamat' },
  { key: 'isha',          label: 'Isha' },
  { key: 'isha_jamat',    label: 'Isha Jamat' },
  { key: 'jumu_ah_1',     label: "Jumu'ah 1" },
  { key: 'jumu_ah_2',     label: "Jumu'ah 2" },
];

// ─── Time stepper helper ──────────────────────────────────────────────────────

function adjustTime(time: string, deltaMinutes: number): string {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time.trim())) return time;
  const [h, m] = time.trim().split(':').map(Number);
  const totalMinutes = h * 60 + m + deltaMinutes;
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const nh = Math.floor(clamped / 60);
  const nm = clamped % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

// ─── TimeField ────────────────────────────────────────────────────────────────

interface TimeFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

const TimeField = ({ label, value, onChange }: TimeFieldProps) => {
  const canStep = !!value && /^\d{1,2}:\d{2}$/.test(value.trim());

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(adjustTime(value, -1))}
          disabled={!canStep}
          className="w-7 h-9 flex items-center justify-center rounded-md border border-border bg-card hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Subtract 1 minute"
        >
          <Minus size={11} />
        </button>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="HH:MM"
          className="font-mono text-sm h-9 text-center min-w-0"
        />
        <button
          type="button"
          onClick={() => onChange(adjustTime(value, +1))}
          disabled={!canStep}
          className="w-7 h-9 flex items-center justify-center rounded-md border border-border bg-card hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Add 1 minute"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const EditPrayerTimeModal = ({ row, onClose, onSaved }: EditPrayerTimeModalProps) => {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      const initial: Record<string, string> = {};
      FIELDS.forEach(({ key }) => {
        initial[key] = (row[key as keyof PrayerTime] as string | null) ?? '';
      });
      setForm(initial);
    }
  }, [row]);

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    try {
      const payload: PrayerTimeUpdate = {};
      FIELDS.forEach(({ key }) => {
        const val = (form[key] ?? '').trim();
        (payload as Record<string, string | null>)[key] = val === '' ? null : val;
      });
      const result = await updatePrayerTime(row.id, payload);
      const updated = result[0] ?? { ...row, ...payload };
      toast.success(`Day ${row.day} updated successfully`);
      onSaved(updated as PrayerTime);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-2xl max-h-[92vh] overflow-y-auto mx-2 sm:mx-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Edit — {row ? `${MONTHS[(row.month ?? 1) - 1]} ${row.day}` : ''}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Times in HH:MM (24-hour). Use +/− to nudge by 1 minute.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          {FIELDS.map(({ key, label }) => (
            <TimeField
              key={key}
              label={label}
              value={form[key] ?? ''}
              onChange={(v) => handleChange(key, v)}
            />
          ))}
        </div>

        <DialogFooter className="pt-2 gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPrayerTimeModal;
