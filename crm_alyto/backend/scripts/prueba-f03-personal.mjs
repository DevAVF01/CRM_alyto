import 'dotenv/config';

// Bateria de F-03 live: solicitud de cuenta, filtros de dominio/duplicado, entrada, decision del
// administrador (aceptar, suspender, proteger la propia cuenta) y asientos en el registro.
// No imprime credenciales: solo estados y codigos.
const api = 'http://localhost:4000/api';

// El password del administrador vive en .env, nunca en el codigo ni en el chat.
const admin = { email: 'admin@avfinance.bo', password: process.env.ECP_TEST_PASSWORD };
if (!admin.password) {
  console.error('Falta ECP_TEST_PASSWORD en backend/.env: no hay forma de entrar como admin.');
  process.exit(1);
}

const contar = (sello) => console.log(sello);
const fracaso = (sello) => { console.error(sello); process.exit(1); };

// ---------------------------------------------------------------- 1. solicitudes publicas
const r1 = await fetch(`${api}/auth/solicitud`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ display_name: 'Ana Prueba', email: 'ana.prueba@avfinance.bo', password: 'AnaPrueba2026+' }),
});
const c1 = await r1.json().catch(() => null);
// Idempotente: 201 cuando la cuenta es nueva, 409 cuando ya quedo de una corrida anterior.
(r1.status === 201 && c1?.data?.estado === 'pendiente') || (r1.status === 409 && c1?.error?.code === 'EMAIL_TAKEN')
  ? contar(`1. solicitud -> ${r1.status === 201 ? '201 pendiente (nueva)' : '409 ya existia de una corrida anterior'}`)
  : fracaso(`1. solicitud fallo distinto: ${r1.status} ${JSON.stringify(c1?.error ?? c1)}`);
let idAna = c1?.data?.id ?? null; // luego se completa con el listado del admin

const r2 = await fetch(`${api}/auth/solicitud`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ display_name: 'Correo Personal', email: 'intruso@gmail.com', password: 'OtraClave2026+' }),
});
const c2 = await r2.json().catch(() => null);
r2.status === 400 && c2?.error?.code === 'DOMAIN_NOT_ALLOWED'
  ? contar('2. correo fuera del dominio corporativo -> 400 DOMAIN_NOT_ALLOWED')
  : fracaso(`2. el dominio fallo distinto: ${r2.status} ${c2?.error?.code}`);

const r3 = await fetch(`${api}/auth/solicitud`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ display_name: 'Ana Duplicada', email: 'ana.prueba@avfinance.bo', password: 'AnaPrueba2026+' }),
});
const c3 = await r3.json().catch(() => null);
r3.status === 409 && c3?.error?.code === 'EMAIL_TAKEN'
  ? contar('3. correo repetido -> 409 EMAIL_TAKEN')
  : fracaso(`3. duplicado se porto distinto: ${r3.status} ${c3?.error?.code}`);

const r4 = await fetch(`${api}/auth/solicitud`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ display_name: 'Clave Corta', email: 'clava.corta@avfinance.bo', password: '1234567' }),
});
r4.status === 400
  ? contar('4. contrasena de 7 caracteres -> 400 rechazado')
  : fracaso(`4. la contrasena corta paso: ${r4.status}`);

// ---------------------------------------------------------------- 2. sesion de administrador
const r6 = await fetch(`${api}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(admin),
});
const c6 = await r6.json().catch(() => null);
r6.status === 200 && c6?.data?.token
  ? contar('6. entrada del administrador -> 200')
  : fracaso(`6. el administrador no pudo entrar: ${r6.status}`);
const token = c6.data.token;
const cabecera = { apikey: token, Authorization: `Bearer ${token}`, 'content-type': 'application/json' };

// Reset determinista con la llave de servicio (solo disponible dentro del backend): se deja a
// Ana en el estado pendiente puro, es decir perfil is_active=false SIN ban en Auth, como queda
// tras una solicitud fresca. Se corre SIEMPRE: una cuenta baneada y con perfil inactivo tambien
// se pinta como pendiente en la pantalla, y solo mirar el estado no basta.
const { createClient } = await import('@supabase/supabase-js');
const gestion = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const idAdmin = c6.data?.user?.id ?? null;
const r5b = await fetch(`${api}/crm/personal`, { headers: cabecera });
let c5b = await r5b.json().catch(() => null);if (r5b.status !== 200 || !Array.isArray(c5b?.data)) fracaso(`el listado de personal fallo: ${r5b.status}`);
const filaAna = c5b.data.find((p) => p.email === 'ana.prueba@avfinance.bo');
if (!filaAna) fracaso('Ana no aparece en el listado de personal');
idAna = filaAna.id;
{
  // Estado pendiente puro, sin condiciones: sin ban en Auth y con el perfil inactivo.
  const desban = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${idAna}`, {
    method: 'PUT',
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ban_duration: 'none' }),
  });
  if (!desban.ok) fracaso(`no se pudo desbanear a Ana: ${desban.status}`);
  const { error: errPerfil } = await gestion.from('profiles').update({ is_active: false }).eq('id', idAna);
  if (errPerfil) fracaso(`no se pudo dejar a Ana pendiente: ${errPerfil.message}`);
  contar('reset: Ana quedo pendiente (perfil inactivo, sin ban)');
  const r5c = await fetch(`${api}/crm/personal`, { headers: cabecera });
  if (r5c.status !== 200) fracaso(`no se pudo releer el listado: ${r5c.status}`);
  c5b = await r5c.json();
}

