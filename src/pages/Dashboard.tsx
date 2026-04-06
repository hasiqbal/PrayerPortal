import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import { fetchPrayerTimes, fetchAdhkar, fetchAnnouncements, fetchAdhkarGroups } from '@/lib/api';
import { CalendarDays, BookOpen, Bell, Clock, ChevronRight, Moon } from 'lucide-react';

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Crescent SVG for decorative use
const CrescentStar = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-10">
    <path d="M60 10C38.5 10 21 27.5 21 49C21 70.5 38.5 88 60 88C68.4 88 76.1 85.3 82.1 80.5C76.8 81.6 71.2 81 65.9 78.2C52.7 71.5 46.8 55.9 53.5 42.7C57.2 35.7 63.9 30.8 71.4 29.1C76.4 27.9 81.8 28.1 86.6 29.6C80.2 22.5 70.6 18 60 18Z" fill="white"/>
    <path d="M93 24L95.7 32.4L104.4 32.4L97.5 37.2L100.2 45.6L93 40.8L85.8 45.6L88.5 37.2L81.6 32.4L90.3 32.4Z" fill="white"/>
  </svg>
);

// Stat card component
const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
  to,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  to: string;
  color: string;
}) => (
  <Link
    to={to}
    className="group relative bg-card rounded-2xl border border-border p-5 hover:shadow-md hover:border-primary/30 transition-all duration-200 overflow-hidden flex flex-col gap-3"
  >
    {/* Subtle tint */}
    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${color}`} />

    <div className="relative flex items-start justify-between">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} bg-opacity-100`}>
        <Icon size={18} style={{ color: 'hsl(var(--primary))' }} />
      </div>
      <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
    </div>

    <div className="relative">
      <div className="text-3xl font-extrabold tabular-nums" style={{ color: 'hsl(var(--foreground))' }}>
        {value}
      </div>
      <div className="text-sm font-semibold mt-0.5" style={{ color: 'hsl(var(--foreground))' }}>{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  </Link>
);

