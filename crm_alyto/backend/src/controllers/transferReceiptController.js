import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export const transferReceiptController = {
  generateReceipt: async (req, res) => {
    try {
      const {
        receiptNumber = 'REC-2026-0089',
        clientCompanyName = 'Minera & Metales del Sur S.A.',
        clientNIT = '8392019482',
        sourceAmountBob = 348000,
        destinationAmountUsd = 50000,
        exchangeRate = 6.96,
        serviceFeeBob = 850,
        stellarTestnetTxHash = '0x81b7a2d3c94f08e1a53b7c2901a8f94e2b6d1c8a0f9e3a7b5d2c4e1f8a9b0c2d',
        beneficiaryName = 'Mining Heavy Equipment Corp',
        beneficiaryBank = 'Bank of America Charlotte',
        beneficiaryCountry = 'Estados Unidos',
        timestamp = new Date().toISOString()
      } = req.body;

      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Comprobante_${receiptNumber}.pdf`);
        res.send(pdfData);
      });

      // QR Code
      const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${stellarTestnetTxHash}`;
      const qrDataUrl = await QRCode.toDataURL(explorerUrl, { width: 120, margin: 1 });
      const qrImageBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

      const colorPrimary = '#0B1E36';
      const colorSecondary = '#1E3653';
      const colorAccent = '#F3D014';
      const colorGray = '#555555';

      // Header
      doc.rect(40, 40, 515, 60).fill(colorPrimary);
      doc.fillColor('#FFFFFF').fontSize(16).text('AV FINANCE S.R.L.', 55, 52, { bold: true });
      doc.fontSize(10).fillColor(colorAccent).text('Solución de Transferencias Internacionales B2B', 55, 72);
      doc.fontSize(8).fillColor('#FFFFFF').text('Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI', 55, 84);

      doc.fillColor('#FFFFFF').fontSize(11).text('COMPROBANTE OFICIAL', 380, 52, { align: 'right' });
      doc.fontSize(10).fillColor(colorAccent).text(`N°: ${receiptNumber}`, 380, 68, { align: 'right' });

      // Remitente
      doc.rect(40, 115, 515, 20).fill(colorSecondary);
      doc.fillColor('#FFFFFF').fontSize(10).text('DATOS DE LA EMPRESA REMITENTE (B2B)', 50, 120);

      doc.fillColor(colorPrimary).fontSize(9);
      doc.text(`Razón Social: ${clientCompanyName}`, 50, 145);
      doc.text(`NIT: ${clientNIT}`, 50, 160);
      doc.text(`Fecha y Hora de Emisión: ${new Date(timestamp).toLocaleString('es-BO')}`, 50, 175);
      doc.text(`Modalidad: Custodia Institucional en Stellar Testnet`, 50, 190);

      // Liquidación
      doc.rect(40, 215, 515, 20).fill(colorSecondary);
      doc.fillColor('#FFFFFF').fontSize(10).text('LIQUIDACIÓN Y DETALLE DE LA OPERACIÓN', 50, 220);

      doc.fillColor(colorPrimary).fontSize(9);
      doc.text(`Monto Origen: BOB ${Number(sourceAmountBob).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`, 50, 245);
      doc.text(`Tipo de Cambio Aplicado: ${Number(exchangeRate).toFixed(4)} BOB/USD`, 50, 260);
      doc.text(`Comisión por Servicio ECP: BOB ${Number(serviceFeeBob).toFixed(2)}`, 50, 275);
      doc.text(`Monto Destino a Acreditar: USD ${Number(destinationAmountUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 50, 290);

      // Beneficiario
      doc.rect(40, 315, 515, 20).fill(colorSecondary);
      doc.fillColor('#FFFFFF').fontSize(10).text('DATOS DEL BENEFICIARIO EN DESTINO', 50, 320);

      doc.fillColor(colorPrimary).fontSize(9);
      doc.text(`Nombre / Razón Social: ${beneficiaryName}`, 50, 345);
      doc.text(`Entidad Bancaria Destino: ${beneficiaryBank}`, 50, 360);
      doc.text(`País Destino: ${beneficiaryCountry}`, 50, 375);

      // Stellar Testnet & QR
      doc.rect(40, 400, 515, 125).lineWidth(1).stroke(colorSecondary);
      doc.fillColor(colorSecondary).fontSize(10).text('TRAZABILIDAD CRIPTOGRÁFICA EN STELLAR TESTNET', 50, 410);

      doc.fontSize(8).fillColor(colorGray);
      doc.text('Hash de Transacción en Ledger:', 50, 430);
      doc.fillColor(colorPrimary).text(stellarTestnetTxHash, 50, 442, { width: 340 });

      doc.fillColor(colorGray).fontSize(8).text(
        'Escanee el código QR para validar la transacción directamente en el explorador público de Stellar Testnet.',
        50,
        475,
        { width: 340 }
      );

      doc.image(qrImageBuffer, 410, 410, { width: 110, height: 110 });

      // Footer Legal ECP
      doc.rect(40, 540, 515, 45).fill('#F4F6F9');
      doc.fillColor('#555555').fontSize(7.5).text(
        'AV Finance S.R.L. opera en el Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI. ' +
        'Este comprobante digital certifica la transferencia internacional realizada mediante tecnología Stellar Testnet con custodia institucional. ' +
        'Válido para fines de auditoría y conciliación corporativa.',
        48,
        548,
        { width: 495, align: 'center' }
      );

      doc.end();
    } catch (error) {
      res.status(500).json({ error: 'Error generando comprobante PDF', detail: error.message });
    }
  }
};
