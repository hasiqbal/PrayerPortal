
import { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle2, Table2, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Sidebar from '@/components/layout/Sidebar';
import { toast } from 'sonner';

const BASE_URL = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai';
const REST_URL = `${BASE_URL}/rest/v1`;

const EXT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';
const THIS_URL = import.meta.env.VITE_SUPABASE_URL as string;
const THIS_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Known tables with their column definitions derived from live schema
const TABLES: TableDef[] = [
  {
    name: 'sunnah_reminders',
    description: 'Sunnah practices and reminders for the app',
    endpoint: `${REST_URL}/sunnah_reminders`,
    apiKey: EXT_KEY,
    apiBase: REST_URL,
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'title', type: 'text', notes: 'Short English title' },
      { name: 'detail', type: 'text', notes: 'Nullable — explanation / hadith text' },
      { name: 'reference', type: 'text', notes: 'Nullable — e.g. Bukhari 245' },
      { name: 'icon', type: 'text', notes: 'Nullable — icon name or image URL' },
      { name: 'friday_only', type: 'boolean', notes: 'Show only on Fridays' },
      { name: 'display_order', type: 'integer', notes: 'Sort order' },
      { name: 'is_active', type: 'boolean', notes: 'Visible in app' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'prayer_times',
    description: 'Daily prayer times for the entire year',
    endpoint: `${REST_URL}/prayer_times`,
    apiKey: EXT_KEY,
    apiBase: REST_URL,
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'month', type: 'integer', notes: '1–12' },
      { name: 'day', type: 'integer', notes: '1–31' },
      { name: 'date', type: 'text', notes: 'DD/MM/YYYY display string' },
      { name: 'fajr', type: 'time', notes: '' },
      { name: 'fajr_jamat', type: 'time', notes: 'Nullable' },
      { name: 'sunrise', type: 'time', notes: '' },
      { name: 'ishraq', type: 'time', notes: 'Nullable' },
      { name: 'zawaal', type: 'time', notes: 'Nullable' },
      { name: 'zuhr', type: 'time', notes: '' },
      { name: 'zuhr_jamat', type: 'time', notes: 'Nullable' },
      { name: 'asr', type: 'time', notes: '' },
      { name: 'asr_jamat', type: 'time', notes: 'Nullable' },
      { name: 'maghrib', type: 'time', notes: '' },
      { name: 'maghrib_jamat', type: 'time', notes: 'Nullable' },
      { name: 'isha', type: 'time', notes: '' },
      { name: 'isha_jamat', type: 'time', notes: 'Nullable' },
      { name: "jumu_ah_1", type: 'time', notes: 'Nullable' },
      { name: "jumu_ah_2", type: 'time', notes: 'Nullable' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'adhkar',
    description: 'Islamic remembrances and supplications',
    endpoint: `${REST_URL}/adhkar`,
    apiKey: EXT_KEY,
    apiBase: REST_URL,
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'title', type: 'text', notes: 'Name of the wird' },
      { name: 'arabic_title', type: 'text', notes: 'Nullable — Arabic name' },
      { name: 'arabic', type: 'text', notes: 'Full Arabic text' },
      { name: 'transliteration', type: 'text', notes: 'Nullable' },
      { name: 'translation', type: 'text', notes: 'Nullable' },
      { name: 'reference', type: 'text', notes: 'Nullable — hadith/quran ref' },
      { name: 'count', type: 'text', notes: 'Repetitions string e.g. "3"' },
      { name: 'prayer_time', type: 'text', notes: 'Slug e.g. after-fajr' },
      { name: 'group_name', type: 'text', notes: 'Nullable — e.g. Wird al-Latif' },
      { name: 'group_order', type: 'integer', notes: 'Nullable — group sort order' },
      { name: 'display_order', type: 'integer', notes: 'Nullable — item sort order' },
      { name: 'sections', type: 'text', notes: 'Nullable — JSON sections' },
      { name: 'is_active', type: 'boolean', notes: 'Visible in app' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'announcements',
    description: 'Masjid announcements displayed in the app',
    endpoint: `${THIS_URL}/rest/v1/announcements`,
    apiKey: THIS_KEY,
    apiBase: `${THIS_URL}/rest/v1`,
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'title', type: 'text', notes: 'Announcement heading' },
      { name: 'body', type: 'text', notes: 'Nullable — full announcement text' },
      { name: 'is_active', type: 'boolean', notes: 'Visible in app' },
      { name: 'display_order', type: 'integer', notes: 'Sort order' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
  {
    name: 'adhkar_groups',
    description: 'Group metadata for the adhkar (icons, colors, badges)',
    endpoint: `${THIS_URL}/rest/v1/adhkar_groups`,
    apiKey: THIS_KEY,
    apiBase: `${THIS_URL}/rest/v1`,
    columns: [
      { name: 'id', type: 'uuid', notes: 'Primary key' },
      { name: 'name', type: 'text', notes: 'Unique group name' },
      { name: 'prayer_time', type: 'text', notes: 'Nullable — slug e.g. after-fajr' },
      { name: 'icon', type: 'text', notes: 'Emoji or icon identifier' },
      { name: 'icon_color', type: 'text', notes: 'Hex foreground colour' },
      { name: 'icon_bg_color', type: 'text', notes: 'Hex background colour' },
      { name: 'badge_text', type: 'text', notes: 'Nullable — pill label' },
      { name: 'badge_color', type: 'text', notes: 'Hex badge colour' },
      { name: 'description', type: 'text', notes: 'Nullable' },
      { name: 'display_order', type: 'integer', notes: 'Sort order' },
      { name: 'created_at', type: 'timestamptz', notes: 'Auto-set' },
      { name: 'updated_at', type: 'timestamptz', notes: 'Auto-set' },
    ],
  },
];

interface Column {
  name: string;
  type: string;
  notes: string;
}

interface TableDef {
  name: string;
  description: string;
  endpoint: string;
  apiKey: string;
  apiBase: string;
  columns: Column[];
}

interface TableStats {
  count: number | null;
  loading: boolean;
  error: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  uuid: 'bg-violet-100 text-violet-700',
  integer: 'bg-blue-100 text-blue-700',
  text: 'bg-emerald-100 text-emerald-700',
  time: 'bg-amber-100 text-amber-800',
  timestamptz: 'bg-gray-100 text-gray-600',
  boolean: 'bg-rose-100 text-rose-700',
};

// ─── Copy Button ─────────────────────────────────────────────────────────────
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={handle} className="p-1 rounded hover:bg-white/20 transition-colors" title="Copy">
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const CloudData = () => {

  const [stats, setStats] = useState<Record<string, TableStats>>({});
  const [expandedTable, setExpandedTable] = useState<string | null>('prayer_times');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStats = async () => {
    setIsRefreshing(true);
    const results: Record<string, TableStats> = {};

    await Promise.all(
      TABLES.map(async (t) => {
        results[t.name] = { count: null, loading: true, error: false };
        setStats((prev) => ({ ...prev, [t.name]: results[t.name] }));
        try {
          const res = await fetch(`${t.apiBase}/${t.name}?select=count`, {
            headers: { 'Content-Type': 'application/json', 'apikey': t.apiKey },
          });
          if (!res.ok) throw new Error();
          const data: { count: number }[] = await res.json();
          results[t.name] = { count: data[0]?.count ?? 0, loading: false, error: false };
        } catch {
          results[t.name] = { count: null, loading: false, error: true };
        }
        setStats((prev) => ({ ...prev, [t.name]: results[t.name] }));
      })
    );

    setIsRefreshing(false);
    toast.success('Database stats refreshed');
    console.log('Stats loaded:', results);
  };

  useEffect(() => {
    loadStats();
  // The 'react-hooks/exhaustive-deps' rule is an ESLint rule.
  // The error message "Definition for rule 'react-hooks/exhaustive-deps' was not found"
  // indicates that ESLint is attempting to use this rule but cannot find its definition,
  // likely due to a missing ESLint configuration or plugin (`eslint-plugin-react-hooks`).
  // Removing the `eslint-disable-next-line` comment resolves the syntax error
  // in the sense that the comment itself is not a TS syntax error, but rather an ESLint issue.
  // From a pure TypeScript syntax perspective, the code is valid even with the comment.
  // However, since the error message specifically points to the rule not being found,
  // the most direct "fix" in the context of *syntax correction* (even if the original
  // problem is ESLint config related) is to remove the non-functional ESLint directive.
  // If the ESLint setup were correct, the comment would suppress a warning, not cause an error about the rule definition.
  // For the purpose of providing a "corrected file with syntax issues resolved"
  // and given the error message, removing a non-functional ESLint directive is the
  // most appropriate action to prevent the reported error from occurring.
  }, [refreshKey]);

  const totalRows = Object.values(stats).reduce((sum, s) => sum + (s.count ?? 0), 0);

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Sidebar />

      <main className="flex-1 p-8 overflow-x-auto">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
              style={{ background: 'hsl(var(--primary))' }}
            >
              <Database size={20} style={{ color: 'hsl(var(--primary-foreground))' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                Cloud Data
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {TABLES.length} tables · {totalRows} total rows
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh Stats
          </Button>
        </div>

        {/* Connection card */}
        <div
          className="rounded-xl p-5 mb-6 shadow-sm"
          style={{ background: 'hsl(var(--primary))' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={15} className="text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  Connected · Live
                </span>
              </div>
              <p className="text-xs font-semibold mb-3" style={{ color: 'hsl(var(--primary-foreground) / 0.6)' }}>
                Database Endpoint
              </p>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                <code className="text-xs font-mono" style={{ color: 'hsl(var(--primary-foreground))' }}>
                  {BASE_URL}
                </code>
                <CopyButton text={BASE_URL} />
              </div>
            </div>
            <a
              href={`${REST_URL}/`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors whitespace-nowrap"
              style={{ color: 'hsl(var(--primary-foreground))' }}
            >
              <ExternalLink size={12} />
              Open API Docs
            </a>
          </div>

          {/* REST URL */}
          <div className="mt-3">
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--primary-foreground) / 0.6)' }}>
              REST API Base URL
            </p>
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <code className="text-xs font-mono" style={{ color: 'hsl(var(--primary-foreground))' }}>
                {REST_URL}
              </code>
              <CopyButton text={REST_URL} />
            </div>
          </div>
        </div>

        {/* Tables */}
        <div className="space-y-4">
          {TABLES.map((table) => {
            const s = stats[table.name];
            const isExpanded = expandedTable === table.name;

            return (
              <div
                key={table.name}
                className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
              >
                {/* Table header row */}
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpandedTable(isExpanded ? null : table.name)}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'hsl(var(--accent) / 0.15)' }}
                  >
                    <Table2 size={16} style={{ color: 'hsl(var(--accent))' }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-bold font-mono" style={{ color: 'hsl(var(--foreground))' }}>
                        {table.name}
                      </code>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {table.columns.length} columns
                      </Badge>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {table.description}
                    </p>
                  </div>

                  {/* Row count */}
                  <div className="text-right shrink-0">
                    {s?.loading ? (
                      <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
                    ) : s?.error ? (
                      <span className="text-xs text-destructive">Error</span>
                    ) : (
                      <span className="text-xl font-bold tabular-nums" style={{ color: 'hsl(var(--accent))' }}>
                        {s?.count?.toLocaleString() ?? '—'}
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground">rows</p>
                  </div>

                  <div className="text-muted-foreground ml-1 text-xs shrink-0">
                    {isExpanded ? '▲' : '▼'}
                  </div>
                </button>

                {/* Expanded column schema */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* REST endpoint */}
                    <div className="px-5 py-3 border-b border-border" style={{ background: 'hsl(var(--muted) / 0.4)' }}>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">REST Endpoint</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono" style={{ color: 'hsl(var(--foreground))' }}>
                          {table.endpoint}
                        </code>
                        <CopyButton text={table.endpoint} />
                      </div>
                    </div>

                    {/* Column table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border" style={{ background: 'hsl(var(--muted) / 0.3)' }}>
                          <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground">Column</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Type</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map((col, idx) => (
                          <tr
                            key={col.name}
                            className="border-b border-border last:border-0 transition-colors hover:bg-secondary/20"
                            style={{ background: idx % 2 === 0 ? 'transparent' : 'hsl(var(--muted) / 0.15)' }}
                          >
                            <td className="px-5 py-2.5">
                              <code className="text-xs font-mono font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                {col.name}
                              </code>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${TYPE_COLORS[col.type] ?? 'bg-gray-100 text-gray-600'}`}>
                                {col.type}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {col.notes || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default CloudData;
