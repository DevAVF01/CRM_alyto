import 'dotenv/config';

// Bateria de escrituras y rechazos del CRM, en vivo contra la base del panel.
// Corre como admin: PATCH de casilla (innocua, con traba de documento y con su exencion
// autorizada), PATCH de ruta (detalle en la comercial, rechazo en la que no lo es y rechazo sin
// motivo), POST/PATCH de actividad, POST de reclamo y respuesta en hilo (limpia y con termino
// vetado). Despues intenta los rechazos por rol con las cuentas que sigan activas en Auth.
const base = 'http://localhost:4000/api';
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

const marca = (nombre, ok, detalle) => {
  console.log(`${ok ? 'PASA' : 'FALLA'}  ${nombre.padEnd(46)} ${detalle}`);
};

const correrBateria = async (token, user, rol) => {
  console.log(`\n===== batería de escritura con rol ${rol} (${user.email}) =====`);

  const { cuerpo: { data: cuentas } } = await pedir(token, '/crm/cuentas');
  const cliente = cuentas.find((c) => c.ecp_status !== 'dado_baja') ?? cuentas[0];

  const { cuerpo: { data: requisitos } } = await pedir(token, '/crm/requisitos');
  const { cuerpo: { data: casillas } } = await pedir(token, `/crm/fichas/${cliente.id}/casillas`);
  const pedeDocumento = new Set(requisitos.filter((r) => r.document_required).map((r) => r.code));

  // 1. PATCH de casilla innocua (el mismo estado que ya tiene)
  const casillaInnocua = casillas.find((c) => c.status === 'pendiente') ?? casillas[0];
  const r1 = await pedir(token, `/crm/casillas/${cliente.id}/${encodeURIComponent(casillaInnocua.requirement_code)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: casillaInnocua.status, detail: `prueba automatizada ${new Date().toISOString().slice(0, 16)}` }),
  });
  marca('PATCH casilla innocua', r1.status === 200, `HTTP ${r1.status}`);

  // 2. PATCH de casilla con la traba de documento: aprobar una casilla que pide documento y que
  // todavia no esta aprobada. El estado de la base viene con la inicial mayuscula ('Aprobado'),
  // y comparar en minuscula era el motivo por el que esta prueba elegia una casilla ya aprobada y
  // el disparador no tenia nada que rechazar.
  const yaAprobada = (c) => String(c.status).toLowerCase() === 'aprobado';
  const tramada = casillas.find((c) => pedeDocumento.has(c.requirement_code) && !yaAprobada(c));
  if (tramada) {
    const r2 = await pedir(token, `/crm/casillas/${cliente.id}/${encodeURIComponent(tramada.requirement_code)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Aprobado', detail: 'prueba de la traba: aprobar sin documento' }),
    });
    const mensaje = r2.cuerpo?.error?.message ?? '';
    marca('PATCH casilla tramada (rechazo esperado)', r2.status === 400 && /documento/i.test(mensaje), `HTTP ${r2.status} ${mensaje}`);

    // El mismo pedido, pero por el camino autorizado del 29/10: la exencion con motivo escrito.
    const r2b = await pedir(token, `/crm/casillas/${cliente.id}/${encodeURIComponent(tramada.requirement_code)}/exencion`, {
      method: 'POST',
      body: JSON.stringify({ detail: `Exencion de la bateria ${new Date().toISOString().slice(0, 16)}: respaldo verificado por el canal directo.` }),
    });
    marca('POST exencion (aprobo con asiento)', r2b.status === 200 && String(r2b.cuerpo?.data?.status) === 'Aprobado', `HTTP ${r2b.status} ${r2b.cuerpo?.error?.message ?? ''}`);
  } else {
    console.log('      (sin casilla pendiente que exija documento: la trama no tiene donde aplicarse)');
  }

  // 3. PATCH de ruta: el detalle (next_step) solo vive en la ruta comercial, tal y como lo fija la
  // restriccion routes_detalle_solo_comercial. Antes esta prueba tomaba rutas[0], que podia ser de
  // documentacion o riesgo, y el rechazo de la base se leia como falla del CRM.
  const { cuerpo: { data: rutas } } = await pedir(token, '/crm/rutas');
  const comercial = rutas.find((r) => r.kind === 'comercial');
  if (comercial) {
    const r3a = await pedir(token, `/crm/rutas/${comercial.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ next_step: 'prueba automatizada de escritura del 30/10' }),
    });
    marca('PATCH ruta comercial (detalle permitido)', r3a.status === 200, `HTTP ${r3a.status} ${r3a.cuerpo?.error?.message ?? ''}`);
  } else {
    console.log('      (sin ruta comercial abierta: no hay donde escribir el detalle)');
  }

  const noComercial = rutas.find((r) => r.kind !== 'comercial');
  if (noComercial) {
    const r3c = await pedir(token, `/crm/rutas/${noComercial.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ next_step: 'detalle en una ruta que no es comercial' }),
    });
    marca('PATCH ruta no comercial (rechazo esperado)', r3c.status === 400, `HTTP ${r3c.status} ${r3c.cuerpo?.error?.message ?? ''}`);
  }

  // El bloqueo sin motivo lo fija routes_motivo_obligatorio: el chequeo mira la fila nueva, asi que
  // solo rebota si la ruta no traia motivo. Se busca una con el motivo vacio; si todas ya lo tienen,
  // no hay donde probar el rechazo y se avisa en lugar de marcar una falla falsa.
  let rutaSinMotivo = null;
  for (const r of rutas) {
    const { cuerpo } = await pedir(token, `/crm/rutas/${r.id}`);
    if (!cuerpo?.data?.motivo) { rutaSinMotivo = r; break; }
  }
  if (rutaSinMotivo) {
    const r3b = await pedir(token, `/crm/rutas/${rutaSinMotivo.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'bloqueada' }),
    });
    marca('PATCH ruta sin motivo (rechazo esperado)', r3b.status === 400 || r3b.status === 403, `HTTP ${r3b.status} ${r3b.cuerpo?.error?.message ?? ''}`);
  } else {
    console.log('      (sin ruta con motivo vacio: el rechazo por motivo no tiene donde aplicarse)');
  }

  // 4. POST de actividad y cierre
  const r4a = await pedir(token, '/crm/actividades', {
    method: 'POST',
    body: JSON.stringify({
      client_id: cliente.id,
      type: 'tarea',
      title: 'Prueba automatizada 29/10',
      body: 'Escritura de la batería del 29/10 con rol ' + rol,
      owner_id: user.id,
    }),
  });
  marca('POST actividad', r4a.status === 201, `HTTP ${r4a.status}`);
  const actividad = r4a.cuerpo?.data;
  if (actividad) {
    const r4b = await pedir(token, `/crm/actividades/${actividad.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done_at: new Date().toISOString() }),
    });
    marca('PATCH actividad (cierre con done_at)', r4b.status === 200, `HTTP ${r4b.status}`);
  }

  // 5. POST de reclamo con categoria copiada de un reclamo real del sembrado. El formato del
  // codigo lo fija claims_code: RC-[cuatro]-[cuatro]. El segundo bloque sale de la hora y el
  // minuto, asi dos corridas seguidas no chocan con claims_code (unica).
  const { cuerpo: { data: reclamoDeGuia } } = await pedir(token, '/crm/reclamos');
  const ahora = new Date();
  const codigo = `RC-2026-${String(ahora.getHours() * 60 + ahora.getMinutes()).padStart(4, '0')}`;
  const r5 = await pedir(token, '/crm/reclamos', {
    method: 'POST',
    body: JSON.stringify({
      code: codigo,
      client_id: cliente.id,
      category: reclamoDeGuia?.[0]?.category ?? 'otro',
      summary: 'Prueba automatizada de alta de reclamo 30/10',
      description: 'El codigo sale de la hora para no chocar con una corrida anterior ni con el sembrado.',
    }),
  });
  marca('POST reclamo', r5.status === 201 || r5.status === 409, `HTTP ${r5.status} ${r5.status === 201 ? creado(r5.cuerpo?.data) : r5.cuerpo?.error?.message ?? ''}`);

  // 6. Mensaje saliente: hilo abierto limpio, y otro con termino vetado (rechazo)
  const { cuerpo: { data: bandeja } } = await pedir(token, '/crm/bandeja');
  console.log(`      estados de hilo en bandeja: ${[...new Set(bandeja.map((b) => b.status))].join(', ')}`);
  const hilo = bandeja.find((b) => !['resuelta', 'cerrada', 'archivada'].includes(String(b.status))) ?? bandeja[0];
  const r6a = await pedir(token, `/crm/hilos/${hilo.id}/mensajes`, {
    method: 'POST',
    body: JSON.stringify({ body: 'Mensaje de prueba automatizada del 29/10: seguimos con la verificación del legajo.' }),
  });
  marca('POST mensaje saliente', r6a.status === 201, `HTTP ${r6a.status}`);

  const r6b = await pedir(token, `/crm/hilos/${hilo.id}/mensajes`, {
    method: 'POST',
    body: JSON.stringify({ body: 'Creamos una línea de remesas para el cliente.' }),
  });
  marca('POST mensaje con término vetado (rechazo)', r6b.status === 400, `HTTP ${r6b.status} ${r6b.cuerpo?.error?.message ?? ''}`);
};

