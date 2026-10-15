/**
 * Ficha de Validación Institucional de Debida Diligencia ECP ASFI
 * Basado en PDFKit y QRCode
 * AV Finance S.R.L.
 */

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface DueDiligenceReportData {
  companyName: string;
  taxIdNIT: string;
  seprecNumber: string;
  legalRep: string;
  riskScore: number;
  asfiStatus: string;
  verifiedAt: string;
  itemsVerified: string[];
}

export class ComplianceReportGenerator {
  public async generateReportPdf(data: DueDiligenceReportData): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        const qrDataUrl = await QRCode.toDataURL(`ASFI-ECP-VERIFIED:${data.taxIdNIT}:${data.verifiedAt}`, { width: 100 });
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

        doc.rect(40, 40, 515, 50).fill('#0B1E36');
        doc.fillColor('#FFFFFF').fontSize(14).text('FICHA DE DEBIDA DILIGENCIA INSTITUCIONAL', 55, 52);
        doc.fontSize(9).fillColor('#F3D014').text('AV FINANCE S.R.L. - ENTORNO CONTROLADO DE PRUEBAS (ECP) ASFI', 55, 70);

        doc.fillColor('#0B1E36').fontSize(10);
        doc.text(`Empresa: ${data.companyName}`, 50, 110);
        doc.text(`NIT: ${data.taxIdNIT}`, 50, 125);
        doc.text(`Matrícula SEPREC: ${data.seprecNumber}`, 50, 140);
        doc.text(`Representante Legal: ${data.legalRep}`, 50, 155);
        doc.text(`Calificación de Riesgo: ${data.asfiStatus} (${data.riskScore}/100)`, 50, 170);

        doc.text('Requisitos Verificados en Expediente ECP:', 50, 200, { underline: true });
        let y = 220;
        for (const item of data.itemsVerified) {
          doc.text(`[OK] ${item}`, 60, y);
          y += 18;
        }

        doc.image(qrBuffer, 420, 105, { width: 90, height: 90 });
        doc.rect(40, 500, 515, 30).fill('#F4F6F9');
        doc.fillColor('#555555').fontSize(8).text(
          'Documento oficial emitido bajo supervisión de ASFI en el Entorno Controlado de Pruebas. Custodia institucional garantizada.',
          50, 510, { align: 'center', width: 495 }
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

export default new ComplianceReportGenerator();
