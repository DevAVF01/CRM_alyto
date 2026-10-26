import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useRuntimeMode } from '../hooks/useRuntimeMode';
import type { RuntimeMode } from '../hooks/useRuntimeMode';

const RuntimeContext = createContext<RuntimeMode | null>(null);

// Un solo sondeo a /api/health para toda la interfaz: cada pantalla lee el modo del contexto.
export function RuntimeProvider({ children }: { children: ReactNode }) {
  const value = useRuntimeMode();
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeMode {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error('useRuntime debe usarse dentro de RuntimeProvider');
  return ctx;
}
