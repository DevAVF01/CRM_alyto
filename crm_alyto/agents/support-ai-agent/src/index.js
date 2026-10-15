const CATALOG = [
  {
    id: 'OBJ-01',
    title: 'Tiempos de liquidación en Stellar',
    keywords: ['tiempo', 'liquidacion', 'demora', 'segundos', 'velocidad', 'rapida', 'rapidez', 'lento'],
    legalBasis: 'Directrices ECP de transparencia operativa',
    response: 'La infraestructura tecnológica sustentada en la red Stellar permite que las operaciones transfronterizas B2B de AV Finance se liquiden en cuestión de segundos, con trazabilidad completa en el ledger público de Stellar Testnet bajo supervisión de la ASFI en el ECP.',
  },
  {
    id: 'OBJ-02',
    title: 'Respaldo regulatorio ASFI',
    keywords: ['regulacion', 'asfi', 'legal', 'supervision', 'respaldado', 'licencia', 'permiso', 'norma'],
    legalBasis: 'Régimen ECP, Resolución ASFI 2024',
    response: 'AV Finance S.R.L. opera bajo supervisión de la ASFI en el Entorno Controlado de Pruebas (ECP). La autorización de funcionamiento se encuentra en proceso, y cada operación test queda registrada y auditada conforme a las directrices del ECP.',
  },
  {
    id: 'OBJ-03',
    title: 'Custodia de fondos',
    keywords: ['custodia', 'fondos', 'seguridad', 'wallet', 'custodial', 'resguardo', 'cuidado'],
    legalBasis: 'Protocolo institucional de custodia AlyPay',
    response: 'Los activos se mantienen en wallets custodiales institucionales bajo protocolo multifirma AlyPay. La custodia institucional garantiza control operativo reforzado, trazabilidad por operación y segregación de fondos de los clientes institucionales.',
  },
  {
    id: 'OBJ-04',
    title: 'Costos operativos y tarifas',
    keywords: ['costo', 'tarifa', 'comision', 'precio', 'fee', 'honorario', 'caro', 'barato'],
    legalBasis: 'Política comercial del ECP',
    response: 'Durante el ECP las condiciones comerciales se estructuran por volumen y frecuencia operativa, con tarifas competitivas frente a la banca tradicional y sin costos ocultos de corresponsalía internacional.',
  },
];

const PROHIBITED_TERMS = [/remesa/i, /non[\s-]?custodial/i, /plataforma de inversi[oó]n/i, /somos los [uú]nicos/i];
const EM_DASH = /\u2014/;

export function verifyConformity(text) {
  if (EM_DASH.test(text)) return { ok: false, reason: 'guion largo no permitido' };
  const hit = PROHIBITED_TERMS.find((re) => re.test(text));
  if (hit) return { ok: false, reason: `termino no autorizado: ${hit}` };
  return { ok: true, reason: 'Sin terminos prohibidos' };
}

export function suggestResponse(input) {
  const text = String(input || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of CATALOG) {
    const score = entry.keywords.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  const selected = best || CATALOG[1];
  const conformity = verifyConformity(selected.response);
  return {
    objectionId: selected.id,
    title: selected.title,
    response: selected.response,
    legalBasis: selected.legalBasis,
    conformity: conformity.ok ? 'Conformidad ASFI: Verificada' : `Revisar: ${conformity.reason}`,
    matchScore: bestScore,
  };
}

export function listObjections() {
  return CATALOG.map(({ id, title, legalBasis }) => ({ id, title, legalBasis }));
}

if (process.argv[2]) {
  const result = suggestResponse(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
} else if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  console.log(JSON.stringify({ agent: 'support-ai-agent', objections: listObjections(), usage: 'node src/index.js "objecion del cliente"' }, null, 2));
}
