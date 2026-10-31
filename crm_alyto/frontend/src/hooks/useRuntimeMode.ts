import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { HealthInfo } from '../types';

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

// El estado se lee del backend, no de si la red respondio: un backend mal configurado responde
// perfecto y por eso la red nunca es una señal suficiente.
//
// La pregunta que importa en el CRM es una sola: lo que la pantalla esta mostrando, salio de la
// base de Supabase con la sesion del usuario o no. Por eso el estado se arma con dataLayer, que es
// el campo que dice si la lectura por fila esta montada, y no con demoMode a secas: puede haber
// DEMO_MODE=true con la base montada, y ahi las pantallas del CRM leen filas reales.
function toMode(health: HealthInfo | null): Pick<RuntimeMode, 'tone' | 'label' | 'detail' | 'demo' | 'reachable'> {
  if (!health || !health.runtime) {
    return { tone: 'alerta', label: 'Sin conexión con el backend', detail: 'La API de salud no respondió', demo: false, reachable: false };
  }
  const { demoMode, supabaseConfigured, authLayer, dataLayer, scopedRead } = health.runtime;
  const detail = `${authLayer} · ${dataLayer}`;
  if (scopedRead && dataLayer.startsWith('supabase')) {
    return {
      tone: 'real',
      label: demoMode ? 'Leyendo la base, almacén demo abierto' : 'Leyendo la base',
      detail,
      demo: demoMode,
      reachable: true,
    };
  }
  if (demoMode) {
    return { tone: 'demo', label: 'Datos de demostración', detail, demo: true, reachable: true };
  }
  if (!supabaseConfigured) {
    return { tone: 'alerta', label: 'Sin base de datos configurada', detail, demo: false, reachable: true };
  }
  return { tone: 'alerta', label: 'Capa de datos pendiente', detail, demo: false, reachable: true };
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
