import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from 'logger-sentry';

// El manejador que sirve es el de la skill logger-sentry, que es el que monta app.js. Antes
// existia una copia local en src/middleware con un contrato de error distinto (sin `code` y con
// el mensaje siempre visible); esa copia esta borrada y estas pruebas cubren el que corre.
const logger = { error: () => {} };

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
  errorHandler(logger)(err, { originalUrl: '/api/prueba', method: 'GET' }, res, () => {});
  return captured;
}

// Un 404 sin codigo propio sale como NOT_FOUND, no como error interno, y su mensaje se muestra:
// es informacion de la peticion, no un detalle del servidor.
test('devuelve el codigo de estado declarado por el error', () => {
  const err = new Error('Expediente no encontrado');
  err.status = 404;
  const { status, payload } = runHandler(err);
  assert.equal(status, 404);
  assert.equal(payload.error.code, 'NOT_FOUND');
  assert.equal(payload.error.message, 'Expediente no encontrado');
});

test('un error sin expose no cuenta su mensaje interno a la interfaz', () => {
  const { status, payload } = runHandler(new Error('cadena de conexion expirada'));
  assert.equal(status, 500);
  assert.equal(payload.error.code, 'INTERNAL_ERROR');
  assert.equal(payload.error.message, 'Error interno del servidor');
});

test('un error marcado como expuesto si se lo cuenta, que es el caso de un conector caido', () => {
  const err = new Error('kyc-aml-connector no responde en http://localhost:4602');
  err.status = 502;
  err.code = 'CONNECTOR_UNAVAILABLE';
  err.expose = true;
  const { status, payload } = runHandler(err);
  assert.equal(status, 502);
  assert.equal(payload.error.code, 'CONNECTOR_UNAVAILABLE');
  assert.match(payload.error.message, /kyc-aml-connector no responde/);
});
