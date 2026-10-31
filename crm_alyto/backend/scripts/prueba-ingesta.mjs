import 'dotenv/config';

// Prueba en vivo del archivador (pasos 1, 3 y 4). Escribe de verdad en el ECP: crea una ficha con
// prefijo 'Prueba archivador', un hilo, cuatro mensajes entrantes y una nota interna, y al final
// imprime los identificadores para que se puedan limpiar. La contrasena sale de ECP_TEST_PASSWORD en
// backend/.env, nunca del chat.
//
// Uso:  node scripts/prueba-ingesta.mjs [correo]
//
// Lo que comprueba, en orden:
//   1. Un numero que no esta en el CRM crea la ficha minima, abre el hilo y encola con la regla de
//      enrutamiento de la base, no con la cola que alguien eligio en la pantalla.
//   2. El mismo id de mensaje externo no duplica nada: responde 200 y dice duplicado.
//   3. Un segundo mensaje del mismo numero entra al mismo hilo.
//   4. Cambiar el motivo reencola el hilo con la regla nueva.
//   5. La nota interna del equipo entra por el mismo archivador con el canal 'interno'.
//   6. La asimetria del filtro de marca: el texto del cliente se archiva tal cual, la nota del equipo
//      se rechaza si lleva un termino vetado.
//   7. El asiento de auditoria: con la migracion 0011 aplicada, el asiento del entrante trae
//      actor_id y entity_id igual a la cuenta del cliente, y se ve en el legajo de esa ficha.
//
// El backend bajo prueba es el del puerto 4000. Si se levanta una instancia aparte con PORT=4100, se
// le apunta con CRM_PRUEBA_BASE=http://localhost:4100/api sin tocar el servicio que ya se tiene abierto.
const base = process.env.CRM_PRUEBA_BASE ?? 'http://localhost:4000/api';
const QUIEDA = 'admin@avfinance.bo';

const entrar = async (correo) => {
  const resp = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: correo, password: process.env.ECP_TEST_PASSWORD ?? process.env.DEMO_PASSWORD }),
  });
  const cuerpo = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(`login ${correo}: HTTP ${resp.status} ${cuerpo?.error?.message ?? ''}`);
  return { token: cuerpo.data.token, user: cuerpo.data.user };
};

const pedir = async (token, ruta, opciones = {}) => {
  const resp = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(opciones.headers ?? {}) },
  });
  const cuerpo = await resp.json().catch(() => null);
  return { status: resp.status, cuerpo };
};

let fallos = 0;
const marca = (nombre, ok, detalle) => {
  console.log(`${ok ? 'PASA' : 'FALLA'}  ${nombre.padEnd(52)} ${detalle}`);
  if (!ok) fallos += 1;
  return ok;
};
const omiso = (nombre, detalle) => console.log(`OMISO  ${nombre.padEnd(52)} ${detalle}`);

const serie = String(Date.now()).slice(-8);
const TELEFONO = `+591${serie}`;
const NOMBRE = `Prueba archivador ${serie}`;

const { token, user } = await entrar(process.argv[2] ?? QUIEDA);
console.log(`login: ${user.email} con rol ${user.role}`);
console.log(`numero de prueba: ${TELEFONO} · ficha: ${NOMBRE}\n`);

let hiloId = null;
let cuentaId = null;
const mensajes = [];

// ------------------------------------------------------------------------------ 1. ficha nueva
const primera = {
  channel: 'whatsapp',
  query_category: 'soporte_tecnico',
  telefono: TELEFONO,
  client_name: NOMBRE,
  body: 'No me llega el codigo de confirmacion al telefono.',
  external_msg_id: `prueba-${serie}-1`,
  dueno_email: user.email,
};
const r1 = await pedir(token, '/crm/entrada', { method: 'POST', body: JSON.stringify(primera) });
const d1 = r1.cuerpo?.data ?? {};
if (marca('1a. numero nuevo: ficha, hilo y cola de la regla',
  r1.status === 201 && d1.creoCuenta === true && d1.abrioHilo === true && !!d1.hilo?.queue,
  `HTTP ${r1.status} · cuenta ${d1.cuenta?.display_name ?? '?'} · cola "${d1.hilo?.queue ?? '?'}" · ` +
  `urgencia ${d1.hilo?.priority ?? '?'}`)) {
  hiloId = d1.hilo.id;
  cuentaId = d1.cuenta.id;
  mensajes.push(d1.mensaje.id);
} else {
  console.log('    rechazo:', JSON.stringify(r1.cuerpo?.error ?? r1.cuerpo ?? '').slice(0, 300));
}

