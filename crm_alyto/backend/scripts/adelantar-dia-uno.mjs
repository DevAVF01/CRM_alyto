import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Adelanta a ahora los toques dia 1 ya previstos por el motor (se crearon con la semantica
// vieja: dia 1 = manana). Corre una sola vez; despues el motor ya usa dia 1 = al inscribir.
const base = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

const ahora = new Date().toISOString();

// Los toques dia 1 pendientes: BIENVENIDA_NATURAL (V-03, tutorial) y REQ_DOCUMENTOS_CORREO
// y SEGUIMIENTO_CONSULTA de V-02 dia 1 si lo hubiera. Por codigo de plantilla del dia 1.
const { data: objetivo } = await base.from('journey_runs')
  .select('id, status, journey_steps ( day_number, template_code ), journey_enrollments ( clients ( display_name ) )')
  .eq('status', 'pendiente');

const diaUno = (objetivo ?? []).filter((r) => r.journey_steps?.day_number === 1);
for (const r of diaUno) {
  const nombre = r.journey_enrollments?.clients?.display_name ?? '?';
  const { error } = await base.from('journey_runs')
    .update({ scheduled_for: ahora })
    .eq('id', r.id);
  console.log(`${error ? 'SIN CAMBIO' : 'ADELANTADO'} · ${r.journey_steps.template_code} · ${nombre}`);
  if (error) console.error(error.message);
}
console.log(`total dia 1 adelantados: ${diaUno.length}`);