function creado(fila) {
  return fila ? `codigo ${fila.code ?? fila.id?.slice(0, 8)}` : '';
}

let funciono = true;
try {
  const admin = await entrar(QUIEDA);
  await correrBateria(admin.token, admin.user, admin.user.role);

  // Los rechazos de rol se prueban con las cuentas que aun estan activas en Auth. Desde el 29/10
  // quedaron suspendidas (ban) soporte, ventas, operaciones y compliance: si una no entra, esto es
  // un AVISO y no una falla, porque la cuenta no existe para probar. El alta vuelve por la
  // pantalla Personal (F-03), no por este script.
  for (const correoDeRol of ['soporte@avfinance.bo', 'ventas@avfinance.bo', 'operaciones@avfinance.bo', 'compliance@avfinance.bo']) {
    const esperado = correoDeRol.startsWith('compliance') ? 200 : 403;
    let sesion;
    try {
      sesion = await entrar(correoDeRol);
    } catch (err) {
      console.log(`AVISO   ${correoDeRol} sin sesion (${err.message})`);
      continue;
    }
    const { status } = await pedir(sesion.token, '/crm/registro');
    marca(`${correoDeRol} leyendo registro`, status === esperado, `HTTP ${status} (esperada ${esperado})`);
  }
} catch (err) {
  funciono = false;
  console.error(`\nBATERIA DETENIDA: ${err.message}`);
  process.exitCode = 1;
} finally {
  if (funciono) console.log('\nBatería terminada.');
}
