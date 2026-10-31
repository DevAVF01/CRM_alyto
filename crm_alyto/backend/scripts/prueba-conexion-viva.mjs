import 'dotenv/config';

// Replica del chequeo-capa-datos sin teclado: entra por el mismo /api/auth/login que usa la
// interfaz y lee las rutas del CRM por el backend, con el token del propio usuario.
// La contrasena viene de ECP_TEST_PASSWORD en backend/.env (o como tercer argumento).
const correo = process.argv[2] ?? 'admin@avfinance.bo';
const contrasena = process.env.ECP_TEST_PASSWORD ?? process.env.DEMO_PASSWORD;
const base = 'http://localhost:4000/api';

const respuestaAuth = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: correo, password: contrasena }),
});
const cuerpoAuth = await respuestaAuth.json().catch(() => null);
if (!respuestaAuth.ok) {
  console.error(`LOGIN RECHAZADO: HTTP ${respuestaAuth.status} (${correo})`);
  console.error(cuerpoAuth?.error?.message ?? 'respuesta sin mensaje');
  process.exitCode = 1;
} else {
  await correr(cuerpoAuth.data.token, cuerpoAuth.data.user?.email, cuerpoAuth.data.user?.role);
}

async function correr(token, emailLogueado, rolLogueado) {
  console.log(`login: ${emailLogueado} con rol ${rolLogueado}`);

const cabecera = { authorization: `Bearer ${token}` };
const pedido = async (ruta) => {
  const respuesta = await fetch(`${base}${ruta}`, { headers: cabecera });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    return { ruta, estado: respuesta.status, filas: null, error: cuerpo?.error?.message ?? '' };
  }
  return { ruta, estado: 200, filas: Array.isArray(cuerpo?.data) ? cuerpo.data.length : cuerpo?.data, error: '' };
};

const LECTURAS = [
  '/crm',
  '/crm/bandeja', '/crm/bandeja/sla', '/crm/bandeja/salida', '/crm/bandeja/banderas',
  '/crm/senales', '/crm/viajes', '/crm/legajo', '/crm/rutas', '/crm/rutas/tablero',
  '/crm/reclamos', '/crm/actividades', '/crm/cuentas', '/crm/contactos',
  '/crm/plantillas', '/crm/cotejos', '/crm/registro', '/crm/glosario', '/crm/parametros',
];

// Tres lectras son de administracion y cumplimiento por diseno del guarda de ruta: para el resto
// de los roles el 403 es el resultado correcto, no un fallo. Contarlos como fallo hacia ver la
// separacion por rol como si fuera una averia.
const SOLO_ADMIN_Y_CUMPLIMIENTO = ['/crm/registro', '/crm/glosario', '/crm/parametros'];

let fallos = 0;
for (const ruta of LECTURAS) {
  const restringida = SOLO_ADMIN_Y_CUMPLIMIENTO.includes(ruta);
  const puedeVer = restringida ? ['admin', 'compliance'].includes(rolLogueado) : true;
  const { estado, filas, error } = await pedido(ruta);
  const ok = restringida ? (puedeVer ? estado === 200 : estado === 403) : estado === 200;
  if (!ok) fallos += 1;
  const valor = typeof filas === 'number' ? `${filas}` : filas === null ? '' : '(objeto)';
  const sena = ok ? (restringida && !puedeVer ? 'OK403' : 'OK  ') : 'FALLO';
  console.log(`${sena} ${estado}  ${ruta.padEnd(26)} ${valor} ${error}`);
}

// Conteo directo con la llave de servicio, sin RLS, para comparar contra lo que ve el rol.
const url = process.env.SUPABASE_URL;
const directas = ['vw_inbox', 'vw_conversations_sla', 'vw_signals_open', 'vw_outbox_pending', 'vw_claims_sla', 'audit_events'];
const llaveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cabecerasServicio = { apikey: llaveServicio, Authorization: `Bearer ${llaveServicio}` };

let conteoDirecto = 'no disponible (falta la llave de servicio)';
if (llaveServicio) {
  const conteos = [];
  for (const entidad of directas) {
    const r = await fetch(`${url}/rest/v1/${entidad}?select=*`, {
      headers: { ...cabecerasServicio, Prefer: 'count=exact', Range: '0-0' },
    });
    const rango = r.headers.get('content-range');
    conteos.push(`${entidad}=${r ? (rango?.split('/')[1] ?? '?') : `HTTP ${r.status}`}`);
  }
  conteoDirecto = conteos.join(' | ');
}

console.log(`\nconteo directo (service_role, sin RLS): ${conteoDirecto}`);
console.log(fallos === 0 ? '\nLas lecturas por rol salieron limpias.' : `\nHubo ${fallos} lecturas con fallo.`);
}