// Today's prayer times quick view
const TodayPrayers = ({ data }: { data: { label: string; time: string | null; color: string }[] }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
    {data.map(({ label, time, color }) => (
      <div key={label} className="bg-card rounded-xl border border-border px-3 py-2.5 text-center hover:shadow-sm transition-all">
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</p>
        <p className="text-base font-extrabold tabular-nums mt-0.5" style={{ color: time ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
          {time ?? '—'}
        </p>
      </div>
    ))}
  </div>
);

const Dashboard = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const { data: prayerTimes = [] } = useQuery({
    queryKey: ['prayer_times', month],
    queryFn: () => fetchPrayerTimes(month),
    staleTime: 300_000,
  });

  const { data: adhkar = [] } = useQuery({
    queryKey: ['adhkar'],
    queryFn: () => fetchAdhkar(),
    staleTime: 300_000,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    staleTime: 300_000,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['adhkar-groups'],
    queryFn: fetchAdhkarGroups,
    staleTime: 300_000,
  });

  const todayRow = prayerTimes.find((r) => r.day === day);

  const todayPrayers = [
    { label: 'Fajr',    time: todayRow?.fajr    ?? null, color: '#2563eb' },
    { label: 'Sunrise', time: todayRow?.sunrise  ?? null, color: '#0369a1' },
    { label: 'Zuhr',    time: todayRow?.zuhr     ?? null, color: '#7c6d00' },
    { label: 'Asr',     time: todayRow?.asr      ?? null, color: '#16a34a' },
    { label: 'Maghrib', time: todayRow?.maghrib   ?? null, color: '#b91c1c' },
    { label: 'Isha',    time: todayRow?.isha      ?? null, color: '#7c3aed' },
  ];

  const activeAnnouncements = announcements.filter((a) => a.is_active);
  const activeAdhkar = adhkar.filter((a) => a.is_active);

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Sidebar />

      <main className="flex-1 min-w-0 pt-14 md:pt-0 overflow-x-hidden">

        {/* ── Hero Banner ── */}
        <div
          className="relative overflow-hidden px-6 sm:px-10 pt-8 sm:pt-10 pb-8 sm:pb-10"
          style={{ background: 'hsl(var(--sidebar-background))' }}
        >
          {/* Decorative crescent */}
          <div className="absolute right-6 top-0 pointer-events-none select-none">
            <CrescentStar />
          </div>
          <div className="absolute right-24 bottom-0 pointer-events-none select-none opacity-5">
            <CrescentStar />
          </div>

          {/* Geometric line accent */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[hsl(40_55%_46%)] to-transparent opacity-40" />

          <div className="relative max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(40_55%_52%)] mb-2">
              Bismillah ir-Rahman ir-Rahim
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-1">
              Jami' Masjid Noorani
            </h1>
            <p className="text-sm text-[hsl(120_20%_65%)] mb-5">
              Admin Management Portal — {MONTHS_FULL[now.getMonth()]} {now.getFullYear()}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/prayer-times"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                <CalendarDays size={14} />
                View Prayer Times
              </Link>
              <Link
                to="/adhkar"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all"
                style={{ borderColor: 'hsl(var(--sidebar-border))', color: 'hsl(var(--sidebar-accent-foreground))', background: 'hsl(var(--sidebar-accent))' }}
              >
                <BookOpen size={14} />
                Manage Adhkar
              </Link>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 space-y-8">

          {/* ── Today's Prayer Times ── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Clock size={15} style={{ color: 'hsl(var(--primary))' }} />
                <h2 className="text-sm font-bold text-foreground">
                  Today's Prayer Times
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <div className="flex-1 section-divider" />
              <Link to="/prayer-times" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                Edit <ChevronRight size={11} />
              </Link>
            </div>

            {todayRow ? (
              <TodayPrayers data={todayPrayers} />
            ) : (
              <div className="bg-card border border-dashed border-border rounded-xl px-5 py-4 text-sm text-muted-foreground text-center">
                No prayer times found for today. <Link to="/prayer-times" className="text-primary hover:underline font-medium">Add them →</Link>
              </div>
            )}
          </section>

          {/* ── Stats ── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-bold text-foreground">Overview</h2>
              <div className="flex-1 section-divider" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                icon={CalendarDays}
                label="Prayer Days Loaded"
                value={prayerTimes.length}
                sub={`${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`}
                to="/prayer-times"
                color="bg-green-50"
              />
              <StatCard
                icon={BookOpen}
                label="Active Adhkar"
                value={activeAdhkar.length}
                sub={`${adhkar.length} total · ${groups.length} groups`}
                to="/adhkar"
                color="bg-emerald-50"
              />
              <StatCard
                icon={Bell}
                label="Live Announcements"
                value={activeAnnouncements.length}
                sub={`${announcements.length} total`}
                to="/announcements"
                color="bg-green-50"
              />
              <StatCard
                icon={Moon}
                label="Adhkar Groups"
                value={groups.length}
                sub={`${adhkar.length} entries across groups`}
                to="/adhkar"
                color="bg-emerald-50"
              />
            </div>
          </section>

          {/* ── Latest Announcements ── */}
          {announcements.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Bell size={15} style={{ color: 'hsl(var(--primary))' }} />
                  <h2 className="text-sm font-bold text-foreground">Latest Announcements</h2>
                </div>
                <div className="flex-1 section-divider" />
                <Link to="/announcements" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                  Manage <ChevronRight size={11} />
                </Link>
              </div>
              <div className="space-y-2 max-w-3xl">
                {announcements.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className={`bg-card rounded-xl border px-4 py-3 flex items-start gap-3 ${
                      a.is_active ? 'border-border' : 'border-dashed border-border/50 opacity-60'
                    }`}
                  >
                    <div className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${a.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{a.title}</p>
                      {a.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.body}</p>}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {a.is_active ? 'LIVE' : 'OFF'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Quick Links ── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-bold text-foreground">Quick Actions</h2>
              <div className="flex-1 section-divider" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { to: '/prayer-times', label: 'Import Prayer Times CSV', icon: CalendarDays },
                { to: '/adhkar', label: 'Add New Dhikr Entry', icon: BookOpen },
                { to: '/announcements', label: 'Post Announcement', icon: Bell },
              ].map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <Icon size={14} style={{ color: 'hsl(var(--primary))' }} />
                  {label}
                </Link>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default Dashboard;
