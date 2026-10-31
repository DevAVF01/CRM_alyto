import type { ReactNode } from 'react';
import { useApiData } from '../hooks/useApiData';
import { Icon } from './ui';
import type { IconName } from './ui';

// Un solo aviso para las siete pantallas del CRM. Es importante que sea uno solo: el criterio de
// Álvaro es que una lectura que no salió se vea como lo que es, no como una pantalla con ceros ni
// con datos de relleno. Por eso aqui no hay fallback con cifras: hay cargo, rechazo o vacio.
export function Aviso({
  tipo,
  texto,
  accion,
}: {
  tipo: 'cargando' | 'vacio' | 'rechazo';
  texto: string;
  accion?: ReactNode;
}) {
  const icono: IconName = tipo === 'cargando' ? 'refresh' : tipo === 'rechazo' ? 'warning' : 'check';
  return (
    <div className={`card aviso aviso--${tipo}`} role={tipo === 'rechazo' ? 'alert' : 'status'}>
      <span className="aviso__icon">
        <Icon name={icono} size={18} />
      </span>
      <span className="aviso__texto">{texto}</span>
      {accion}
    </div>
  );
}

interface Lectura<T> {
  filas: T[];
  cargando: boolean;
  error: string | null;
  aviso: ReactNode;
  recargar: () => Promise<void>;
}

// useLectura es la forma corta de pedir una lista al puente /crm. El texto del vacio se pasa porque
// "sin filas" significa cosas distintas según la pantalla: en la bandeja es trabajo al día, en el
// registro es que nadie tocó nada.
export function useLectura<T>(
  leer: () => Promise<T[]>,
  dependencias: unknown[],
  textoVacio: string,
): Lectura<T> {
  const { data, loading, error, reload } = useApiData<T[]>(leer, [], dependencias);

  let aviso: ReactNode = null;
  if (loading && !data.length) {
    aviso = <Aviso tipo="cargando" texto="Leyendo la base..." />;
  } else if (error) {
    aviso = (
      <Aviso
        tipo="rechazo"
        texto={error}
        accion={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
            <Icon name="refresh" size={14} /> Reintentar
          </button>
        }
      />
    );
  } else if (!data.length) {
    aviso = <Aviso tipo="vacio" texto={textoVacio} />;
  }

  return { filas: data, cargando: loading, error, aviso, recargar: reload };
}
