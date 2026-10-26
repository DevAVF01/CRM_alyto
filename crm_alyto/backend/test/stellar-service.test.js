import test from 'node:test';
import assert from 'node:assert/strict';
import { stellarService } from '../src/services/stellarService.js';

function respuesta({ ok = true, status = 200, data = {}, error = null } = {}) {
  return {
    ok,
    status,
    json: async () => (error ? { error } : { data }),
  };
}

test('health devuelve el campo data del conector', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => respuesta({ data: { status: 'ok', red: 'testnet' } }));
  const salida = await stellarService.health();
  assert.deepEqual(salida, { status: 'ok', red: 'testnet' });
  const [url] = globalThis.fetch.mock.calls[0].arguments;
  assert.match(url, /\/health$/);
});

test('createWallet envia POST al recurso de wallets', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => respuesta({ data: { publicKey: 'GABC' } }));
  await stellarService.createWallet();
  const [url, opciones] = globalThis.fetch.mock.calls[0].arguments;
  assert.match(url, /\/wallets$/);
  assert.equal(opciones.method, 'POST');
});

test('getWallet escapa la clave publica en la ruta', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => respuesta({ data: {} }));
  await stellarService.getWallet('GABC/DEF');
  const [url] = globalThis.fetch.mock.calls[0].arguments;
  assert.match(url, /\/wallets\/GABC%2FDEF$/);
});

test('un fallo del conector se traduce a error 502 con el mensaje remoto', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => respuesta({ ok: false, status: 500, error: { message: 'Ledger no disponible' } }),
  );
  await assert.rejects(
    () => stellarService.sendPayment({ monto: 10 }),
    (err) => err.status === 502 && err.message === 'Ledger no disponible',
  );
});

test('una respuesta sin cuerpo JSON no revienta el servicio', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503, json: async () => { throw new Error('sin cuerpo'); } }));
  await assert.rejects(
    () => stellarService.health(),
    (err) => err.status === 502,
  );
});
