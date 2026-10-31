import 'dotenv/config';

// Sondeo sobre la escritura del legajo: PATCH /crm/casillas/<cliente>/<codigo> con distintos
// roles, para ver quien puede y quien no, y que error exacto devuelve la base.
const base = 'http://localhost:4000/api';
const correo = process.argv[2] ?? 'admin@avfinance.bo';
const contrasena = process.env.ECP_TEST_PASSWORD ?? process.env.DEMO_PASSWORD;

const entrada = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: correo, password: contrasena }),
});
const cuerpoAuth = await entrada.json().catch(() => null);
if (!entrada.ok) {
  console.error(`login rechazado: HTTP ${entrada.status} ${cuerpoAuth?.error?.message ?? ''}`);
  process.exitCode = 1;
} else {
  console.log(`login: ${cuerpoAuth.data.user.email} rol ${cuerpoAuth.data.user.role}`);
  const cabecera = { authorization: `Bearer ${cuerpoAuth.data.token}`, 'content-type': 'application/json' };

  const cuentas = (await (await fetch(`${base}/crm/cuentas`, { headers: cabecera })).json()).data;
  const cliente = cuentas[0];
  console.log(`cliente: ${cliente.display_name} (${cliente.id})`);
  const casillas = (await (await fetch(`${base}/crm/fichas/${cliente.id}/casillas`, { headers: cabecera })).json()).data;
  const objetivo = casillas.find((c) => c.status === 'pendiente') ?? casillas[0];
  console.log(`casilla: ${objetivo.requirement_code} estado ${objetivo.status}`);

  // 1) edicion innocua: el mismo estado que ya tiene
  const r1 = await fetch(`${base}/crm/casillas/${cliente.id}/${encodeURIComponent(objetivo.requirement_code)}`, {
    method: 'PATCH',
    headers: cabecera,
    body: JSON.stringify({ status: objetivo.status, detail: `prueba de escritura ${new Date().toISOString()}` }),
  });
  const c1 = await r1.json().catch(() => null);
  console.log(`PATCH innocua: HTTP ${r1.status} ${JSON.stringify(c1?.data?.status ?? c1?.error ?? c1).slice(0, 300)}`);

  // 2) lectura del documento de la casilla: GET documentos del cliente
  const r2 = await fetch(`${base}/crm/fichas/${cliente.id}/documentos`, { headers: cabecera });
  const c2 = await r2.json().catch(() => null);
  console.log(`GET documentos: HTTP ${r2.status} filas ${Array.isArray(c2?.data) ? c2.data.length : '(?'}'` + (c2?.error ? ` ${c2.error.message}` : ''));
}
