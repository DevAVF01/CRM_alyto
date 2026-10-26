import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionUser } from '../types';

const STORAGE_KEY = 'alyto.ecp.session';

interface AuthContextValue {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.email || !parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function requestLogin(email: string, password: string): Promise<SessionUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    data?: {
      token?: string;
      user?: { id?: string; email?: string; role?: SessionUser['role'] };
    };
    error?: { message?: string };
  };
  const session = data?.data;
  if (!response.ok || !session?.user || !session?.token) {
    throw new Error(data.error?.message ?? 'No fue posible iniciar sesión. Verifique sus credenciales.');
  }
  return {
    id: session.user.id ?? 'user',
    email: session.user.email ?? email,
    role: session.user.role ?? 'ventas',
    accessToken: session.token,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => loadSession());

  const login = useCallback(async (email: string, password: string) => {
    const session = await requestLogin(email, password);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  // Una sesion guardada en el navegador puede traer un token de una version anterior del
  // backend. Se valida contra /auth/me y ante 401 se descarta en lugar de dejarla pasar.
  useEffect(() => {
    const accessToken = user?.accessToken;
    if (!accessToken) return;
    let activo = true;
    void fetch('/api/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((response) => {
        if (activo && response.status === 401) {
          localStorage.removeItem(STORAGE_KEY);
          setUser(null);
        }
      })
      .catch(() => undefined);
    return () => {
      activo = false;
    };
  }, [user?.accessToken]);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
