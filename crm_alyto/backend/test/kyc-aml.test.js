import test from 'node:test';
import assert from 'node:assert/strict';
import { kycAmlService } from '../src/services/kycAmlService.js';

const COMPLETO = {
  matriculaComercioVigente: true,
  nitActivo: true,
  poderRepresentanteLegal: true,
  cedulaIdentidadRepresentante: true,
  estadosFinancierosAuditados: true,
  declaracionOrigenFondos: true,
  formularioConozcaSuCliente: true,
};

test('aprueba el checklist institucional completo con riesgo BAJO', () => {
  const resultado = kycAmlService.verifyClientChecklist(COMPLETO);
  assert.equal(resultado.isApproved, true);
  assert.deepEqual(resultado.missingDocuments, []);
  assert.equal(resultado.riskLevel, 'BAJO');
  assert.equal(resultado.verifiedBy, 'Oficial de Cumplimiento ECP ASFI');
});

test('un documento faltante deja riesgo MEDIO y lo lista', () => {
  const resultado = kycAmlService.verifyClientChecklist({
    ...COMPLETO,
    estadosFinancierosAuditados: false,
  });
  assert.equal(resultado.isApproved, false);
  assert.deepEqual(resultado.missingDocuments, ['estadosFinancierosAuditados']);
  assert.equal(resultado.riskLevel, 'MEDIO');
});

test('tres o mas documentos faltantes elevan el riesgo a ALTO', () => {
  const resultado = kycAmlService.verifyClientChecklist({
    ...COMPLETO,
    poderRepresentanteLegal: false,
    declaracionOrigenFondos: false,
    formularioConozcaSuCliente: false,
  });
  assert.equal(resultado.riskLevel, 'ALTO');
  assert.equal(resultado.missingDocuments.length, 3);
});

test('dos documentos faltantes siguen en riesgo MEDIO', () => {
  const resultado = kycAmlService.verifyClientChecklist({
    ...COMPLETO,
    nitActivo: false,
    cedulaIdentidadRepresentante: false,
  });
  assert.equal(resultado.riskLevel, 'MEDIO');
});

test('un checklist vacio reporta las siete casillas exigidas', () => {
  const resultado = kycAmlService.verifyClientChecklist({});
  assert.equal(resultado.isApproved, false);
  assert.equal(resultado.missingDocuments.length, 7);
  assert.equal(resultado.riskLevel, 'ALTO');
});

test('el cribado de listas deja limpia a una empresa sin alertas', () => {
  const resultado = kycAmlService.screenSanctions('Importadora Pacifico S.A.', '1029384021');
  assert.equal(resultado.cleared, true);
  assert.equal(resultado.ofacMatch, false);
  assert.equal(resultado.unSanctionsMatch, false);
  assert.match(resultado.notes, /Sin coincidencias/);
});

test('el cribado marca coincidencia preventiva con nombre sancionado', () => {
  const resultado = kycAmlService.screenSanctions('Sancion Trading Corp', '1029384021');
  assert.equal(resultado.cleared, false);
  assert.equal(resultado.ofacMatch, true);
  assert.match(resultado.notes, /coincidencia preventiva/i);
});

test('el cribado marca coincidencia preventiva con NIT nulo', () => {
  const resultado = kycAmlService.screenSanctions('Empresa Limpia S.R.L.', '0000000000');
  assert.equal(resultado.cleared, false);
});