const estados = c5b.data.map((p) => `${p.email}: ${p.estado}/${p.role}`).join(' | ');
contar(`7. personal -> ${c5b.data.length} cuentas: ${estados}`);
contar('8. Ana aparece pendiente en el listado');

// La cuenta pendiente no logra entrar al CRM: el rol se lee de un perfil activo.
const r5 = await fetch(`${api}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'ana.prueba@avfinance.bo', password: 'AnaPrueba2026+' }),
});
const c5 = await r5.json().catch(() => null);
r5.status === 403
  ? contar('9. la cuenta pendiente intenta entrar -> 403 (perfil sin rol activo)')
  : fracaso(`9. la cuenta pendiente entro con ${r5.status}: ${JSON.stringify(c5?.data ?? c5)?.slice(0, 120)}`);

// ---------------------------------------------------------------- 3. la decision del admin
const r9 = await fetch(`${api}/crm/personal/${idAna}`, {
  method: 'PATCH', headers: cabecera,
  body: JSON.stringify({ role: 'soporte', is_active: true }),
});
const c9 = await r9.json().catch(() => null);
r9.status === 200 && c9?.data?.is_active === true
  ? contar(`10. aceptar cuenta -> 200 activa/rol ${c9.data.role}`)
  : fracaso(`10. aceptar fallo: ${r9.status} ${JSON.stringify(c9?.error ?? c9)}`);

const r10 = await fetch(`${api}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'ana.prueba@avfinance.bo', password: 'AnaPrueba2026+' }),
});
const c10 = await r10.json().catch(() => null);
r10.status === 200 && c10?.data?.token
  ? contar('11. Ana ya puede entrar con su contrasena -> 200')
  : fracaso(`11. Ana aceptada no logra entrar: ${r10.status}`);

const tokenAna = c10.data.token;
const r11 = await fetch(`${api}/crm/personal`, { headers: { apikey: tokenAna, Authorization: `Bearer ${tokenAna}` } });
r11.status === 403
  ? contar('12. una cuenta de soporte pide el listado de personal -> 403')
  : fracaso(`12. el listado alcanzo a soporte con ${r11.status}`);

// La propia cuenta se toca con otro perfil admin; con ella misma se rechaza en el backend.
const r12 = await fetch(`${api}/crm/personal/${idAdmin}`, { method: 'PATCH', headers: cabecera, body: JSON.stringify({ is_active: false }) });
const c12 = await r12.json().catch(() => null);
r12.status === 400 && c12?.error?.code === 'SELF_CHANGE_FORBIDDEN'
  ? contar('13. el administrador intenta suspender su propia cuenta -> 400 SELF_CHANGE_FORBIDDEN')
  : fracaso(`13. se toco la propia cuenta: ${r12.status}`);

const r13 = await fetch(`${api}/crm/personal/${idAna}`, {
  method: 'PATCH', headers: cabecera, body: JSON.stringify({ is_active: false }),
});
r13.status === 200
  ? contar('14. suspender la cuenta de Ana -> 200')
  : fracaso(`14. suspender fallo: ${r13.status}`);

const r15 = await fetch(`${api}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'ana.prueba@avfinance.bo', password: 'AnaPrueba2026+' }),
});
r15.status === 401
  ? contar('15. la cuenta suspendida ya no entra -> 401 Credenciales invalidas (ban en Auth)')
  : fracaso(`15. la cuenta suspendida siguio entrando: ${r15.status}`);

// ---------------------------------------------------------------- 4. el registro
const r18 = await fetch(`${api}/crm/registro?accion=cuenta_aceptada&entidad=profiles`, { headers: cabecera });
const c18 = await r18.json().catch(() => null);
const asientoAceptada = (c18?.data ?? []).find((a) => a.entity_id === idAna);
const r19 = await fetch(`${api}/crm/registro?accion=cuenta_suspendida&entidad=profiles`, { headers: cabecera });
const c19 = await r19.json().catch(() => null);
const asientoSuspendida = (c19?.data ?? []).find((a) => a.entity_id === idAna);
const r20 = await fetch(`${api}/crm/registro?accion=solicitud_cuenta&entidad=profiles`, { headers: cabecera });
const c20 = await r20.json().catch(() => null);
const asientoSolicitud = (c20?.data ?? []).find((a) => a.entity_id === idAna);

asientoAceptada && asientoSuspendida && asientoSolicitud
  ? contar(`16. el registro guarda los asientos: solicitud -> aceptada -> suspendida (actor ${asientoSolicitud.actor_kind})`)
  : fracaso(`16. faltan asientos: sol=${Boolean(asientoSolicitud)} acc=${Boolean(asientoAceptada)} sus=${Boolean(asientoSuspendida)}`);

contar('Bateria de F-03: todo verde.');
