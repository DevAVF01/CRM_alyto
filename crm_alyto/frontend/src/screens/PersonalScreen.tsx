import { useState } from 'react';
import { crm, mensajeDeError } from '../api/client';
import { useLectura } from '../components/Aviso';
import { Badge, Icon, etiqueta, formatoDiaHora } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import type { PersonalRow } from '../types';

// Cuentas del personal (F-03). El administrador ve a cada persona del equipo con su rol y su
// estado, y decide: acepta a quien pidio entrada (le asigna el rol y activa la cuenta) o deja
// la cuenta pendiente/suspendida. Cada decision escribe su asiento en el registro. Nadie se
// cambia su propia cuenta desde aqui: el backend lo rechaza, porque el ultimo administrador
// no puede pisarse la rama el solo.

const ROLES: { valor: string; texto: string }[] = [
  { valor: 'soporte', texto: etiqueta('soporte') },
  { valor: 'ventas', texto: etiqueta('ventas') },
  { valor: 'operaciones', texto: etiqueta('operaciones') },
  { valor: 'compliance', texto: etiqueta('compliance') },
  { valor: 'admin', texto: etiqueta('admin') },
];

interface FilaProps {
  fila: PersonalRow;
  propia: boolean;
  recargar: () => Promise<void>;
}

function FilaPersonal({ fila, propia, recargar }: FilaProps) {
  const [rol, setRol] = useState(fila.role);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const pedir = async (cuerpo: { role?: string; is_active?: boolean }) => {
    if (trabajando) return;
    setTrabajando(true);
    setAviso(null);
    try {
      await crm.cambiarPersonal(fila.id, cuerpo);
      await recargar();
    } catch (err) {
      setAviso(mensajeDeError(err));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <tr>
      <td>
        <strong>{fila.display_name ?? fila.email}</strong>
        <p className="small muted mono">{fila.email}</p>
        {propia ? <p className="small muted">(su propia cuenta: se gestiona desde otro perfil admin)</p> : null}
      </td>
      <td>
        <Badge tone={fila.is_active ? 'success' : 'warning'}>
          {fila.is_active ? 'Activa' : 'Pendiente'}
        </Badge>
        <p className="small muted">creada {formatoDiaHora(fila.created_at)}</p>
      </td>
      <td>
        {propia ? (
          <span className="mono">{etiqueta(fila.role)}</span>
        ) : (
          <>
            <select
              className="input input--sm"
              value={rol}
              onChange={(event) => setRol(event.target.value)}
              aria-label={`Rol de ${fila.email}`}
            >
              {ROLES.map((r) => (
                <option key={r.valor} value={r.valor}>{r.texto}</option>
              ))}
            </select>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={trabajando || rol === fila.role}
              onClick={() => void pedir({ role: rol })}
            >
              <Icon name="check" size={14} /> Guardar rol
            </button>
          </>
        )}
      </td>
      <td>
        {propia ? null : fila.is_active ? (
          <button
            className="btn btn--danger btn--sm"
            type="button"
            disabled={trabajando}
            onClick={() => void pedir({ is_active: false })}
          >
            <Icon name="pause" size={14} /> Suspender
          </button>
        ) : (
          <button
            className="btn btn--navy btn--sm"
            type="button"
            disabled={trabajando}
            onClick={() => void pedir({ is_active: true })}
          >
            <Icon name="check" size={14} /> Aceptar cuenta
          </button>
        )}
        {aviso ? <p className="small" style={{ color: 'var(--color-danger)' }}>{aviso}</p> : null}
      </td>
    </tr>
  );
}

export default function PersonalScreen() {
  const { user } = useAuth();
  const { filas, aviso, recargar } = useLectura(
    () => crm.personal(),
    [],
    'Aun no hay cuentas en el CRM. Se ven aqui cuando alguien solicita la suya desde la pantalla de entrada.',
  );

  return (
    <section className="pantalla">
      <header className="pantalla__head">
        <div>
          <h2>Cuentas del personal</h2>
          <p className="small muted">
            Las cuentas pendientes llegan desde la solicitud propia de la pantalla de entrada.
            Aceptar asigna el rol de la columna Rol y activa la cuenta. Cada decision queda en el
            registro.
          </p>
        </div>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => void recargar()}>
          <Icon name="refresh" size={14} /> Refrescar
        </button>
      </header>

      {aviso ?? null}

      <div className="card">
        <table className="tabla">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Estado</th>
              <th>Rol</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <FilaPersonal key={fila.id} fila={fila} propia={fila.id === user?.id} recargar={recargar} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
