import test from 'node:test';
import assert from 'node:assert/strict';
import { ECP_COMPLIANCE_RULES } from '../rules.ts';

function regla(id: string) {
  const encontrada = ECP_COMPLIANCE_RULES.find((r) => r.id === id);
  assert.ok(encontrada, `debe existir la regla ${id}`);
  return encontrada;
}

test('el catalogo normativo cubre las cinco reglas con codigos unicos', () => {
  assert.equal(ECP_COMPLIANCE_RULES.length, 5);
  assert.equal(new Set(ECP_COMPLIANCE_RULES.map((r) => r.code)).size, 5);
});

test('las severidades priorizan custodia, identidad y marca', () => {
  assert.equal(regla('asfi-01').severity, 'CRITICAL');
  assert.equal(regla('asfi-02').severity, 'CRITICAL');
  assert.equal(regla('asfi-05').severity, 'CRITICAL');
  assert.equal(regla('asfi-03').severity, 'HIGH');
  assert.equal(regla('asfi-04').severity, 'HIGH');
});

test('asfi-01 exige NIT de al menos siete digitos y matricula SEPREC', () => {
  const validar = regla('asfi-01').validate;
  assert.equal(validar({ taxIdNIT: '1029384021', seprecRegistrationNumber: 'SEP-LPZ-948201' }).valid, true);
  const sinNit = validar({ taxIdNIT: '123', seprecRegistrationNumber: 'SEP-1' });
  assert.equal(sinNit.valid, false);
  assert.match(sinNit.reason ?? '', /NIT/);
  const sinSeprec = validar({ taxIdNIT: '1029384021' });
  assert.equal(sinSeprec.valid, false);
  assert.match(sinSeprec.reason ?? '', /SEPREC/);
});

test('asfi-02 solo admite custodia institucional', () => {
  const validar = regla('asfi-02').validate;
  assert.equal(validar({}).valid, true);
  assert.equal(validar({ custodyType: 'CUSTODIA_INSTITUCIONAL' }).valid, true);
  const noCustodial = validar({ custodyType: 'NON_CUSTODIAL' });
  assert.equal(noCustodial.valid, false);
  assert.match(noCustodial.reason ?? '', /custodia institucional/i);
});

test('asfi-03 rechaza montos por encima del cupo y acepta montos dentro', () => {
  const validar = regla('asfi-03').validate;
  assert.equal(validar({ amountBob: 100000 }).valid, true);
  const excedido = validar({ amountBob: 400000 });
  assert.equal(excedido.valid, false);
  assert.match(excedido.reason ?? '', /cupo/i);
});

test('asfi-04 exige declaracion de origen de fondos sobre volumenes altos', () => {
  const validar = regla('asfi-04').validate;
  assert.equal(validar({ declaredAnnualVolumeBob: 50000 }).valid, true);
  const pendiente = validar({ declaredAnnualVolumeBob: 500000 });
  assert.equal(pendiente.valid, false);
  assert.equal(validar({ declaredAnnualVolumeBob: 500000, hasOriginOfFundsDeclaration: true }).valid, true);
});

test('asfi-05 bloquea los terminos vetados del glosario institucional', () => {
  const validar = regla('asfi-05').validate;
  assert.equal(validar('Transferencias internacionales bajo custodia institucional').valid, true);
  for (const texto of ['pregunta por remesas', 'modelo non-custodial', 'tenemos licencia', 'somos los únicos']) {
    const resultado = validar(texto);
    assert.equal(resultado.valid, false, `debe vetar: ${texto}`);
    assert.match(resultado.reason ?? '', /regla de marca/i);
  }
});
