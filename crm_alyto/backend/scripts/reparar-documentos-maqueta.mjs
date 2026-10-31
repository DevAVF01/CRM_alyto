import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Las filas de maqueta del seed (demo/valle/identidad.pdf y compania) tienen metadatos en
// public.documents pero sus bytes nunca vivieron en el cubo: la pantalla Abrir rendia 404. Este
// script genera un PDF minimo pero real (una pagina, con el nombre del documento y su aclaracion
// de maqueta del ECP), lo sube al cubo exactamente en el storage_path que la fila ya tiene, y deja
// su asiento documento_reparado en el registro. Idempotente: si el objeto ya existe, se salta.
const gestion = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

// Construye un PDF de una pagina con el texto pedido. Sin librerias: el bloque de AFL de offsets
// se calcula a mano, que es lo unico delicado de un PDF valido.
function pdfMaqueta(lineas) {
  const escapado = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const contenido = lineas
    .map((linea, indice) => `BT /F1 ${indice === 0 ? 16 : 11} Tf 56 ${760 - indice * 24} Td (${escapado(linea)}) Tj ET`)
    .join('\n');
  const bloques = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(contenido, 'utf8')} >>\nstream\n${contenido}\nendstream`,
  ];
  let cuerpo = '%PDF-1.4\n';
  const offsets = [];
  bloques.forEach((bloque, n) => {
    offsets.push(Buffer.byteLength(cuerpo, 'utf8'));
    cuerpo += `${n + 1} 0 obj\n${bloque}\nendobj\n`;
  });
  const aixRef = Buffer.byteLength(cuerpo, 'utf8');
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (const desplazamiento of offsets) xref += `${String(desplazamiento).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${aixRef}\n%%EOF`;
  return Buffer.from(cuerpo + xref, 'utf8');
}

const { data: filas, error } = await gestion.from('documents').select('id, filename, storage_bucket, storage_path, mime_type, size_bytes');
if (error) { console.error(`lectura de documents: ${error.message}`); process.exit(1); }

const hoy = new Date().toISOString().slice(0, 10);
let reparados = 0;
let yaVivos = 0;

for (const fila of filas) {
  // Consulta barata de existencia: pedir solo la cabecera del objeto con la llave de servicio.
  const sondeo = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${fila.storage_bucket}/${fila.storage_path.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  if (sondeo.ok) { yaVivos += 1; continue; }

  const pdf = pdfMaqueta([
    'Alyto CRM - documento de maqueta (Entorno Controlado de Pruebas, ASFI)',
    `Archivo: ${fila.filename}`,
    `Fila del legajo: ${fila.storage_path}`,
    'Este PDF de relleno existe para que las filas de demostración del seed',
    'tengan su archivo en el cubo y la pantalla Abrir funcione de verdad (F-18).',
    `Rellenado: ${hoy}`,
  ]);

  const { error: errSubida } = await gestion.storage.from(fila.storage_bucket)
    .upload(fila.storage_path, pdf, {
      contentType: fila.mime_type ?? 'application/pdf',
      upsert: true,
      metadata: { reparado_de_maqueta: 'true' },
    });
  if (errSubida) { console.error(`${fila.storage_path}: ${errSubida.message}`); continue; }

  const { error: errAsiento } = await gestion.from('audit_events').insert({
    actor: 'Reparador de maqueta',
    actor_id: null,
    actor_kind: 'sistema',
    action: 'documento_reparado',
    entity_type: 'documents',
    entity_id: fila.id,
    detail: `${fila.storage_path} nacio sin bytes: el cubo recibio su PDF de maqueta (${pdf.length} bytes).`,
    outcome: 'exito',
  });
  if (errAsiento) console.error(`asiento de ${fila.storage_path}: ${errAsiento.message}`);
  reparados += 1;
}

console.log(`Documentos vivos: ${yaVivos} · rellenados: ${reparados} · total filas: ${filas.length}`);
