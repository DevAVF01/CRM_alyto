import 'dotenv/config';
import { createHash } from 'node:crypto';

// Bateria live de F-18 (legajo de documentos): subida al cubo expedientes con el token del
// usuario, fila de metadatos en documents, asiento documento_subido en el registro, lectura de
// regreso (round-trip sha256) y los cuatro rechazos de forma. No imprime credenciales.
const api = 'http://localhost:4000/api';
const admin = { email: 'admin@avfinance.bo', password: process.env.ECP_TEST_PASSWORD };
if (!admin.password) { console.error('Falta ECP_TEST_PASSWORD.'); process.exit(1); }

const contar = (s) => console.log(s);
const fracaso = (s) => { console.error(s); process.exit(1); };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const rL = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(admin) });
const cL = await rL.json().catch(() => null);
rL.status === 200 && cL?.data?.token ? contar('L. entrada del administrador -> 200\n')
  : fracaso(`L. el administrador no pudo entrar: ${rL.status}`);
const cabecera = { apikey: cL.data.token, Authorization: `Bearer ${cL.data.token}`, 'content-type': 'application/json' };

// Primera cuenta viva de demostracion para colgarle el documento.
const rC = await fetch(`${api}/crm/cuentas`, { headers: cabecera });
const cC = await rC.json().catch(() => null);
rC.status === 200 && Array.isArray(cC?.data) && cC.data.length
  ? null : fracaso('C. no hay cuentas para la prueba');
const cliente = cC.data.find((x) => x.display_name) ?? cC.data[0];
const rF = await fetch(`${api}/crm/fichas/${cliente.id}`, { headers: cabecera });
const cF = await rF.json().catch(() => null);
rF.status === 200 ? null : fracaso(`F. la ficha fallo: ${rF.status} ${JSON.stringify(cF?.error)}`);
const casillas = cF.data.casillas ?? [];
const requisito = casillas[0]?.requirement_code;
requisito ? null : fracaso('F. la cuenta no tiene casillas en su plantilla');
contar(`F. cuenta ${cliente.display_name} · casilla "${requisito}"`);

const archivo = Buffer.from(
  '%PDF-1.4\n% examen del legajo de Alyto CRM (F-18) en el cubo expedientes\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'
    + '0'.repeat(2048), 'utf8');
const base64 = archivo.toString('base64');

const r1 = await fetch(`${api}/crm/fichas/${cliente.id}/documentos`, {
  method: 'POST', headers: cabecera,
  body: JSON.stringify({ requirement_code: requisito, filename: 'cedula-prueba.pdf', mime_type: 'application/pdf', content_base64: base64 }),
});
const c1 = await r1.json().catch(() => null);
r1.status === 201 && c1?.data?.id
  ? contar(`1. subida valid pdf -> 201 (fila ${c1.data.id.slice(0, 8)}, ${c1.data.size_bytes} bytes, estado ${c1.data.review_status})`)
  : fracaso(`1. la subida fallo: ${r1.status} ${JSON.stringify(c1?.error ?? c1)}`);
const fila = c1.data;
fila.checksum === sha256(archivo)
  ? contar('2. checksum sha256 de la fila coincide con el archivo enviado')
  : fracaso(`2. checksum distinto: ${fila.checksum}`);

const r3 = await fetch(`${api}/crm/documentos/${fila.id}/contenido`, { headers: cabecera });
if (r3.status !== 200) {
  const cuerpo = await r3.text().catch(() => '');
  fracaso(`3. la lectura del cubo fallo: ${r3.status} ${cuerpo.slice(0, 200)}`);
}
const devuelto = Buffer.from(await r3.arrayBuffer());
devuelto.equals(archivo)
  ? contar(`3. round-trip del contenido: ${devuelto.length} bytes identicos (${r3.headers.get('content-type')})`)
  : fracaso(`3. el archivo volvio distinto: ${devuelto.length} bytes`);

const r4 = await fetch(`${api}/crm/fichas/${cliente.id}`, { headers: cabecera });
const c4 = await r4.json().catch(() => null);
const lista = (r4.status === 200 ? c4?.data?.documentos : null) ?? [];
const enFicha = lista.some((d) => d.id === fila.id);
enFicha ? contar('4. la ficha vuelve con el documento nuevo en el bloque Documentos')
  : fracaso('4. el documento no aparece en la ficha tras la subida');

// Los asientos de la prueba viven en el registro.
const r5 = await fetch(`${api}/crm/registro?accion=documento_subido`, { headers: cabecera });
const c5 = await r5.json().catch(() => null);
const asiento = (c5?.data ?? []).find((a) => a.entity_id === fila.id);
asiento ? contar('5. asiento documento_subido en el registro')
  : fracaso('5. no aparecio el asiento documento_subido');

// Requisito que no existe en la plantilla de esa cuenta -> 400, no fabrication.
const r6 = await fetch(`${api}/crm/fichas/${cliente.id}/documentos`, {
  method: 'POST', headers: cabecera,
  body: JSON.stringify({ requirement_code: 'requisito_falso', filename: 'falso.pdf', mime_type: 'application/pdf', content_base64: base64 }),
});
const c6 = await r6.json().catch(() => null);
r6.status === 400 && c6?.error?.code === 'REQUISITO_NO_ENCONTRADO'
  ? contar('6. requisito fuera de la plantilla -> 400 REQUISITO_NO_ENCONTRADO')
  : fracaso(`6. le requisito falso paso: ${r6.status} ${JSON.stringify(c6?.error)}`);

// Mime fuera de la lista del cubo -> 400.
const r7 = await fetch(`${api}/crm/fichas/${cliente.id}/documentos`, {
  method: 'POST', headers: cabecera,
  body: JSON.stringify({ requirement_code: requisito, filename: 'Programa.zip', mime_type: 'application/zip', content_base64: base64 }),
});
const c7 = await r7.json().catch(() => null);
r7.status === 400 && c7?.error?.code === 'INVALID_MIME'
  ? contar('7. mime application/zip -> 400 INVALID_MIME')
  : fracaso(`7. el zip paso: ${r7.status} ${JSON.stringify(c7?.error)}`);

// Archivo vacio -> 400.
const r8 = await fetch(`${api}/crm/fichas/${cliente.id}/documentos`, {
  method: 'POST', headers: cabecera,
  body: JSON.stringify({ requirement_code: requisito, filename: 'vacio.pdf', mime_type: 'application/pdf', content_base64: '' }),
});
r8.status === 400
  ? contar('8. archivo vacio -> 400')
  : fracaso(`8. el archivo vacio paso: ${r8.status}`);

// Peso: 11 MB de bytes reales son ~14.7 MB en base64, por encima del limite del cubo y del parser.
const grande = Buffer.alloc(11 * 1024 * 1024, 7);
const r9 = await fetch(`${api}/crm/fichas/${cliente.id}/documentos`, {
  method: 'POST', headers: cabecera,
  body: JSON.stringify({ requirement_code: requisito, filename: 'pesado.pdf', mime_type: 'application/pdf', content_base64: grande.toString('base64') }),
});
r9.status === 413 || r9.status === 400
  ? contar(`9. archivo de 11 MB -> ${r9.status} rechazado`)
  : fracaso(`9. el archivo pesado paso: ${r9.status}`);

contar('\nBateria de F-18: todo verde.');
