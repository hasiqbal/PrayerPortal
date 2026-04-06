import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

const EXT_URL = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';
const EXT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

type LogEntry = { msg: string; type: 'info' | 'ok' | 'error' | 'warn' };

async function fetchExternal(table: string, select: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const res = await fetch(
      `${EXT_URL}/${table}?select=${encodeURIComponent(select)}&limit=${limit}&offset=${offset}`,
      {
        headers: {
          'apikey': EXT_KEY,
          'Authorization': `Bearer ${EXT_KEY}`,
          'Range-Unit': 'items',
          'Range': `${offset}-${offset + limit - 1}`,
        },
      }
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    let rows: Record<string, unknown>[];
    try { rows = JSON.parse(text); } catch { throw new Error(`JSON parse error: ${text.slice(0, 200)}`); }
    if (!Array.isArray(rows)) throw new Error(`Expected array, got: ${text.slice(0, 200)}`);
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

async function upsertBatches(
  table: string,
  rows: Record<string, unknown>[],
  batchSize: number,
  log: (e: LogEntry) => void
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
    if (error) {
      throw new Error(`Batch ${i / batchSize + 1} failed — ${error.message} (code: ${error.code}, details: ${error.details})`);
    }
    inserted += batch.length;
    log({ msg: `  ✓ ${table}: inserted ${inserted}/${rows.length}`, type: 'info' });
  }
  return inserted;
}

export default function MigrateData() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 50);
  };

  const runMigration = async () => {
    setRunning(true);
    setDone(false);
    setLogs([]);

    try {
      // ── 1. ADHKAR ──────────────────────────────────────────────────────────
      addLog({ msg: '── Fetching adhkar from external backend…', type: 'info' });
      const rawAdhkar = await fetchExternal(
        'adhkar',
        'id,title,arabic_title,arabic,transliteration,translation,reference,count,prayer_time,group_name,group_order,display_order,is_active,file_url,description,sections,created_at,updated_at'
      );
      addLog({ msg: `  Fetched ${rawAdhkar.length} adhkar rows`, type: 'ok' });

      const adhkar = rawAdhkar.map((r) => ({
        ...r,
        count: r.count != null ? parseInt(String(r.count), 10) || 1 : 1,
        group_order: r.group_order != null ? parseInt(String(r.group_order), 10) || 0 : 0,
        display_order: r.display_order != null ? parseInt(String(r.display_order), 10) || 0 : 0,
        sections: r.sections === 'null' || r.sections === '' ? null : r.sections ?? null,
        // Blank-out unknown prayer_time values to avoid CHECK constraint
        prayer_time: [
          'before-fajr','fajr','after-fajr','ishraq','duha',
          'zuhr','after-zuhr','asr','after-asr','maghrib','after-maghrib',
          'isha','after-isha','before-sleep','morning','evening',
          'jumuah','after-jumuah','general'
        ].includes(String(r.prayer_time ?? '')) ? r.prayer_time : null,
      }));

      const adhkarCount = await upsertBatches('adhkar', adhkar, 50, addLog);
      addLog({ msg: `✅ adhkar done — ${adhkarCount} rows`, type: 'ok' });

      // ── 2. PRAYER TIMES ────────────────────────────────────────────────────
      addLog({ msg: '── Fetching prayer_times from external backend…', type: 'info' });
      const rawPt = await fetchExternal(
        'prayer_times',
        'id,month,day,date,fajr,fajr_jamat,sunrise,ishraq,zuhr,zuhr_jamat,zawaal,asr,asr_jamat,maghrib,maghrib_jamat,isha,isha_jamat,jumu_ah_1,jumu_ah_2,created_at,updated_at'
      );
      addLog({ msg: `  Fetched ${rawPt.length} prayer_time rows`, type: 'ok' });
      const ptCount = await upsertBatches('prayer_times', rawPt, 100, addLog);
      addLog({ msg: `✅ prayer_times done — ${ptCount} rows`, type: 'ok' });

      // ── 3. ANNOUNCEMENTS ───────────────────────────────────────────────────
      addLog({ msg: '── Fetching announcements from external backend…', type: 'info' });
      // First do a probe request to see which columns exist
      let annSelect = 'id,title,body,is_active,created_at,updated_at';
      try {
        const probe = await fetchExternal('announcements', 'id,display_order');
        if (probe.length === 0 || 'display_order' in probe[0]) annSelect += ',display_order';
      } catch { /* column doesn't exist, skip */ }
      try {
        await fetchExternal('announcements', 'id,link_url');
        annSelect += ',link_url';
      } catch { /* column doesn't exist, skip */ }
      try {
        await fetchExternal('announcements', 'id,image_url');
        annSelect += ',image_url';
      } catch { /* column doesn't exist, skip */ }

      addLog({ msg: `  Using columns: ${annSelect}`, type: 'info' });
      const rawAnn = await fetchExternal('announcements', annSelect);
      addLog({ msg: `  Fetched ${rawAnn.length} announcement rows`, type: 'ok' });
      const annCount = await upsertBatches('announcements', rawAnn, 100, addLog);
      addLog({ msg: `✅ announcements done — ${annCount} rows`, type: 'ok' });

      // ── 4. SUNNAH REMINDERS ────────────────────────────────────────────────
      addLog({ msg: '── Fetching sunnah_reminders from external backend…', type: 'info' });
      const rawSr = await fetchExternal(
        'sunnah_reminders',
        'id,title,arabic_title,arabic,transliteration,translation,description,reference,count,category,group_name,group_order,display_order,is_active,file_url,created_at,updated_at'
      );
      addLog({ msg: `  Fetched ${rawSr.length} sunnah_reminder rows`, type: 'ok' });
      const srCount = await upsertBatches('sunnah_reminders', rawSr, 50, addLog);
      addLog({ msg: `✅ sunnah_reminders done — ${srCount} rows`, type: 'ok' });

      addLog({ msg: '🎉 Migration complete!', type: 'ok' });
      setDone(true);
    } catch (err) {
      addLog({ msg: `❌ ERROR: ${String(err)}`, type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-green-800">Data Migration</h1>
        <p className="text-gray-500 text-sm mt-1">
          Copies adhkar, prayer_times, sunnah_reminders, and announcements from the external
          backend directly into this project's backend — runs entirely in the browser.
        </p>
      </div>

      <Button
        onClick={runMigration}
        disabled={running}
        className="bg-green-700 hover:bg-green-800 text-white"
      >
        {running ? 'Migrating…' : done ? 'Run Again' : 'Run Migration'}
      </Button>

      {logs.length > 0 && (
        <div
          ref={logRef}
          className="bg-gray-950 text-gray-100 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs space-y-0.5"
        >
          {logs.map((l, i) => (
            <div
              key={i}
              className={
                l.type === 'error' ? 'text-red-400' :
                l.type === 'ok' ? 'text-green-400' :
                l.type === 'warn' ? 'text-yellow-400' :
                'text-gray-300'
              }
            >
              {l.msg}
            </div>
          ))}
          {running && <div className="text-gray-500 animate-pulse">…</div>}
        </div>
      )}

      {done && (
        <p className="text-green-700 font-medium text-sm">
          Migration successful. You can now remove this page and update the portal to read from this backend.
        </p>
      )}
    </div>
  );
}
