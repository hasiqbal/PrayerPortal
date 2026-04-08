/**
 * Authentication hook + context
 *
 * Features:
 * - Local session persisted in localStorage
 * - 30-minute inactivity timeout with a 2-minute warning toast
 * - Auto-resets on any user interaction (mouse, keyboard, touch)
 */

import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalUser {
  username: string;
}

interface AuthState {
  user: LocalUser | null;
  loading: boolean;
  localLogin: (username: string) => void;
  signOut: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY      = 'jmn_admin_session';
const SESSION_TS_KEY   = 'jmn_admin_last_active';
const TIMEOUT_MS       = 30 * 60 * 1000;   // 30 minutes
const WARNING_BEFORE   =  2 * 60 * 1000;   // warn 2 minutes before
const CHECK_INTERVAL   = 30 * 1000;         // check every 30 seconds

// ─── Context ──────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: false,
  localLogin: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ─── useAuthState (used once in App.tsx as the provider) ─────────────────────

export function useAuthState(): AuthState {
  const [user, setUser]       = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const warningToastId        = useRef<string | number | null>(null);
  const signOutRef            = useRef<() => Promise<void>>();

  // ── Core sign-out ─────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TS_KEY);
    if (warningToastId.current !== null) {
      toast.dismiss(warningToastId.current);
      warningToastId.current = null;
    }
  }, []);

  // Keep the ref up to date so the interval closure always has the latest version
  signOutRef.current = signOut;

  // ── Timestamp helpers ─────────────────────────────────────────────────────
  const touchActivity = useCallback(() => {
    localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
    // Dismiss any active warning when the user is active again
    if (warningToastId.current !== null) {
      toast.dismiss(warningToastId.current);
      warningToastId.current = null;
    }
  }, []);

  const getLastActive = (): number => {
    const ts = localStorage.getItem(SESSION_TS_KEY);
    return ts ? parseInt(ts, 10) : Date.now();
  };

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed: LocalUser = JSON.parse(stored);
        // Check if the stored session is already expired
        const idle = Date.now() - getLastActive();
        if (idle < TIMEOUT_MS) {
          setUser(parsed);
        } else {
          // Session expired while the tab was closed — clear it silently
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(SESSION_TS_KEY);
        }
      }
    } catch {
      // Corrupt storage — clear it
      localStorage.removeItem(SESSION_KEY);
    }
    setLoading(false);
  }, []);

  // ── Activity listeners → reset inactivity timer ───────────────────────────
  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => touchActivity();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    touchActivity(); // stamp on login

    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [user, touchActivity]);

  // ── Inactivity checker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const idle = Date.now() - getLastActive();
      const remaining = TIMEOUT_MS - idle;

      if (remaining <= 0) {
        // Time's up — sign out
        clearInterval(interval);
        toast.error('Session expired due to inactivity. Please sign in again.', { duration: 5000 });
        signOutRef.current?.();
        return;
      }

      if (remaining <= WARNING_BEFORE && warningToastId.current === null) {
        // Show 2-minute warning once
        warningToastId.current = toast.warning(
          'You will be signed out in 2 minutes due to inactivity.',
          {
            duration: WARNING_BEFORE,
            id: 'session-warning',
            action: {
              label: 'Stay signed in',
              onClick: () => touchActivity(),
            },
          }
        );
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [user, touchActivity]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const localLogin = useCallback((username: string) => {
    const u: LocalUser = { username };
    setUser(u);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    touchActivity();
  }, [touchActivity]);

  return { user, loading, localLogin, signOut };
}
