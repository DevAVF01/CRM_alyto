/**
 * Generador de Comprobantes de Transferencia Internacional
 * Basado en PDFKit y QRCode
 * AV Finance S.R.L. - Entorno Controlado de Pruebas (ECP) de ASFI
 */

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Readable } from 'stream';

export interface TransferReceiptData {
  receiptNumber: string;
  clientCompanyName: string;
  clientNIT: string;
  sourceAmountBob: number;
  destinationAmountUsd: number;
  exchangeRate: number;
  serviceFeeBob: number;
  stellarTestnetTxHash: string;
  beneficiaryName: string;
  beneficiaryBank: string;
  beneficiaryCountry: string;
  timestamp: string;
}

export class TransferReceiptGenerator {
  /**
   * Genera un comprobante en PDF con QR dinámico de trazabilidad en Stellar Testnet
   */
  public async generateReceiptPdf(data: TransferReceiptData): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Comprobante de Transferencia Internacional - ${data.receiptNumber}`,
            Author: 'AV Finance S.R.L. (ECP ASFI)',
            Subject: 'Comprobante Oficial de Transferencia Transfronteriza'
          }
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Generar Código QR de verificación en Stellar Testnet Explorer
        const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${data.stellarTestnetTxHash}`;
        const qrDataUrl = await QRCode.toDataURL(explorerUrl, { width: 120, margin: 1 });
        const qrImageBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

        // Paleta Institucional Core
        const colorPrimary = '#0B1E36';
        const colorSecondary = '#1E3653';
        const colorAccent = '#F3D014';
        const colorGray = '#555555';

        // Encabezado Corporativo
        doc.rect(40, 40, 515, 60).fill(colorPrimary);
        doc.fillColor('#FFFFFF').fontSize(16).text('AV FINANCE S.R.L.', 55, 52, { bold: true });
        doc.fontSize(10).fillColor(colorAccent).text('Solución de Transferencias Internacionales B2B', 55, 72);
        doc.fontSize(8).fillColor('#FFFFFF').text('Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI', 55, 84);

        // Número de Comprobante
        doc.fillColor('#FFFFFF').fontSize(11).text('COMPROBANTE OFICIAL', 380, 52, { align: 'right' });
        doc.fontSize(10).fillColor(colorAccent).text(`N°: ${data.receiptNumber}`, 380, 68, { align: 'right' });

        doc.moveDown(4);

        // Sección Datos del Cliente
        doc.rect(40, 115, 515, 22).fill(colorSecondary);
        doc.fillColor('#FFFFFF').fontSize(10).text('DATOS DE LA EMPRESA REMITENTE (B2B)', 50, 121);

        doc.fillColor(colorPrimary).fontSize(9);
        doc.text(`Razón Social: ${data.clientCompanyName}`, 50, 145);
        doc.text(`NIT: ${data.clientNIT}`, 50, 160);
        doc.text(`Fecha y Hora de Emisión: ${new Date(data.timestamp).toLocaleString('es-BO')}`, 50, 175);
        doc.text(`Modalidad: Custodia Institucional en Stellar Testnet`, 50, 190);

        // Sección Detalle Financiero
        doc.rect(40, 215, 515, 22).fill(colorSecondary);
        doc.fillColor('#FFFFFF').fontSize(10).text('LIQUIDACIÓN Y DETALLE DE LA OPERACIÓN', 50, 221);

        doc.fillColor(colorPrimary).fontSize(9);
        doc.text(`Monto Origen: BOB ${data.sourceAmountBob.toLocaleString('es-BO', { minimumFractionDigits: 2 })}`, 50, 245);
        doc.text(`Tipo de Cambio Aplicado: ${data.exchangeRate.toFixed(4)} BOB/USD`, 50, 260);
        doc.text(`Comisión por Servicio ECP: BOB ${data.serviceFeeBob.toFixed(2)}`, 50, 275);
        doc.text(`Monto Destino a Acreditar: USD ${data.destinationAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 50, 290);

        // Sección Beneficiario
        doc.rect(40, 315, 515, 22).fill(colorSecondary);
        doc.fillColor('#FFFFFF').fontSize(10).text('DATOS DEL BENEFICIARIO EN DESTINO', 50, 321);

        doc.fillColor(colorPrimary).fontSize(9);
        doc.text(`Nombre / Razón Social: ${data.beneficiaryName}`, 50, 345);
        doc.text(`Entidad Bancaria Destino: ${data.beneficiaryBank}`, 50, 360);
        doc.text(`País Destino: ${data.beneficiaryCountry}`, 50, 375);

        // Sección Trazabilidad Criptográfica & QR
        doc.rect(40, 400, 515, 130).lineWidth(1).stroke(colorSecondary);
        doc.fillColor(colorSecondary).fontSize(10).text('TRAZABILIDAD CRIPTOGRÁFICA EN STELLAR TESTNET', 50, 410);

        doc.fontSize(8).fillColor(colorGray);
        doc.text('Hash de Transacción en Ledger:', 50, 430);
        doc.fillColor(colorPrimary).text(data.stellarTestnetTxHash, 50, 442, { width: 340 });

        doc.fillColor(colorGray).fontSize(8).text(
          'Escanee el código QR para validar la transacción directamente en el explorador público de Stellar Testnet.',
          50,
          475,
          { width: 340 }
        );

        // Insertar QR
        doc.image(qrImageBuffer, 410, 412, { width: 110, height: 110 });

        // Pie de página legal ECP
        doc.rect(40, 545, 515, 45).fill('#F4F6F9');
        doc.fillColor('#555555').fontSize(7.5).text(
          'AV Finance S.R.L. opera en el Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI. ' +
          'Este comprobante digital certifica la transferencia internacional realizada mediante tecnología Stellar Testnet con custodia institucional. ' +
          'Válido para fines de auditoría y conciliación corporativa.',
          48,
          553,
          { width: 495, align: 'center' }
        );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

export default new TransferReceiptGenerator();
