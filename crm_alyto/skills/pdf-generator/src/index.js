import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export const BRAND = {
  navy: '#0B1E36',
  navySurface: '#1E3653',
  yellow: '#F3D014',
  background: '#F4F6F9',
  text: '#0E131F',
  muted: '#5A6578',
  success: '#10B981',
  alert: '#EF4444',
  stroke: '#E2E8F0',
};

export const LEGAL_LINE = 'AV Finance S.R.L. | Entorno Controlado de Pruebas (ECP) supervisado por la ASFI | Stellar Testnet';
export const TEST_NOTICE = 'Documento de prueba sin valor legal';

function docToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function drawHeader(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 96).fill(BRAND.navy);
  doc.rect(0, 96, doc.page.width, 4).fill(BRAND.yellow);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('alyto', 48, 30);
  doc.fillColor(BRAND.yellow).font('Helvetica-Bold').fontSize(8.5).text('BAJO SUPERVISION DE ASFI (ECP)', 48, 60);
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(11).text(title, 280, 34, { width: 272, align: 'right' });
  doc.fillColor('#CBD5E1').fontSize(8).text(subtitle, 280, 56, { width: 272, align: 'right' });
}

function drawFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.rect(0, doc.page.height - 56, doc.page.width, 56).fill(BRAND.navy);
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(7.5)
      .text(LEGAL_LINE, 40, doc.page.height - 40, { width: doc.page.width - 80, align: 'center' });
    doc.fillColor(BRAND.yellow).font('Helvetica-Bold').fontSize(7.5)
      .text(`${TEST_NOTICE} | Pagina ${i + 1} de ${range.count}`, 40, doc.page.height - 26, { width: doc.page.width - 80, align: 'center' });
  }
}

export async function buildTransferReceiptPdf({
  operationId = 'N/D',
  client = 'N/D',
  beneficiary = 'N/D',
  amountUsd = 0,
  asset = 'USDC',
  network = 'Stellar Testnet',
  stellarHash = '',
  status = 'En Proceso',
  authorizedBy = 'Oficial de Operaciones',
  createdAt = new Date().toISOString(),
} = {}) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    bufferPages: true,
    info: { Title: `Comprobante ${operationId}`, Author: 'Alyto CRM | AV Finance S.R.L.' },
  });
  drawHeader(doc, 'Comprobante de Transferencia Internacional', `Operacion ${operationId}`);

  const qrDataUrl = await QRCode.toDataURL(
    JSON.stringify({ op: operationId, hash: stellarHash, network }),
    { margin: 0, width: 220, color: { dark: BRAND.navy, light: '#FFFFFF' } },
  );

  let y = 140;
  doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(12).text('Detalle de la operacion', 48, y);
  y += 24;

  const rows = [
    ['Cliente institucional', client],
    ['Beneficiario', beneficiary],
    ['Monto', `${Number(amountUsd).toLocaleString('es-BO', { minimumFractionDigits: 2 })} ${asset}`],
    ['Red de liquidacion', network],
    ['Estado', status],
    ['Autorizado por', authorizedBy],
    ['Fecha de emision', createdAt],
    ['Hash Stellar', stellarHash || 'Pendiente de confirmacion'],
  ];

  rows.forEach(([label, value], index) => {
    if (index % 2 === 0) doc.rect(48, y - 4, doc.page.width - 96, 20).fill(BRAND.background);
    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(9).text(label, 56, y);
    doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(9).text(String(value ?? 'N/D'), 220, y, { width: doc.page.width - 300 });
    y += 20;
  });

  y += 28;
  doc.image(qrDataUrl, doc.page.width / 2 - 55, y, { width: 110 });
  y += 132;
  doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8)
    .text('Verifique la trazabilidad de esta transferencia internacional escaneando el codigo QR en el explorador del ledger de Stellar Testnet.', 48, y, { width: doc.page.width - 96, align: 'center' });

  drawFooter(doc);
  return docToBuffer(doc);
}

export async function buildValidationSheetPdf({
  clientName = 'N/D',
  clientId = 'N/D',
  items = [],
  score = 'N/D',
  auditor = 'Oficial de Cumplimiento',
} = {}) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    bufferPages: true,
    info: { Title: `Ficha de validacion ${clientId}`, Author: 'Alyto CRM | AV Finance S.R.L.' },
  });
  drawHeader(doc, 'Ficha de Validacion de Debida Diligencia', `Expediente ${clientId}`);

  let y = 136;
  doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(12).text(`Cliente: ${clientName}`, 48, y);
  doc.fillColor(BRAND.muted).font('Helvetica').fontSize(9)
    .text(`Indice global de cumplimiento: ${score} | Emitido por: ${auditor}`, 48, y + 20);
  y += 52;

  items.forEach((item, index) => {
    if (y > doc.page.height - 96) {
      doc.addPage();
      y = 72;
    }
    if (index % 2 === 0) doc.rect(48, y - 4, doc.page.width - 96, 20).fill(BRAND.background);
    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8.5).text(String(index + 1).padStart(2, '0'), 56, y);
    doc.fillColor(BRAND.text).font('Helvetica').fontSize(8.5).text(item.label, 88, y, { width: 310 });
    const color = item.status === 'Aprobado' ? BRAND.success : item.status === 'Observado' ? BRAND.alert : '#B45309';
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8.5).text(item.status, 410, y, { width: doc.page.width - 470, align: 'right' });
    y += 20;
  });

  drawFooter(doc);
  return docToBuffer(doc);
}