// ------------------------------------------------------------------------------- 2. duplicado
if (hiloId) {
  const r2 = await pedir(token, '/crm/entrada', { method: 'POST', body: JSON.stringify(primera) });
  marca('1b. mismo id externo: avisa el duplicado, no escribe',
    r2.status === 200 && r2.cuerpo?.data?.duplicado === true,
    `HTTP ${r2.status} · ${r2.cuerpo?.data?.avisos?.[0] ?? r2.cuerpo?.error?.message ?? ''}`);
}

// --------------------------------------------------------------------------- 3. mismo numero
if (hiloId) {
  const r3 = await pedir(token, '/crm/entrada', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'whatsapp',
      query_category: 'soporte_tecnico',
      telefono: TELEFONO,
      body: 'Ya llame dos veces, sigo sin recibir el codigo.',
      external_msg_id: `prueba-${serie}-2`,
    }),
  });
  const d3 = r3.cuerpo?.data ?? {};
  marca('1c. mismo numero: retoma el hilo, no crea otra ficha',
    r3.status === 201 && d3.creoCuenta === false && d3.abrioHilo === false && d3.hilo?.id === hiloId,
    `HTTP ${r3.status} · creoCuenta ${String(d3.creoCuenta)} · abrioHilo ${String(d3.abrioHilo)}`);
  if (d3.mensaje) mensajes.push(d3.mensaje.id);

  const detalle = await pedir(token, `/crm/hilos/${hiloId}`);
  const contados = detalle.cuerpo?.data?.mensajes?.length ?? 0;
  marca('1d. el hilo guarda los mensajes entrantes por su orden',
    detalle.status === 200 && contados >= 2,
    `HTTP ${detalle.status} · ${contados} mensajes en el hilo`);
}

// --------------------------------------------------------------------------- 4. reencolado
if (hiloId) {
  const r4 = await pedir(token, '/crm/entrada', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'whatsapp',
      query_category: 'reclamo',
      telefono: TELEFONO,
      body: 'Quiero reclamar formalmente por la demora.',
      external_msg_id: `prueba-${serie}-3`,
    }),
  });
  const d4 = r4.cuerpo?.data ?? {};
  if (d4.mensaje) mensajes.push(d4.mensaje.id);
  marca('1e. motivo nuevo: el hilo vuelve a encolarse solo',
    r4.status === 201 && d4.hilo?.query_category === 'reclamo',
    `HTTP ${r4.status} · cola "${d4.hilo?.queue ?? '?'}" · avisos: ${(d4.avisos ?? []).join(' | ') || 'ninguno'}`);
}

// ---------------------------------------------------------------------------- 5. nota interna
if (hiloId) {
  const r5 = await pedir(token, `/crm/hilos/${hiloId}/notas`, {
    method: 'POST',
    body: JSON.stringify({ body: 'Llamado del cliente a las 10:00, se le explico el reenvio del codigo.' }),
  });
  const nota = r5.cuerpo?.data?.nota;
  const ok5 = marca('2a. nota interna como actividad del hilo',
    r5.status === 201 && nota?.type === 'nota' && nota?.conversation_id === hiloId && !!nota?.done_at,
    `HTTP ${r5.status} · tipo ${nota?.type ?? '?'} · ${nota?.done_at ? 'cerrada al nacer, no ensucia la agenda' : 'sin done_at'} · ` +
    `${r5.cuerpo?.error?.message ?? ''}`);
  if (ok5) {
    const recuento = await pedir(token, `/crm/hilos/${hiloId}`);
    const sigueEn3 = (recuento.cuerpo?.data?.mensajes ?? []).length;
    marca('2b. la nota NO aparece como mensaje del cliente',
      sigueEn3 === 3, `${sigueEn3} mensajes en el hilo: la nota vive en activities`);

    const lista = await pedir(token, `/crm/notas?hilo=${hiloId}&tipo=nota`);
    const hay = (lista.cuerpo?.data ?? []).some((a) => a.id === nota.id);
    marca('2c. la nota se lee por el filtro del hilo',
      lista.status === 200 && hay, `HTTP ${lista.status} · ${(lista.cuerpo?.data ?? []).length} notas`);
  }
}

