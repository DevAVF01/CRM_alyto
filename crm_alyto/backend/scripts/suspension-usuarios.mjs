import 'dotenv/config';

// Sustituye la baja fisica (que la base impide a proposito, porque la cascada tendria que
// tocar asientos de auditoria inmutables) por una suspension de cuenta: ban de 100 anos.
// En la practica queda un solo usuario activo (el administrador) y el historial completo.
const url = process.env.SUPABASE_URL;
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const constante = { apikey: llave, Authorization: `Bearer ${llave}`, 'content-type': 'application/json' };
const QUIEDA = 'admin@avfinance.bo';
// 100 anos en segundos; mayor que cualquier vida util del CRM.
const BANCS = String(100 * 365 * 24 * 3600);

const { users } = await (await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: constante })).json();
const queSalen = users.filter((u) => u.email !== QUIEDA);

for (const usuario of queSalen) {
  const susp = await fetch(`${url}/auth/v1/admin/users/${usuario.id}`, {
    method: 'PUT',
    headers: constante,
    body: JSON.stringify({ ban_duration: `${BANCS}s` }),
  });
  const cuerpo = susp.ok ? null : await susp.text().catch(() => '');
  console.log(`suspension de ${usuario.email}: HTTP ${susp.status}${cuerpo ? ' ' + cuerpo.slice(0, 120) : ''}`);
}

// Verificacion: con la suspension viva, el login de los que salen tiene que rechazar; el del
// administrador tiene que seguir entrando. Se entra contra /auth/v1/token con la llave anon.
const anon = process.env.SUPABASE_ANON_KEY;
const { users: despues } = await (await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: constante })).json();
console.log(`\nban actual en Auth:`);
for (const u of despues) {
  const prueb = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: process.env.ECP_TEST_PASSWORD }),
  });
  console.log(`  ${u.email.padEnd(28)} baneado=${u.banned_until ? new Date(u.banned_until).getFullYear() : 'no'} login=${prueb.status}`);
}
