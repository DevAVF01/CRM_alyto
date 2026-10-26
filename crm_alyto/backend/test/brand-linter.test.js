import test from 'node:test';
import assert from 'node:assert/strict';
import { brandLinterMiddleware } from '../src/middleware/brandLinterMiddleware.js';

function runWith(body) {
  const req = { body };
  const result = { status: null, payload: null, nextCalled: false };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(payload) {
      result.payload = payload;
      return this;
    },
  };
  brandLinterMiddleware(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

test('deja pasar un cuerpo alineado al glosario institucional', () => {
  const result = runWith({
    mensaje: 'Transferencias internacionales con custodia institucional, bajo supervisión de ASFI en el ECP.',
  });
  assert.equal(result.nextCalled, true);
  assert.equal(result.status, null);
});

const vetados = [
  ['remesas', /transferencias internacionales/i],
  ['non-custodial', /custodia institucional/i],
  ['tenemos licencia', /ECP bajo supervisi[oó]n de ASFI/i],
  ['somos los únicos', /comparaciones de exclusividad/i],
];

for (const [termino, detalle] of vetados) {
  test(`rechaza el termino vetado "${termino}" con 400`, () => {
    const result = runWith({ texto: `Ofrecemos ${termino} a empresas importadoras` });
    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 400);
    assert.match(result.payload.detail, detalle);
  });
}

test('rechaza el guion largo en textos de interfaz', () => {
  const result = runWith({ titulo: 'Operación validada — Stellar Testnet' });
  assert.equal(result.status, 400);
  assert.match(result.payload.detail, /gui[oó]n largo/i);
});

test('no inspecciona cuerpos ausentes o primitivos', () => {
  for (const body of [undefined, null, 'texto plano', 42]) {
    const result = runWith(body);
    assert.equal(result.nextCalled, true, `el cuerpo ${String(body)} debe pasar`);
  }
});

test('detecta el termino vetado anidado dentro de objetos', () => {
  const result = runWith({ cliente: { nota: 'pregunta por remesas bancarias' } });
  assert.equal(result.status, 400);
});