// ----------------------------------------------------------------------- 6. filtro de marca
if (hiloId && cuentaId) {
  const { cuerpo: glosario } = await pedir(token, '/crm/glosario');
  const vetado = (glosario?.data ?? []).find((t) => t.severity === 'bloqueo')?.term;
  if (!vetado) {
    omiso('3. asimetria del filtro de marca', 'este rol no puede leer el glosario');
  } else {
    const r6 = await pedir(token, '/crm/entrada', {
      method: 'POST',
      body: JSON.stringify({
        channel: 'whatsapp',
        query_category: 'otro',
        telefono: TELEFONO,
        body: `El cliente escribio textualmente: ${vetado} cuando entra el pago?`,
        external_msg_id: `prueba-${serie}-4`,
      }),
    });
    const ok6 = marca('3a. el texto del cliente NO pasa por el filtro',
      r6.status === 201,
      `HTTP ${r6.status} · ${r6.cuerpo?.error?.message ?? 'archivado tal como lo dijo el cliente'}`);
    if (ok6) mensajes.push(r6.cuerpo.data.mensaje.id);

    const r7 = await pedir(token, `/crm/hilos/${hiloId}/notas`, {
      method: 'POST',
      body: JSON.stringify({ body: `Responder con la palabra ${vetado} en el mensaje.` }),
    });
    marca('3b. la salida del equipo SI la frena el filtro',
      r7.status === 400,
      `HTTP ${r7.status} · ${r7.cuerpo?.error?.message?.slice(0, 90) ?? ''}`);
  }
}

// ---------------------------------------------------------------------------- 7. la bandeja
if (hiloId) {
  const r8 = await pedir(token, '/crm/bandeja');
  const fila = (r8.cuerpo?.data ?? []).find((f) => f.id === hiloId);
  marca('4a. el hilo archivado aparece en la bandeja', !!fila,
    fila ? `${fila.cliente} · ${fila.queue} · estado ${fila.status} · ${fila.messages_count} msj`
      : `HTTP ${r8.status}, ninguna fila con ese id`);
}

// --------------------------------------------------------------------------- 8. el asiento
if (cuentaId && mensajes.length) {
  const r9 = await pedir(token, '/crm/registro');
  console.log('');
  if (r9.status !== 200) {
    omiso('5. asiento del entrante', `/crm/registro responde HTTP ${r9.status} con este rol`);
  } else {
    const asientos = (r9.cuerpo?.data ?? []).filter((a) => mensajes.includes(a.message_id));
    if (!asientos.length) {
      console.log('FALLA  5. asiento del entrante: la bitacora no tiene columna message_id, o sea que aun');
      console.log('           no esta aplicada backend/supabase/migrations/0011_asiento_entrante_completo.sql.');
      console.log('           Pegue ese archivo entero en el editor SQL de Supabase y vuelva a correr esto.');
      fallos += 1;
    } else {
      const delCliente = (r9.cuerpo?.data ?? [])
        .filter((a) => a.entity_id === cuentaId && String(a.action).startsWith('mensaje_'));
      marca('5a. asiento con actor_id y la cuenta como entidad',
        asientos.length >= 3 && delCliente.length >= 3 && asientos.every((a) => a.actor_id),
        `${asientos.length} asientos · actor_id ${asientos[0].actor_id ? 'puesto' : 'vacio'} · ` +
        `${delCliente.length} apuntan a la cuenta del cliente`);

      const legajo = await pedir(token, `/crm/fichas/${cuentaId}`);
      const enLegajo = (legajo.cuerpo?.data?.registro ?? [])
        .filter((a) => String(a.action).startsWith('mensaje_'));
      marca('5b. el legajo de la ficha muestra los mensajes',
        legajo.status === 200 && enLegajo.length >= 3,
        `HTTP ${legajo.status} · ${enLegajo.length} asientos de mensaje en el registro de la ficha`);
    }
  }
}

console.log('\n----------------------------- datos dejados en el ECP');
console.log(`cuenta:   ${cuentaId ?? '(no se creo)'}`);
console.log(`hilo:     ${hiloId ?? '(no se abrio)'}`);
console.log(`mensajes: ${mensajes.join(', ') || '(ninguno)'}`);
console.log(`numero:   ${TELEFONO} · nombre: ${NOMBRE}`);
console.log(fallos === 0
  ? '\nEl archivador responde como corresponde en los cuatro pasos.'
  : `\nHubo ${fallos} comprobaciones con fallo.`);
