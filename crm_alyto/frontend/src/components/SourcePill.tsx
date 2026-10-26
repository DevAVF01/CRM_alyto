import { useRuntime } from '../runtime/RuntimeProvider';
import type { RuntimeTone } from '../hooks/useRuntimeMode';

export function SourcePill({ live, liveLabel }: { live: boolean; liveLabel: string }) {
  const runtime = useRuntime();

  let tone: RuntimeTone = 'real';
  let label = liveLabel;
  if (!live) {
    tone = 'alerta';
    label = 'Sin respuesta del backend';
  } else if (runtime.demo) {
    tone = 'demo';
    label = 'Datos de demostración';
  }

  return (
    <span className={`source-pill source-pill--${tone}`} title={`${label}. ${runtime.detail}`}>
      <span className="source-pill__dot" />
      {label}
    </span>
  );
}
