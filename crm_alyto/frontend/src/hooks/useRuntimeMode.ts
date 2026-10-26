import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { HealthInfo } from '../api/client';

export type RuntimeTone = 'real' | 'demo' | 'alerta';

export interface RuntimeMode {
  tone: RuntimeTone;
  label: string;
  detail: string;
  demo: boolean;
  reachable: boolean;
  loading: boolean;
  reload: () => Promise<void>;
}

// El estado se lee del backend, no de si la red respondio: un backend en modo demostracion
// responde perfecto y por eso la red nunca es una señal suficiente.
function toMode(health: HealthInfo | null): Pick<RuntimeMode, 'tone' | 'label' | 'detail' | 'demo' | 'reachable'> {
  if (!health || !health.runtime) {
    return { tone: 'alerta', label: 'Sin conexión con el backend', detail: 'La API de salud no respondió', demo: false, reachable: false };
  }
  const { demoMode, supabaseConfigured, authLayer, dataLayer } = health.runtime;
  const detail = `${authLayer} · ${dataLayer}`;
  if (demoMode) {
    return { tone: 'demo', label: 'Datos de demostración', detail, demo: true, reachable: true };
  }
  if (!supabaseConfigured) {
    return { tone: 'alerta', label: 'Sin base de datos configurada', detail, demo: false, reachable: true };
  }
  if (dataLayer !== 'supabase') {
    return { tone: 'alerta', label: 'Capa de datos pendiente', detail, demo: false, reachable: true };
  }
  return { tone: 'real', label: 'Datos reales', detail, demo: false, reachable: true };
}

export function useRuntimeMode(): RuntimeMode {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await api.meta.health());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...toMode(health), loading, reload };
}
