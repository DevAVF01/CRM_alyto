import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  brandLinterMiddleware,
  resetBrandLinterCache,
  rulesFromDatabase,
} from '../src/middleware/brandLinterMiddleware.js';

async function runWith(body) {
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
  await brandLinterMiddleware(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

beforeEach(() => resetBrandLinterCache());

test('deja pasar un cuerpo alineado al glosario institucional', async () => {
  const result = await runWith({
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
  test(`rechaza el termino vetado "${termino}" con 400`, async () => {
    const result = await runWith({ texto: `Ofrecemos ${termino} a empresas importadoras` });
    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 400);
    assert.match(result.payload.detail, detalle);
  });
}

test('rechaza el guion largo en textos de interfaz', async () => {
  const result = await runWith({ titulo: 'Operación validada — Stellar Testnet' });
  assert.equal(result.status, 400);
  assert.match(result.payload.detail, /gui[oó]n largo/i);
});

// El patron global con .test() avanza lastIndex y se salta la siguiente peticion: dos intentos
// seguidos tienen que ser rechazados por la misma razon.
test('el guion largo se rechaza tambien en la peticion siguiente', async () => {
  const primero = await runWith({ titulo: 'Cliente — Alyto' });
  const segundo = await runWith({ titulo: 'Cliente — Alyto' });
  assert.equal(primero.status, 400);
  assert.equal(segundo.status, 400, 'un patron con bandera global deja pasar el segundo caso');
});

test('no inspecciona cuerpos ausentes o primitivos', async () => {
  for (const body of [undefined, null, 'texto plano', 42]) {
    const result = await runWith(body);
    assert.equal(result.nextCalled, true, `el cuerpo ${String(body)} debe pasar`);
  }
});

test('detecta el termino vetado anidado dentro de objetos', async () => {
  const result = await runWith({ cliente: { nota: 'pregunta por remesas bancarias' } });
  assert.equal(result.status, 400);
});

test('sin base conectada sigue vigente el respaldo del glosario', async () => {
  // En pruebas el modulo de configuracion no tiene SUPABASE_URL, asi que supabase es null y el
  // linter trabaja con la lista propia. El guardarrail no puede depender de las migraciones.
  const result = await runWith({ texto: 'somos los únicos del sistema' });
  assert.equal(result.status, 400);
});

const filas = [
  { term: 'Remesas', severity: 'bloqueo', suggestion: 'transferencias internacionales', reason: 'No se usa ese termino.' },
  { term: 'regulados', severity: 'advertencia', suggestion: 'bajo supervision de ASFI', reason: 'Falta el regimen.' },
  { term: 'licenciados', severity: 'advertencia', suggestion: 'en el ECP de ASFI', reason: 'Falta el regimen.' },
];

test('del diccionario de la base solo bloquea la severidad bloqueo', () => {
  const reglas = rulesFromDatabase(filas);
  assert.deepEqual(reglas.map((rule) => rule.term), ['Remesas']);
  assert.match(reglas[0].error, /transferencias internacionales/);
  assert.match(reglas[0].error, /No se usa ese termino/);
});

test('la comparacion con el diccionario no distingue mayusculas', async () => {
  const resultado = await runWith({ texto: 'habla de REMESAS bancarias' });
  assert.equal(resultado.status, 400);
});
