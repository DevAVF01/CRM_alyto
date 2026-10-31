import { clientForToken, isScopedReadConfigured } from '../config/supabase.js';

// Panel de metricas operativas (F-34). Cuatro numeros de trafico que el administrador abre al
// empezar el dia, uno por vista viva de medicion:
//
//   1. Nivel de servicio: conversaciones que ya pasaron las 2 horas habiles de la base (vista
//      vw_conversations_sla). Cualquier vencida es rojo: el plazo no negocia.
//   2. Legajo: casillas sin aprobar, sumadas sobre todas las cuentas (vw_compliance_progress).
//      Rojo cuando alguna cuenta tiene casillas Observadas o Rechazadas (muerto para V-02);
//      ambar cuando solo faltan aprobaciones todavia; verde con todas las cuentas al 100%.
//   3. Banderas: mensajes que el filtro de marca dejo pasar con severidad advertencia
//      (vw_messages_flagged). La severidad bloqueo no se ve nunca aca porque no se deja escribir.
//      Con 3 o mas advertencias el tono sube a rojo; entre 1 y 2 ambar.
//   4. Reclamos: abiertos por estatuto (todo lo que no es respondido ni cerrado, estados vivos
//      en claim_status). Rojo si hay vencidos; ambar si hay abiertos sin plazo definido (el plazo
//      legal sigue sin dato confirmado: la carta ya estaba en el capitulo de decisiones);
//      verde si no queda ninguno abierto.
//
// La lectura va con el token del administrador, nunca con la llave de servicio: lo que el panel
// dice es exactamente lo que la base deja ver. Y los cuatro clasificadores son funciones puras
// exportadas para que los test unitarios no necesiten base.

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  err.code = code ?? 'BAD_REQUEST';
  return err;
}

function tokenDeSesion(req) {
  const header = req?.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

// --------------------------------------------------------------------- clasificadores puros

export function clasificarSla(filas) {
  const vencidas = (filas ?? []).filter((f) => f.vencida);
  return {
    numero: vencidas.length,
    tono: vencidas.length >= 1 ? 'rojo' : 'verde',
    frase: vencidas.length
      ? `Conversaciones ya fuera del plazo de dos horas: hay que atenderlas ahora.`
      : 'Ninguna conversacion paso el plazo de dos horas.',
  };
}

export function clasificarLegajo(filas) {
  const filasLegajo = filas ?? [];
  const sinAprobar = filasLegajo.reduce((suma, f) => suma + Math.max(0, f.casillas - f.aprobadas), 0);
  const incompletas = filasLegajo.filter((f) => f.aprobadas < f.casillas);
  const traba = incompletas.filter((f) => f.observadas + f.rechazadas > 0);
  return {
    numero: sinAprobar,
    tono: traba.length >= 1 ? 'rojo' : incompletas.length >= 1 ? 'ambar' : 'verde',
    frase: sinAprobar === 0 && filasLegajo.length > 0
      ? 'Todas las cuentas tienen su legajo aprobado.'
      : `Casillas sin aprobar en ${incompletas.length} cuenta(s)` +
        (traba.length ? `, con observadas o rechazadas en ${traba.length}` : ''),
  };
}

export function clasificarBanderas(filas) {
  const numero = (filas ?? []).length;
  return {
    numero,
    tono: numero >= 3 ? 'rojo' : numero >= 1 ? 'ambar' : 'verde',
    frase: numero === 0
      ? 'Ningun mensaje paso con terminos en advertencia.'
      : `Advertencias del glosario que ya salieron y quedan a la vista para corregir.`,
  };
}

const RECLAMOS_CERRADOS = new Set(['respondido', 'cerrado']);

export function clasificarReclamos(filas) {
  const filasReclamos = filas ?? [];
  const abiertos = filasReclamos.filter((f) => !RECLAMOS_CERRADOS.has(f.status));
  const vencidos = abiertos.filter((f) => f.vencido);
  const sinPlazo = abiertos.filter((f) => f.sin_plazo_definido);
  return {
    numero: abiertos.length,
    tono: vencidos.length >= 1 ? 'rojo' : abiertos.length >= 1 ? 'ambar' : 'verde',
    frase: abiertos.length === 0
      ? 'Ningun reclamo sin resolver.'
      : vencidos.length
        ? `Reclamos abiertos, y al menos uno ya fuera del plazo respondido.`
        : `Reclamos abiertos${sinPlazo.length ? `, y ${sinPlazo.length} sin plazo definido` : ''}.`,
  };
}

// --------------------------------------------------------------------- lectura y armado

async function leerVista(req, vista) {
  const { data, error } = await clientForToken(tokenDeSesion(req))
    .from(vista)
    .select('*');
  if (error) throw httpError(502, `lectura de ${vista}: ${error.message}`, 'DB_ERROR');
  return data ?? [];
}

export async function metricas(req) {
  if (!isScopedReadConfigured()) {
    throw httpError(503, 'Falta la configuracion de lectura (SUPABASE_URL y SUPABASE_ANON_KEY).', 'READ_NOT_CONFIGURED');
  }

  const [sla, legajo, banderas, reclamos] = await Promise.all([
    leerVista(req, 'vw_conversations_sla'),
    leerVista(req, 'vw_compliance_progress'),
    leerVista(req, 'vw_messages_flagged'),
    leerVista(req, 'vw_claims_sla'),
  ]);

  const semaforo = (clave, titulo, destino, resultado, detalle) => ({
    clave,
    titulo,
    destino,
    numero: resultado.numero,
    tono: resultado.tono,
    frase: detalle ?? resultado.frase,
  });

  return [
    semaforo('sla', 'Conversaciones fuera del plazo de 2 horas', '/bandeja?pestana=sla', clasificarSla(sla)),
    semaforo('legajo', 'Casillas del legajo sin aprobar', '/legajo', clasificarLegajo(legajo)),
    semaforo('banderas', 'Mensajes marcados por el glosario', '/bandeja?pestana=banderas', clasificarBanderas(banderas)),
    semaforo('reclamos', 'Reclamos abiertos', '/reclamos', clasificarReclamos(reclamos)),
  ];
}
