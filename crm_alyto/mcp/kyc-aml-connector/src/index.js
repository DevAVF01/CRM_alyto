import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const RESTRICTIVE_LIST = [
  { name: 'ENTIDAD BLOQUEADA EJEMPLO A', source: 'OFAC', reason: 'Situacion legal restringida' },
  { name: 'PERSONA SANCIONADA EJEMPLO B', source: 'ONU', reason: 'Listado del Consejo de Seguridad' },
  { name: 'GRUPO CORPORATIVO OBSERVADO EJEMPLO C', source: 'UE', reason: 'Medidas restrictivas sectoriales' },
];

const DIRECTRICES_ECP = [
  'Debida diligencia reforzada para clientes institucionales',
  'Verificación de beneficiarios finales (UBO) con umbral del 25%',
  'Cruce con listas restrictivas internacionales: OFAC, ONU y UE',
  'Perfil transaccional declarado y monitoreo continuo',
  'Custodia institucional de activos bajo protocolo multifirma',
  'Trazabilidad completa de operaciones sobre el ledger de Stellar Testnet',
];

const screenings = [];
const auditTrail = [];

function audit(action, detail) {
  auditTrail.push({ at: new Date().toISOString(), action, detail });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kyc-aml-connector', regime: 'Entorno Controlado de Pruebas (ECP) supervisado por la ASFI' });
});

app.post('/screening', (req, res) => {
  const { name, documentId } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: { code: 'INVALID_SCREENING', message: 'name es requerido' } });
  }
  const normalized = String(name).toUpperCase();
  const hits = RESTRICTIVE_LIST.filter((entry) => normalized.includes(entry.name) || entry.name.includes(normalized));
  const result = {
    name,
    documentId: documentId || null,
    match: hits.length > 0,
    hits,
    riskLevel: hits.length > 0 ? 'Alto' : 'Bajo',
    screenedAt: new Date().toISOString(),
  };
  screenings.push(result);
  audit('screening', `Screening de ${name}: ${result.match ? 'coincidencia detectada' : 'sin coincidencias'}`);
  return res.status(201).json({ data: result });
});

app.post('/due-diligence/checklist', (req, res) => {
  const { clientId, items } = req.body || {};
  if (!clientId || !Array.isArray(items)) {
    return res.status(400).json({ error: { code: 'INVALID_CHECKLIST', message: 'clientId e items son requeridos' } });
  }
  const missing = items.filter((item) => !item.status || item.status === 'Pendiente' || item.status === 'Observado');
  audit('checklist_validado', `Checklist de ${clientId}: ${missing.length === 0 ? 'completo' : `${missing.length} elementos pendientes`}`);
  return res.json({
    data: {
      clientId,
      complete: missing.length === 0,
      missing: missing.map((item) => item.key || item.label),
      validatedAt: new Date().toISOString(),
    },
  });
});

app.get('/directrices/asfi-ecp', (req, res) => {
  res.json({
    data: DIRECTRICES_ECP.map((description, index) => ({
      code: `ECP-D${String(index + 1).padStart(2, '0')}`,
      description,
    })),
  });
});

app.get('/screenings', (req, res) => {
  res.json({ data: screenings });
});

app.get('/audit', (req, res) => {
  res.json({ data: auditTrail });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({
    error: { code: 'KYC_AML_CONNECTOR_ERROR', message: err.expose ? err.message : 'Error interno del conector' },
  });
});

const port = Number(process.env.PORT || 4602);
app.listen(port, () => {
  console.log(`[kyc-aml-connector] listo en puerto ${port} | Debida diligencia institucional ECP`);
});
