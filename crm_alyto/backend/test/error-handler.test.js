import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errorHandler.js';

function runHandler(err) {
  const captured = { status: null, payload: null };
  const res = {
    status(code) {
      captured.status = code;
      return this;
    },
    json(payload) {
      captured.payload = payload;
      return this;
    },
  };
  errorHandler(err, { originalUrl: '/api/prueba' }, res, () => {});
  return captured;
}

test('devuelve el codigo de estado declarado por el error', () => {
  const err = new Error('Expediente no encontrado');
  err.status = 404;
  const { status, payload } = runHandler(err);
  assert.equal(status, 404);
  assert.equal(payload.error.status, 404);
  assert.equal(payload.error.message, 'Expediente no encontrado');
});

test('un error sin estado cae a 500 con mensaje interno', () => {
  const { status, payload } = runHandler(new Error('Fallo inesperado'));
  assert.equal(status, 500);
  assert.equal(payload.error.status, 500);
});

test('el contrato de error incluye marca de tiempo ISO', () => {
  const { payload } = runHandler(Object.assign(new Error('x'), { status: 400 }));
  assert.ok(!Number.isNaN(Date.parse(payload.error.timestamp)));
});
