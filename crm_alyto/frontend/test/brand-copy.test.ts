import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORIZED_TERMS,
  BRAND,
  COMPLIANCE_BADGE,
  LEGAL_FOOTER,
  brandViolations,
  isBrandCompliant,
} from '../src/utils/brandCopy.ts';

test('los tokens institucionales coinciden con el Sovereign Institutional Core', () => {
  assert.equal(BRAND.primary, '#0B1E36');
  assert.equal(BRAND.surface, '#1E3653');
  assert.equal(BRAND.accent, '#F3D014');
  assert.equal(BRAND.background, '#F4F6F9');
});

test('los textos institucionales fijos pasan la auditoria de marca', () => {
  for (const texto of [COMPLIANCE_BADGE, LEGAL_FOOTER, ...AUTHORIZED_TERMS]) {
    assert.equal(isBrandCompliant(texto), true, `debe cumplir: ${texto}`);
  }
});

test('una redaccion comercial correcta no genera infracciones', () => {
  const texto =
    'Alyto opera transferencias internacionales con wallets custodiales institucionales, bajo supervisión de ASFI en el Entorno Controlado de Pruebas (ECP).';
  assert.deepEqual(brandViolations(texto), []);
});

const vetados: Array<[string, string]> = [
  ['Gestionamos remesas corporativas', 'remesas'],
  ['Una remesa rapida para tu empresa', 'remesa'],
  ['Somos un exchange regulado', 'exchange'],
  ['Una plataforma de inversión confiable', 'inversión'],
  ['Modelo non-custodial de billeteras', 'non-custodial'],
  ['Modelo non custodial de billeteras', 'non custodial'],
  ['Ya tenemos licencia completa', 'licencia completa'],
  ['Estamos licenciados por el regulador', 'licenciados'],
  ['Entidades reguladas del ECP', 'reguladas'],
  ['Somos los únicos con este servicio', 'únicos'],
  ['Operación — validada en Stellar', '—'],
];

for (const [texto, fragmento] of vetados) {
  test(`detecta el termino vetado: ${fragmento}`, () => {
    const infracciones = brandViolations(texto);
    assert.ok(infracciones.length >= 1, `debe detectar: ${texto}`);
    assert.equal(infracciones[0].match.toLowerCase().includes(fragmento.toLowerCase()), true);
    assert.equal(typeof infracciones[0].rule, 'string');
  });
}

test('brandViolations acumula todas las infracciones del texto', () => {
  const infracciones = brandViolations('remesas en un exchange non-custodial');
  assert.ok(infracciones.length >= 3);
});
