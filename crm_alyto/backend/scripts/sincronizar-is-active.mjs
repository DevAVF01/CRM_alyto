import 'dotenv/config';

// F-03 sincroniza la verdad de las cuentas: los cuatro usuarios que se suspendieron en Auth el
// 29/10 siguen con su perfil is_active=true, y la pantalla de Personal los mostraria como activos
// cuando en realidad no pueden entrar. Este script lee el ban de Auth (llave de servicio) y baja
// is_active=false en profiles para quien esta suspendido. No toca al administrador.
const url = process.env.SUPABASE_URL;
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(url, llave, { auth: { persistSession: false } });

const { data: lista, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (error) {
  console.error(`No se pudo leer el panel de accesos: ${error.message}`);
  process.exit(1);
}

for (const usuario of lista.users) {
  const suspendido = Boolean(usuario.banned_until) && new Date(usuario.banned_until) > new Date();
  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, email, is_active')
    .eq('id', usuario.id)
    .maybeSingle();
  if (!perfil) continue;
  if (suspendido && perfil.is_active) {
    const { error: err } = await supabase.from('profiles').update({ is_active: false })
      .eq('id', perfil.id);
    if (err) console.error(`${perfil.email}: no se pudo poner pendiente: ${err.message}`);
    else console.log(`${perfil.email}: perfil bajado a pendiente (estaba suspendido en Auth)`);
  } else if (!suspendido && !perfil.is_active) {
    console.log(`${perfil.email}: activo en Auth pero pendiente en profiles -- el administrador lo consolidara desde la pantalla`);
  } else {
    console.log(`${perfil.email}: coherente (${suspendido ? 'suspendido' : 'activo'})`);
  }
}
console.log('Sincronizacion terminada.');
