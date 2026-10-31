import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Sondeo rapido para el panel de metricas (F-34): confirma que las vistas candidatas
// responden y de que forma. Se puede borrar despues; no es parte del producto.
const g = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const vistas = ['vw_conversations_sla', 'vw_compliance_progress', 'vw_messages_flagged',
  'vw_claims_sla', 'vw_funnel_by_stage', 'vw_stage_age', 'vw_routes_by_state'];

for (const vista of vistas) {
  const { data, error } = await g.from(vista).select('*').limit(3);
  if (error) {
    console.log(`${vista}: ERROR ${error.message}`);
    continue;
  }
  const columnas = data?.length ? Object.keys(data[0]).join(', ') : '(vacia)';
  console.log(`${vista}: ${data?.length ?? 0} filas de muestra | columnas: ${columnas}`);
}
