import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Deja vivo el viaje V-03 (tutorial de registro incompleto) haciendo el mismo INSERT que la
// migracion 0009_motor_v03_tutorial.sql. Sirve para no pedir un paso en el panel cuando solo
// faltan datos: la migracion queda igual en el repo para las instalaciones nuevas, y este
// script es su ejecucion aqui y ahora. Identempotente: el on conflict actuliza, no duplica.

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY: no se puede instalar nada.');
  process.exit(1);
}

const base = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const viaje = {
  id: '00000000-0000-4000-8000-000000000303',
  code: 'V-03',
  name: 'Registro incompleto: tutorial de acceso',
  description: 'Un toque cuando el legajo entra con datos incompletos: mensaje de tutorial con la plantilla de bienvenida para que el usuario complete su registro en alyto.io.',
  audience: 'persona_natural',
  trigger_signal: 'datos_incompletos',
  is_active: true,
};

const paso = {
  id: '00000000-0000-4000-8000-000000000323',
  journey_id: viaje.id,
  step_order: 1,
  day_number: 1,
  channel: 'whatsapp',
  template_code: 'BIENVENIDA_NATURAL',
  template_version: 1,
  description: 'Tutorial: como completar el registro en alyto.io, con indicaciones para subir lo que falta.',
};

{
  const { error } = await base.from('journeys').upsert(viaje, { onConflict: 'id' });
  if (error) { console.error(`viaje V-03: ${error.message}`); process.exit(1); }
}
{
  const { error } = await base.from('journey_steps').upsert(paso, { onConflict: 'id' });
  if (error) { console.error(`paso de V-03: ${error.message}`); process.exit(1); }
}

const { data: chequein } = await base.from('journeys')
  .select('code, name, trigger_signal')
  .in('code', ['V-01', 'V-02', 'V-03'])
  .eq('is_active', true);
for (const j of chequein ?? {}) console.log(`${j.code} · ${j.name} · senal: ${j.trigger_signal ?? 'manual'}`);
console.log('V-03 instalado: el motor ya lo va a leer en su proxima corrida.');
