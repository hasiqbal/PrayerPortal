import { useState, useEffect, createContext, useContext } from 'react';

interface LocalUser {
  username: string;
}

interface AuthState {
  user: LocalUser | null;
  loading: boolean;
  localLogin: (username: string) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: false,
  localLogin: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const SESSION_KEY = 'jmn_admin_session';

export function useAuthState(): AuthState {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const localLogin = (username: string) => {
    const u: LocalUser = { username };
    setUser(u);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
  };

  const signOut = async () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  return { user, loading, localLogin, signOut };
}
