import { createHash } from 'node:crypto';
import { supabase, clientForToken, isScopedReadConfigured } from '../config/supabase.js';

// Legajo de documentos (F-18). El fisico vive en el cubo "expedientes" de Supabase Storage y los
// metadatos en la tabla public.documents. Este modulo es los dos extremos del camino:
//
//   1. Subir: el archivo viaja en base64 desde la pantalla, se valida forma y tamano, se calcula
//      su checksum sha256, se sube al cubo CON EL TOKEN DEL USUARIO (las politicas de Storage de
//      0005 son la puerta, no un atajo de llave de servicio) y se escribe la fila de metadatos.
//      Cada subida deja su asiento "documento_subido" en el registro.
//   2. Descargar: devolver el archivo con su nombre y su tipo de contenido. La lectura del cubo
//      la limitan las politicas de 0005 (administracion, cumplimiento y operaciones, o el dueño
//      del archivo); ventas y soporte ven ahi el 403 como en todo el CRM.
//
// Guardarrailes duros: mime de la lista del cubo, 10 MB como en documents.size_bytes, y el
// requisito tiene que existir en la plantilla de casillas de esa cuenta. Nada inventado: si no
// coincide, la peticion muere con el motivo en la cara.

const BUCKET = 'expedientes';
const LIMITE_BYTES = 10 * 1024 * 1024;
const MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  err.code = code ?? 'BAD_REQUEST';
  return err;
}

