import { useState } from 'react';
import { Link } from 'react-router-dom';
import { crm } from '../api/client';
import { useLectura } from '../components/Aviso';
import { Badge, etiqueta } from '../components/ui';
import type { BadgeTone } from '../components/ui';
import type { LegajoRow, RequisitoRow, TipoCuenta } from '../types';

// Legajo: cuánto va aprobado de cada cuenta y qué se exige. Los números no los calcula la pantalla:
// salen de vw_compliance_progress, que cuenta las casillas que la base mantiene por su disparador.
// Revisar una casilla se hace en la ficha de la cuenta, que es donde está el par (cuenta, requisito)
// con el que la base identifica la fila.

const TIPOS: TipoCuenta[] = ['persona_natural', 'persona_juridica'];

function tonePorcentaje(pct: number): BadgeTone {
  if (pct >= 100) return 'success';
  if (pct >= 60) return 'accent';
  if (pct > 0) return 'warning';
  return 'danger';
}

export default function LegajoScreen() {
  const [tipo, setTipo] = useState('');
  const lectura = useLectura<LegajoRow>(
    () => crm.legajo({ tipo: tipo || undefined }),
    [tipo],
    'Ninguna cuenta con legajo medible para este rol.',
  );
  const requisitos = useLectura<RequisitoRow>(() => crm.requisitos(), [], 'La tabla de requisitos está vacía.');

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · DEBIDA DILIGENCIA</p>
          <h1 className="page-head__title">Legajo</h1>
          <p className="page-head__sub">
            Avance de las casillas de requisitos por cuenta. Un legajo completo es el que autoriza a seguir operando
            dentro del ECP.
          </p>
        </div>
      </div>

      <div className="filtros row">
        <label className="field field--inline">
          <span className="field__label">Tipo de cuenta</span>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todas</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {etiqueta(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lectura.aviso ? lectura.aviso : null}
      {lectura.filas.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th>Avance</th>
                <th>Aprobadas</th>
                <th>En revisión</th>
                <th>Observadas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lectura.filas.map((l) => (
                <tr key={l.client_id}>
                  <td>{l.cliente}</td>
                  <td>{etiqueta(l.account_type)}</td>
                  <td style={{ minWidth: 140 }}>
                    <div className="progress">
                      <div
                        className={`progress__fill${l.porcentaje_aprobado >= 100 ? ' progress__fill--success' : ''}`}
                        style={{ width: `${Math.min(100, Number(l.porcentaje_aprobado))}%` }}
                      />
                    </div>
                    <Badge tone={tonePorcentaje(Number(l.porcentaje_aprobado))}>
                      {Number(l.porcentaje_aprobado).toFixed(0)}%
                    </Badge>
                  </td>
                  <td className="table__num">
                    {l.aprobadas} de {l.casillas}
                  </td>
                  <td className="table__num">{l.en_revision}</td>
                  <td className="table__num">
                    {l.observadas + l.rechazadas > 0 ? (
                      <Badge tone="danger">{l.observadas + l.rechazadas}</Badge>
                    ) : (
                      0
                    )}
                  </td>
                  <td>
                    <Link className="enlace" to={`/cuentas/${l.client_id}`}>
                      Revisar casillas
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="section">
        {requisitos.aviso ? (
          requisitos.aviso
        ) : (
          <section className="card">
            <h2 className="card__title">Qué exige cada requisito</h2>
            {requisitos.filas.map((r) => (
              <div className="check-item" key={r.code}>
                <div className="row row--between">
                  <span className="check-item__num mono">{r.code}</span>
                  <Badge tone={r.document_required ? 'warning' : 'neutral'}>
                    {r.document_required ? 'pide documento' : 'no pide documento'}
                  </Badge>
                </div>
                <p className="check-item__label">{r.label}</p>
                <p className="check-item__detail">
                  {r.description ?? 'sin descripción'} · aplica a {r.applies_to.map((t) => etiqueta(t)).join(', ')}
                </p>
              </div>
            ))}
            <p className="small muted mt-8">
              Un requisito que pide documento no se puede aprobar sin un documento aprobado en esa misma casilla. El
              guarda está en la base, no en la pantalla.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
