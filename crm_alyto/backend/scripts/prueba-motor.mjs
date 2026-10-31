import 'dotenv/config';

// Prueba viva del motor de viajes: una corrida manual, y despues la lectura de las tres
// pantallas que tienen que reflejar el trabajo: Bandeja de salida (los mensajes en cola),
// Senales (las consumidas ya no aparecen) y Registro (los asientos del motor).
const base = 'http://localhost:4000/api';

const resp = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@avfinance.bo', password: process.env.ECP_TEST_PASSWORD }),
});
const { token } = (await resp.json()).data;
const cabecera = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const corridaResp = await fetch(`${base}/crm/motor/corrida`, { method: 'POST', headers: cabecera });
const corrida = await corridaResp.json().catch(() => null);
console.log(`corrida: HTTP ${corridaResp.status}`);
if (corrida?.data?.resumen) {
  const r = corrida.data.resumen;
  console.log(`  senales consumidas: ${r.senales_consumidas}`);
  console.log(`  inscripciones: ${r.inscripciones}`);
  console.log(`  mensajes en cola: ${r.mensajes_en_cola}`);
  console.log(`  fallos: ${r.fallidos}`);
  for (const aviso of r.errores ?? []) console.log(`  aviso: ${aviso}`);
} else {
  console.log(`  respuesta: ${JSON.stringify(corrida).slice(0, 300)}`);
}

const salidaResp = await fetch(`${base}/crm/bandeja/salida`, { headers: cabecera });
const salida = await salidaResp.json().catch(() => null);
console.log(`\nbandeja de salida: HTTP ${salidaResp.status}, filas: ${salida?.data?.length ?? '?'}`);
for (const fila of (salida?.data ?? []).slice(0, 8)) {
  console.log(`  [${fila.channel ?? fila.canal ?? '?'}] ${fila.status} · ${(fila.body ?? '').slice(0, 88)}`);
}

const senalesResp = await fetch(`${base}/crm/senales`, { headers: cabecera });
const senales = await senalesResp.json().catch(() => null);
console.log(`\nserales abiertas restantes: ${senales?.data?.length ?? '?'}`);
for (const s of (senales?.data ?? [])) {
  console.log(`  ${s.kind} · ${s.cliente}`);
}

const registroResp = await fetch(`${base}/crm/registro`, { headers: cabecera });
const registro = await registroResp.json().catch(() => null);
console.log(`\nasientos recientes del registro:`);
for (const asiento of (registro?.data ?? []).slice(0, 6)) {
  console.log(`  ${asiento.action} · ${asiento.actor_kind} · ${String(asiento.detail ?? '').slice(0, 96)}`);
}