function tokenDeSesion(req) {
  const header = req?.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

// El nombre del archivo viaja al cubo tal cual lo puso el cliente, pero pulido: sin rutas, sin
// controles y truncado. Unicode de letras queda: el nombre es de la persona, no del sistema.
function limpiaNombre(nombre) {
  const cadena = String(nombre ?? '').trim();
  const enolados = cadena.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (enolados.length < 3) throw httpError(400, 'El nombre del archivo necesita al menos 3 caracteres.', 'INVALID_VALUE');
  return enolados.slice(0, 150);
}

// Cada segmento del path se codifica por separado: las barras separan, el resto se codifica.
function pathAlCubo(binario) {
  return binario.split('/').map(encodeURIComponent).join('/');
}

export async function subir(req, clientId, cuerpo) {
  if (!isScopedReadConfigured() || !supabase) {
    throw httpError(503, 'Sin base ni cubo configurados: no se pueden subir documentos.', 'DATA_LAYER_NOT_CONFIGURED');
  }
  const usuario = { id: req.user?.id, email: req.user?.email };
  if (!usuario.id) throw httpError(401, 'Sesion sin usuario reconocido', 'UNAUTHENTICATED');

  const requisito = String(cuerpo?.requirement_code ?? '').trim();
  const nombre = limpiaNombre(cuerpo?.filename);
  const mime = String(cuerpo?.mime_type ?? '').trim();
  const vence = String(cuerpo?.expires_on ?? '').trim();

  if (!requisito) throw httpError(400, 'Falta el requisito al que responde el documento.', 'INVALID_VALUE');
  if (!MIMES.has(mime)) {
    throw httpError(400, `El tipo "${mime || 'desconocido'}" no esta permitido por el cubo: pdf, png, jpeg, doc o docx.`, 'INVALID_MIME');
  }
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) {
    throw httpError(400, 'La fecha de vencimiento debe tener forma AAAA-MM-DD o ir vacia.', 'INVALID_VALUE');
  }

  const archivo = Buffer.from(String(cuerpo?.content_base64 ?? '').replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (archivo.length === 0) throw httpError(400, 'El archivo llego vacio: revisa el adjunto.', 'EMPTY_FILE');
  if (archivo.length > LIMITE_BYTES) {
    throw httpError(413, `El archivo pesa ${Math.ceil(archivo.length / 1048576)} MB y el cubo admite 10 MB.`, 'FILE_TOO_LARGE');
  }
  const { error: errCliente } = await clientForToken(tokenDeSesion(req))
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();
  if (errCliente) throw httpError(502, `lectura del cliente: ${errCliente.message}`, 'DB_ERROR');
  const { data: casilla, error: errCasilla } = await clientForToken(tokenDeSesion(req))
    .from('document_reviews')
    .select('requirement_code, status')
    .eq('client_id', clientId)
    .eq('requirement_code', requisito)
    .maybeSingle();
  if (errCasilla) throw httpError(502, `lectura del requisito: ${errCasilla.message}`, 'DB_ERROR');
  if (!casilla) {
    throw httpError(400, `La cuenta no tiene la casilla "${requisito}" en su plantilla de requisitos.`, 'REQUISITO_NO_ENCONTRADO');
  }

  const checksum = createHash('sha256').update(archivo).digest('hex');
  const idCache = Date.now().toString(36);
  const path = `${clientId}/${requisito}/${idCache}-${limpiaNombre(cuerpo?.filename)}`;

  // La subida al cubo va con el token del que sube: la politica expedientes_upload de 0005 hace
  // de guarda, y su hermana de lectura deja ver al que sube el archivo que acabo de escribir
  // (Storage exige poder leer la fila que inserto, por eso existe la segunda rama de la politica).
  const resp = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${pathAlCubo(path)}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${tokenDeSesion(req)}`,
      'content-type': mime,
      'x-upsert': 'false',
    },
    body: archivo,
  });
  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    const motivolimpio = texto.includes('row-level security') || texto.includes('permission')
      ? 'El cubo rechazo la subida por seguridad de nivel de fila: faltan las politicas de Storage de 0005 en el panel.'
      : texto.slice(0, 200);
    throw httpError(502, `El cubo no acepto el archivo: ${motivolimpio}`, 'STORAGE_UPLOAD_ERROR');
  }

  const fila = {
    client_id: clientId,
    requirement_code: requisito,
    filename: nombre,
    storage_bucket: BUCKET,
    storage_path: path,
    mime_type: mime,
    size_bytes: archivo.length,
    checksum,
    expires_on: vence || null,
    uploaded_by: usuario.id,
    review_status: 'Pendiente',
  };
  const { data: escrita, error: errRow } = await clientForToken(tokenDeSesion(req))
    .from('documents')
    .insert(fila)
    .select('*')
    .single();
  if (errRow) {
    // La fila no se escribio pero el archivo quedo en el cubo: se limpia con la llave de servicio
    // para no dejar un trozo huerfano. El fallo original se cuenta igual.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw httpError(502, `El archivo subio al cubo pero sus metadatos no: ${errRow.message}`, 'PARTIAL_UPLOAD');
  }

  const { error: errAsiento } = await clientForToken(tokenDeSesion(req)).from('audit_events').insert({
    actor: usuario.email,
    actor_id: usuario.id,
    actor_kind: 'humano',
    action: 'documento_subido',
    entity_type: 'documents',
    entity_id: escrita.id,
    detail: `${requisito} · ${nombre} (${archivo.length} bytes · sha256 ${checksum.slice(0, 16)}...)`,
    outcome: 'exito',
  });
  if (errAsiento) throw httpError(502, `El documento quedo subido pero el asiento no se escribio: ${errAsiento.message}`, 'DB_ERROR');

  return escrita;
}

export async function contenido(req, id) {
  if (!isScopedReadConfigured()) {
    throw httpError(503, 'Falta la configuracion de lectura del cubo.', 'READ_NOT_CONFIGURED');
  }
  const { data: fila, error: errRow } = await clientForToken(tokenDeSesion(req))
    .from('documents')
    .select('id, filename, storage_bucket, storage_path, mime_type, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (errRow) throw httpError(502, `lectura del documento: ${errRow.message}`, 'DB_ERROR');
  if (!fila || fila.deleted_at) throw httpError(404, 'Ese documento no existe en el legajo.', 'NOT_FOUND');

  const objeto = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${fila.storage_bucket}/${pathAlCubo(fila.storage_path)}`,
    { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tokenDeSesion(req)}` } },
  );
  if (!objeto.ok) {
    const texto = await objeto.text().catch(() => '');
    let cuerpo = {};
    try { cuerpo = JSON.parse(texto); } catch { /* respuesta no JSON: cae en el mapa de abajo */ }
    // Storage contesta fuera con el HTTP 400 de_services y adentro el codigo de verdad: por eso
    // el codigo del cuerpo manda sobre el status de la paginacion.
    if (cuerpo?.code === 'NoSuchKey' || cuerpo?.statusCode === 404 || objeto.status === 404) {
      throw httpError(404,
        'Los metadatos del documento estan pero su archivo fisico no esta en el cubo (fila de maqueta sin bytes, o archivo retirado). Regenerelo desde el panel o suba uno nuevo.',
        'ARCHIVO_FALTANTE');
    }
    if (cuerpo?.code === 'AccessDenied' || texto.includes('row-level security') || texto.includes('permission')) {
      throw httpError(403,
        'El cubo de expedientes solo lo leen administracion, cumplimiento y operaciones. Su rol pide el documento a quien lo reviso.',
        'FORBIDDEN');
    }
    throw httpError(502, `El cubo no devolvio el archivo: ${texto.slice(0, 200)}`, 'STORAGE_READ_ERROR');
  }
  const buffer = Buffer.from(await objeto.arrayBuffer());
  if (buffer.length === 0) throw httpError(404, 'El cubo respondio sin contenido para ese documento.', 'NOT_FOUND');
  return { buffer, mime: fila.mime_type ?? 'application/octet-stream', filename: fila.filename };
}
