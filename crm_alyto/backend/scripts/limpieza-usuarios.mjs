import 'dotenv/config';

// Limpieza de cuentas: deja solo a admin@avfinance.bo en el proyecto de Auth.
// Antes de borrar, reasigna al admin las actividades cuyas casillas apuntan a los que salen,
// porque activities.owner_id es not null con on delete restrict: si no, el borrado rebotaria.
// Las demas referencias son on delete set null y la fila de profiles cae con su usuario
// (cascade), de modo que el resto del sembrado queda sin basura.
const url = process.env.SUPABASE_URL;
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const constante = { apikey: llave, Authorization: `Bearer ${llave}`, 'content-type': 'application/json' };
const QUIEDA = 'admin@avfinance.bo';

const lista = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: constante });
if (!lista.ok) {
  console.error(`La lista de usuarios de Auth contesto HTTP ${lista.status}`);
  process.exitCode = 1;
} else {
  const { users } = await lista.json();
  console.log(`usuarios de Auth hoy: ${users.map((u) => u.email).join(', ')}`);

  const admin = users.find((u) => u.email === QUIEDA);
  if (!admin) {
    console.error(`${QUIEDA} no esta en el panel: cancelo todo por si es un error de dedo.`);
    process.exitCode = 1;
  } else {
    // 1. Reasigno al admin las actividades de los que salen, una sola pasada con in list.
    const queSalen = users.filter((u) => u.email !== QUIEDA);
    for (const usuario of queSalen) {
      const reasignacion = await fetch(`${url}/rest/v1/activities?owner_id=eq.${usuario.id}`, {
        method: 'PATCH',
        headers: constante,
        body: JSON.stringify({ owner_id: admin.id }),
      });
      console.log(`actividades de ${usuario.email}: HTTP ${reasignacion.status}`);
    }

    // 2. Borro los usuarios de Auth. La fila de profiles cae con ellos y las referencias
    //    sueltas quedan set null por las llaves foraneas del esquema.
    for (const usuario of queSalen) {
      const baja = await fetch(`${url}/auth/v1/admin/users/${usuario.id}`, { method: 'DELETE', headers: constante });
      console.log(`baja de ${usuario.email}: HTTP ${baja.status} ${baja.status === 204 ? '' : await baja.text().then((t) => t.slice(0, 200))}`);
    }

    const listaFinal = await (await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: constante })).json();
    console.log(`\nquedan: ${listaFinal.users.map((u) => u.email).join(', ')}`);
  }
}
