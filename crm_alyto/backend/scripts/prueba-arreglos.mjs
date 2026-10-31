import 'dotenv/config';

// Prueba puntual de los dos arreglos del 29/10: el error del linter con el contrato nuevo y el
// PATCH innocua de una ruta (sin estado), que antes moria por routes_detalle_solo_comercial.
const base = 'http://localhost:4000/api';
const constante = { 'content-type': 'application/json' };

const entrar = async () => {
  const resp = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: constante,
    body: JSON.stringify({ email: 'admin@avfinance.bo', password: process.env.ECP_TEST_PASSWORD }),
  });
  const cuerpo = await resp.json();
  return cuerpo.data;
};

const admin = await entrar();
const cabecera = { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' };
const pedir = async (ruta, opciones = {}) => {
  const resp = await fetch(`${base}${ruta}`, { ...opciones, headers: { ...cabecera, ...(opciones.headers ?? {}) } });
  const cuerpo = await resp.json().catch(() => null);
  return { status: resp.status, cuerpo };
};

// 1. Mensaje con termino vetado: el cuerpo del error tiene que traer el texto del glosario.
const { cuerpo: { data: bandeja } } = await pedir('/crm/bandeja');
const hilo = bandeja.find((b) => !['resuelta', 'cerrada', 'archivada'].includes(String(b.status))) ?? bandeja[0];
const r1 = await pedir(`/crm/hilos/${hilo.id}/mensajes`, {
  method: 'POST',
  body: JSON.stringify({ body: 'Creamos una linea de remesas para el cliente.' }),
});
console.log(`linter: HTTP ${r1.status} codigo ${r1.cuerpo?.error?.code} mensaje "${r1.cuerpo?.error?.message}"`);

// 2. PATCH de ruta innocua sin estado: el exito prueba que la pantalla podra tocar la ruta A o C.
const { cuerpo: { data: rutas } } = await pedir('/crm/rutas');
const rutaNoComercial = rutas.find((r) => r.kind !== 'comercial');
const r2 = await pedir(`/crm/rutas/${rutaNoComercial.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ owner_id: admin.user.id }),
});
console.log(`ruta ${rutaNoComercial.kind}: HTTP ${r2.status} ${r2.status === 200 ? 'ok' : r2.cuerpo?.error?.message}`);
