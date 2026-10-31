import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificarBanderas, clasificarLegajo, clasificarReclamos, clasificarSla } from '../src/data/panel.js';

test('SLA marca rojo si hay conversaciones vencidas y verde si no hay', () => {
  assert.equal(clasificarSla([{ vencida: false }, { vencida: true }]).tono, 'rojo');
  assert.equal(clasificarSla([{ vencida: false }]).tono, 'verde');
});

test('legajo distingue observados, pendientes y cumplimiento completo', () => {
  assert.deepEqual(clasificarLegajo([{ casillas: 4, aprobadas: 3, observadas: 1, rechazadas: 0 }]), {
    numero: 1, tono: 'rojo', frase: 'Casillas sin aprobar en 1 cuenta(s), con observadas o rechazadas en 1',
  });
  assert.equal(clasificarLegajo([{ casillas: 4, aprobadas: 2, observadas: 0, rechazadas: 0 }]).tono, 'ambar');
  assert.equal(clasificarLegajo([{ casillas: 4, aprobadas: 4, observadas: 0, rechazadas: 0 }]).tono, 'verde');
});

test('banderas escala de verde a ambar y rojo según el volumen', () => {
  assert.equal(clasificarBanderas([]).tono, 'verde');
  assert.equal(clasificarBanderas([{}, {}]).tono, 'ambar');
  assert.equal(clasificarBanderas([{}, {}, {}]).tono, 'rojo');
});

test('reclamos cuenta abiertos, detecta vencidos y excluye los cerrados', () => {
  assert.equal(clasificarReclamos([{ status: 'abierto', vencido: true }]).tono, 'rojo');
  assert.equal(clasificarReclamos([{ status: 'abierto', sin_plazo_definido: true }]).tono, 'ambar');
  assert.equal(clasificarReclamos([{ status: 'respondido' }, { status: 'cerrado' }]).tono, 'verde');
  assert.equal(clasificarReclamos([{ status: 'abierto' }, { status: 'respondido' }]).numero, 1);
});
