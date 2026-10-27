/**
 * Middleware para auditoría léxica en tiempo de ejecución
 * Garantiza cumplimiento de directrices de marca y normativa ASFI / ECP
 *
 * El diccionario vive en la tabla blocked_terms, no acá. La lista de abajo es el respaldo que
 * se usa cuando no hay base conectada (modo demostración, pruebas unitarias): mientras el CRM
 * corra sin Supabase el guardarraíl tiene que seguir activo, si no la protección dependería de
 * que alguien ya haya aplicado las migraciones.
 *
 * Severidades, iguales que en la base:
 *   bloqueo     -> el texto se rechaza.
 *   advertencia -> pasa, y el mensaje queda visible en vw_messages_flagged para Cumplimiento.
 */

import { supabase } from '../config/supabase.js';

const FALLBACK_RULES = [
  { term: 'remesas', error: "Uso no permitido de 'remesas'. Utilizar 'transferencias internacionales'." },
  { term: 'non-custodial', error: "Uso no permitido de 'non-custodial'. Utilizar 'custodia institucional' o 'wallets custodiales'." },
  { term: 'tenemos licencia', error: "Uso no permitido de 'tenemos licencia'. La entidad opera en el ECP bajo supervisión de ASFI." },
  { term: 'somos los únicos', error: "Uso no permitido de 'somos los únicos'. No se realizan comparaciones de exclusividad en el ECP." },
];

// El guion largo no es un termino del glosario sino una regla de interfaz, y no tiene fila en
// blocked_terms: se comprueba siempre, con base conectada o sin ella.
const INTERFACE_PATTERNS = [
  { regex: /—/, error: 'Uso no permitido del guion largo (U+2014) en textos de interfaz y comunicaciones.' },
];

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;

// Exportada porque es la parte del linter que se puede probar sin base conectada: recibe filas
// con la forma de blocked_terms y decide cuales bloquean.
export function rulesFromDatabase(rows) {
  return rows
    .filter((row) => row.severity === 'bloqueo')
    .map((row) => ({
      term: row.term,
      error: `Uso no permitido de '${row.term}'. Utilizar '${row.suggestion}'. ${row.reason}`,
    }));
}

async function activeRules() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.rules;

  if (!supabase) {
    cache = { rules: FALLBACK_RULES, fetchedAt: Date.now() };
    return cache.rules;
  }

  // Lectura con la llave de servicio: blocked_terms está cerrada a la interfaz a propósito,
  // descubrir el diccionario por fuerza bruta no puede ser posible desde el navegador.
  const { data, error } = await supabase
    .from('blocked_terms')
    .select('term, severity, suggestion, reason')
    .eq('is_active', true);

  // Sin diccionario en la base (migraciones recién aplicadas, seed pendiente) manda el respaldo,
  // que es mas estrecho pero no deja el guardarrail apagado.
  const rules = error || !Array.isArray(data) || data.length === 0
    ? FALLBACK_RULES
    : rulesFromDatabase(data);

  cache = { rules, fetchedAt: Date.now() };
  return rules;
}

export function resetBrandLinterCache() {
  cache = null;
}

export async function brandLinterMiddleware(req, res, next) {
  try {
    if (!req.body || typeof req.body !== 'object') return next();

    const stringified = JSON.stringify(req.body);
    const lowered = stringified.toLowerCase();

    for (const rule of await activeRules()) {
      if (lowered.includes(rule.term.toLowerCase())) {
        return res.status(400).json({
          error: 'Infracción de directrices institucionales de marca y ECP ASFI',
          detail: rule.error,
        });
      }
    }

    for (const rule of INTERFACE_PATTERNS) {
      if (rule.regex.test(stringified)) {
        return res.status(400).json({
          error: 'Infracción de directrices institucionales de marca y ECP ASFI',
          detail: rule.error,
        });
      }
    }

    return next();
  } catch (err) {
    return next(err);
  }
}
