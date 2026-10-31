import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Inspeccion de la corrida del motor: inscripciones abiertas, ejecuciones y mensajes
// automaticos de ayer y hoy, para entender exactamente que hizo la corrida automatica.
const base = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

const { data: inscripciones } = await base.from('journey_enrollments')
  .select('id, status, started_at, final_outcome, journeys ( code, name ), clients ( display_name ), signals ( kind, detail )')
  .order('created_at', { ascending: false })
  .limit(8);

console.log('---- inscripciones (mas recientes primero) ----');
for (const e of inscripciones ?? []) {
  console.log(`${e.journeys?.code} · ${e.status} · ${e.clients?.display_name} (senal: ${e.signals?.kind ?? 'ninguna'})`);
}

const { data: runs } = await base.from('journey_runs')
  .select('id, status, scheduled_for, sent_at, error, journey_steps ( step_order, template_code, channel ), journey_enrollments ( clients ( display_name ) )')
  .order('scheduled_for', { ascending: false })
  .limit(14);

console.log('\n---- ejecuciones (por fecha prevista) ----');
for (const r of runs ?? []) {
  const clienteNombre = r.journey_enrollments?.clients?.display_name ?? '?';
  console.log(`${r.status.padEnd(8)} ${r.journey_steps?.template_code ?? '?'} (${r.journey_steps?.channel ?? '?'}) · ${clienteNombre} · prev. ${r.scheduled_for?.slice(0, 16)}${r.error ? ` · error: ${r.error.slice(0, 60)}` : ''}`);
}

const { data: mensajes } = await base.from('messages')
  .select('id, status, automated, status, sent_at, body, conversations ( clients ( display_name ), channel )')
  .eq('automated', true)
  .order('created_at', { ascending: false })
  .limit(6);

console.log('\n---- mensajes automaticos recientes ----');
for (const m of mensajes ?? []) {
  console.log(`${m.status} · ${m.conversations?.clients?.display_name ?? '?'} · ${m.conversations?.channel ?? '?'} · ${m.body.slice(0, 85)}`);
}
