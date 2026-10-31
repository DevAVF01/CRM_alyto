import 'dotenv/config';

// Prueba de la exencion: sin la funcion de la base, la ruta debe contestar el error de la
// funcion ausente; con ella, la casilla pasa a Aprobado y el registro muestra el asiento.
const base = 'http://localhost:4000/api';
const cliente = '00000000-0000-4000-8000-0000000000c5';
const requisito = 'origen_fondos';

const resp = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@avfinance.bo', password: process.env.ECP_TEST_PASSWORD }),
});
const { token } = (await resp.json()).data;
const cabecera = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const exencion = await fetch(`${base}/crm/casillas/${cliente}/${requisito}/exencion`, {
  method: 'POST',
  headers: cabecera,
  body: JSON.stringify({ detail: 'Exencion del administrador 29/10: sopa de verificacion en vivo, respaldo recibido por el canal directo.' }),
});
const cuerpo = await exencion.json().catch(() => null);
console.log(`exencion: HTTP ${exencion.status}`);
if (!exencion.ok) {
  console.log(`error: ${cuerpo?.error?.message ?? JSON.stringify(cuerpo).slice(0, 300)}`);
} else {
  console.log(`casilla: ${cuerpo.data?.requirement_code} -> ${cuerpo.data?.status} (revisada ${cuerpo.data?.reviewed_at})`);
  const registro = await (await fetch(`${base}/crm/registro?limite=3`, { headers: cabecera })).json();
  const asiento = registro.data?.[0];
  console.log(`asiento reciente del registro: ${asiento?.action} por ${asiento?.actor} "${String(asiento?.detail).slice(0, 80)}"`);
}
