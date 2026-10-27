import 'dotenv/config';

// Chequeo de la capa de datos contra la base real, por el mismo camino que usaria la pantalla:
// entrar con Supabase Auth y leer las cuatro vistas con ese token. La contrasena se pide por
// teclado y no va en la linea de comandos, para que no quede en el historial de la terminal.
import { createInterface } from 'node:readline';

const [correo, base = 'http://localhost:4000/api'] = process.argv.slice(2);

if (!correo) {
  console.error('Uso: node scripts/chequeo-capa-datos.js <correo-de-una-cuenta-ecp> [url-del-backend]');
  console.error('El backend tiene que estar corriendo y SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY en backend/.env');
  process.exit(1);
}

function pedirContrasena() {
  return new Promise((resolver) => {
    const rl = createInterface({
      input: process.stdin,
      // La interfaz reproduce en pantalla lo que se teclea; se le pone un escribidor mudo.
      output: { write: () => true },
    });
    process.stdout.write('Contrasena (no se ve al escribirla): ');
    rl.question('', (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolver(respuesta);
    });
  });
}

async function pedido(url, opciones = {}) {
  const respuesta = await fetch(`${base}${url}`, opciones);
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error(`${respuesta.status} ${cuerpo?.error?.message ?? cuerpo?.message ?? 'respuesta sin mensaje'}`);
  }
  return cuerpo?.data ?? cuerpo;
}

async function main() {
  const salud = await pedido('/health');
  console.log(`\nbackend: ${salud.status} | capa de datos: ${salud.runtime?.dataLayer ?? 'sin informe'}`);

  const sesion = await pedido('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: correo, password: await pedirContrasena() }),
  });
  console.log(`login: ${sesion.user?.email} con rol ${sesion.user?.role}`);

  const cabecera = { authorization: `Bearer ${sesion.token}` };
  const lecturas = [
    ['bandeja (vw_inbox)', '/messaging/inbox', 'cliente'],
    ['nivel de servicio (vw_conversations_sla)', '/messaging/sla', 'cliente'],
    ['cadencia pendiente (vw_cadence_pending)', '/messaging/cadencia', 'cliente'],
    ['reclamos (vw_claims_sla)', '/messaging/reclamos', 'code'],
  ];

  for (const [nombre, ruta, campoMuestra] of lecturas) {
    const filas = await pedido(ruta, { headers: cabecera });
    const muestra = filas[0] ? ` | primero: ${filas[0][campoMuestra] ?? filas[0].id}` : '';
    console.log(`${nombre.padEnd(42)} ${String(filas.length).padStart(3)} filas${muestra}`);
  }

  console.log('\nSi las cuatro lineas salen con filas, la base esta leyendo con los permisos del usuario.');
  console.log('Un 0 en alguna linea no es un fallo tecnico: puede ser la politica de seguridad a nivel de fila.');
}

main().catch((err) => {
  const causa = err.cause?.message ? ` (${err.cause.message})` : '';
  console.error(`\nCHEQUEO DETENIDO: ${err.message}${causa}`);
  if (err.message === 'fetch failed') {
    console.error(`El backend no contesta en ${base}. Levantelo antes con: npm run dev`);
  }
  process.exit(1);
});
