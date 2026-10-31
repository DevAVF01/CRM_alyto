import 'dotenv/config';

// Estado real de origen_fondos y de sus documentos para una cuenta, mas el alta de un remedo:
// si hay un documento del requisito en revision, el administrador puede aprobarlo y con eso la
// casilla vuelve a poder pasar a Aprobado. Eso es lo que la pantalla de documentos (F-18) hara.
const base = 'http://localhost:4000/api';
const cliente = process.argv[2] ?? '00000000-0000-4000-8000-0000000000c5';
const requisito = process.argv[3] ?? 'origen_fondos';

const resp = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@avfinance.bo', password: process.env.ECP_TEST_PASSWORD }),
});
const { token } = (await resp.json()).data;
const cabecera = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const pedir = async (ruta, opciones = {}) => {
  const r = await fetch(`${base}${ruta}`, { ...opciones, headers: { ...cabecera, ...(opciones.headers ?? {}) } });
  return { status: r.status, cuerpo: await r.json().catch(() => null) };
};

const casillas = (await pedir(`/crm/fichas/${cliente}/casillas`)).cuerpo.data;
const laCasilla = casillas.find((c) => c.requirement_code === requisito);
console.log(`casilla ${requisito}: estado en la base = ${laCasilla?.status} (revisada ${laCasilla?.reviewed_at ?? 'nunca'})`);

const documentos = (await pedir(`/crm/fichas/${cliente}/documentos`)).cuerpo.data;
for (const d of documentos) {
  console.log(`documento ${d.requirement_code ?? 'sin requisito'}: ${d.filename} estado ${d.review_status}`);
}

const delRequisito = documentos.find((d) => d.requirement_code === requisito);
if (!delRequisito) {
  console.log(`No hay documento para ${requisito}: sin carga no es posible aprobar la casilla (F-18 por construir).`);
} else if (delRequisito.review_status !== 'Aprobado') {
  const rDoc = await pedir(`/crm/documentos/${delRequisito.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ review_status: 'Aprobado' }),
  });
  console.log(`\nrevision del documento ${delRequisito.id.slice(0, 8)}: HTTP ${rDoc.status} ${rDoc.status === 200 ? 'Aprobado' : rDoc.cuerpo?.error?.message}`);
  if (rDoc.status === 200) {
    const rCasilla = await pedir(`/crm/casillas/${cliente}/${encodeURIComponent(requisito)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Aprobado', detail: 'Aprobado con su documento: seguimiento verificado 29/10' }),
    });
    console.log(`casilla ${requisito} a Aprobado: HTTP ${rCasilla.status} ${rCasilla.status === 200 ? 'ok' : rCasilla.cuerpo?.error?.message}`);
  }
} else {
  console.log(`El documento ya esta Aprobado; la casilla puede pasar a Aprobado sin rechazo.`);
}
