import 'dotenv/config';

// Chequeo de la capa de datos contra la base real, por el mismo camino que usaria una pantalla:
// entrar con Supabase Auth y leer con ese token. La contrasena se pide por teclado y no va en la
// linea de comandos, para que no quede en el historial de la terminal.
//
// Corre las once vistas del modelo del 27/10 y despues tres lecturas que son las que de verdad
// prueban el puente: el hilo de una conversacion, la Ficha 360 de una cuenta y el registro. Esas
// tres no son una vista suelta; arman varias tablas por dentro y son las que se rompen si una
// columna cambia de nombre.
//
// Uso:  node scripts/chequeo-capa-datos.js soporte@avfinance.bo
//       node scripts/chequeo-capa-datos.js admin@avfinance.bo http://localhost:4000/api
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
    const error = new Error(`${respuesta.status} ${cuerpo?.error?.message ?? cuerpo?.message ?? 'respuesta sin mensaje'}`);
    error.status = respuesta.status;
    throw error;
  }
  return cuerpo?.data ?? cuerpo;
}

const LECTURAS = [
  ['bandeja', '/crm/bandeja', 'cliente'],
  ['nivel de servicio', '/crm/bandeja/sla', 'cliente'],
  ['bandeja de salida', '/crm/bandeja/salida', 'cliente'],
  ['mensajes con advertencia', '/crm/bandeja/banderas', 'term'],
  ['senales abiertas', '/crm/senales', 'cliente'],
  ['pasos de viaje por mandar', '/crm/viajes', 'cliente'],
  ['legajo por cuenta', '/crm/legajo', 'cliente'],
  ['rutas con su antiguedad', '/crm/rutas', 'cliente'],
  ['tablero de rutas', '/crm/rutas/tablero', 'cliente'],
  ['reclamos', '/crm/reclamos', 'code'],
  ['actividades abiertas', '/crm/actividades', 'title'],
];

function linea(nombre, filas, campoMuestra) {
  // Un cero no es un fallo tecnico: puede ser la politica de fila del rol con el que se entro. Lo
  // que si lo es es que la peticion no conteste, y eso se nota antes porque el script se detiene.
  const muestra = filas[0] ? ` | primero: ${filas[0][campoMuestra] ?? filas[0].id}` : '';
  console.log(`${nombre.padEnd(32)} ${String(filas.length).padStart(3)} filas${muestra}`);
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

  const superficie = await pedido('/crm', { headers: cabecera });
  console.log(`superficie: ${superficie.vistas.length} vistas y ${superficie.tablas.length} tablas habilitadas`);

  let bandeja = [];
  for (const [nombre, ruta, campo] of LECTURAS) {
    const filas = await pedido(ruta, { headers: cabecera });
    linea(nombre, filas, campo);
    if (ruta === '/crm/bandeja') bandeja = filas;
  }

  if (!bandeja.length) {
    console.log('\nLa bandeja no devolvio filas para este rol: el hilo, la ficha y el registro no se prueban.');
  } else {
    const hilo = await pedido(`/crm/hilos/${bandeja[0].id}`, { headers: cabecera });
    const ultimo = String(hilo.mensajes.at(-1)?.sent_at ?? '').slice(0, 16);
    console.log(`\nhilo por ${hilo.conversacion.channel} con ${hilo.conversacion.cliente}: ${hilo.mensajes.length} mensajes, el ultimo el ${ultimo}`);

    const ficha = await pedido(`/crm/fichas/${bandeja[0].client_id}`, { headers: cabecera });
    const bloques = Object.entries(ficha)
      .filter(([, valor]) => Array.isArray(valor))
      .map(([nombre, valor]) => `${nombre} ${valor.length}`);
    console.log(`ficha 360 de ${ficha.cuenta.display_name}: ${bloques.join(' | ')}`);

    try {
      const registro = await pedido('/crm/registro?limite=5', { headers: cabecera });
      console.log(`registro: ${registro.length} asientos, el ultimo "${registro[0]?.action}" de un ${registro[0]?.actor_kind}`);
    } catch (err) {
      console.log(err.status === 403
        ? 'registro: este rol no lo lee (es lo esperado fuera de administracion y cumplimiento)'
        : `registro: ${err.message}`);
    }
  }

  console.log('\nSi las once vistas salen con filas y el hilo y la ficha responden, la base esta leyendo con los permisos del usuario.');
}

main().catch((err) => {
  const causa = err.cause?.message ? ` (${err.cause.message})` : '';
  console.error(`\nCHEQUEO DETENIDO: ${err.message}${causa}`);
  if (err.message === 'fetch failed') {
    console.error(`El backend no contesta en ${base}. Levantelo antes con: npm run dev`);
  }
  // En Windows process.exit() con la terminal de readline y un socket de fetch todavia en cierre
  // dispara un assert nativo de libuv (UV_HANDLE_CLOSING) que tapa el mensaje anterior. Se suelta
  // el codigo y se deja que el bucle de eventos termine solo.
  process.exitCode = 1;
});
