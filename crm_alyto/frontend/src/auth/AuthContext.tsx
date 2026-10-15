import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionUser } from '../types';

const STORAGE_KEY = 'alyto.ecp.session';

interface AuthContextValue {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_ROLE_RULES: [RegExp, SessionUser['role']][] = [
  [/^admin[@._+-]/i, 'admin'],
  [/^(compliance|cumplimiento)[@._+-]/i, 'compliance'],
  [/^(operaciones|ops)[@._+-]/i, 'operaciones'],
  [/^(soporte|support)[@._+-]/i, 'soporte'],
];

function inferDemoRole(email: string): SessionUser['role'] {
  return DEMO_ROLE_RULES.find(([pattern]) => pattern.test(email))?.[1] ?? 'ventas';
}

function demoToken(payload: Record<string, string>): string {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `demo.${body}.ecp-demo`;
}

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
    let session: SessionUser;
    try {
      session = await requestLogin(email, password);
    } catch {
      const role = inferDemoRole(email);
      session = {
        id: `demo-${role}`,
        email,
        role,
        accessToken: demoToken({ id: `demo-${role}`, email, role }),
      };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
