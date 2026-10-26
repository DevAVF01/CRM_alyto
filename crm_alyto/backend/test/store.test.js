import test from 'node:test';
import assert from 'node:assert/strict';
import { store, STAGES } from '../src/data/store.js';

const ESTADOS_OPERACION = ['Completada en ECP', 'En Proceso', 'En Revision ASFI', 'Observada', 'Rechazada'];
const ESTADOS_CHECKLIST = ['Pendiente', 'En revision', 'Aprobado', 'Observado'];

test('el embudo comercial tiene las seis etapas numeradas en orden', () => {
  assert.equal(STAGES.length, 6);
  STAGES.forEach((nombre, indice) => {
    assert.match(nombre, new RegExp(`^${indice + 1}\\. `), `la etapa ${indice + 1} debe empezar con su numero`);
  });
  assert.match(STAGES[5], /Cliente Activo/);
});

test('la siembra demo carga siete expedientes con codigo unico', () => {
  const clientes = store.listClients();
  assert.equal(clientes.length, 7);
  const codigos = clientes.map((c) => c.id);
  assert.equal(new Set(codigos).size, 7);
  for (const codigo of codigos) {
    assert.match(codigo, /^ECP-BOL-\d{4}$/);
  }
});

test('getClient agrega wallets, operaciones y oportunidad del expediente', () => {
  const ficha = store.getClient('ECP-BOL-5577');
  assert.equal(ficha.wallets.length, 2);
  assert.equal(ficha.transactions.length, 3);
  assert.notEqual(ficha.deal, null);
  assert.equal(store.getClient('ECP-BOL-0000'), null);
});

test('cada expediente tiene las ocho casillas de debida diligencia', () => {
  for (const cliente of store.listClients()) {
    const checklist = store.getChecklist(cliente.id);
    assert.equal(checklist.length, 8, `el expediente ${cliente.id} debe tener ocho casillas`);
    for (const casilla of checklist) {
      assert.ok(ESTADOS_CHECKLIST.includes(casilla.status), `estado invalido en ${cliente.id}/${casilla.key}`);
    }
  }
});

test('updateChecklistItem rechaza estados fuera del dominio y audita los validos', () => {
  const auditoriaAntes = store.listAudit().length;
  assert.throws(
    () => store.updateChecklistItem('ECP-BOL-5577', 'ubo', 'Aprobadisimo', 'tester'),
    (err) => err.status === 400,
  );
  store.updateChecklistItem('ECP-BOL-5577', 'ubo', 'Aprobado', 'tester');
  const casilla = store.getChecklist('ECP-BOL-5577').find((i) => i.key === 'ubo');
  assert.equal(casilla.status, 'Aprobado');
  assert.equal(store.listAudit().length, auditoriaAntes + 1);
  assert.equal(store.updateChecklistItem('ECP-BOL-0000', 'ubo', 'Aprobado', 'tester'), null);
});

test('el filtro de oportunidades por etapa respeta el rango 1 a 6', () => {
  const etapa5 = store.listDeals(5);
  assert.ok(etapa5.length > 0);
  for (const oportunidad of etapa5) {
    assert.equal(oportunidad.stage, 5);
    assert.equal(oportunidad.stageName, STAGES[4]);
  }
  assert.equal(store.listDeals('sin-filtro').length, store.listDeals().length);
  assert.equal(store.listDeals(9).length, store.listDeals().length);
});

test('las operaciones sembradas usan solo estados del dominio', () => {
  for (const operacion of store.listTransactions()) {
    assert.ok(ESTADOS_OPERACION.includes(operacion.status), `estado fuera de dominio: ${operacion.status}`);
    assert.match(operacion.hash, /^[0-9a-f]{16,}$/i);
  }
});

test('los parametros del ECP coinciden con el dossier operativo', () => {
  const { parameters } = store.ecpLimits();
  assert.equal(parameters.usuariosPorDia, 630);
  assert.equal(parameters.operacionesPorDia, 630);
  assert.equal(parameters.montoMaximoOperacionBs, 120000);
  assert.equal(parameters.duracionMaximaEcpMeses, 12);
  assert.match(parameters.estadoLicencia, /En proceso/);
});

test('el resumen de cumplimiento expone el codigo de regimen institucional', () => {
  const resumen = store.complianceSummary();
  assert.equal(resumen.regimeCode, 'AVF-REG-2024-BOL');
  assert.ok(resumen.approved + resumen.inReview + resumen.pending > 0);
});

test('createDeal arranca la oportunidad en la etapa 1 con codigo correlativo', () => {
  const creada = store.createDeal({ company: 'Prueba Unitaria S.R.L.' });
  assert.equal(creada.stage, 1);
  assert.match(creada.id, /^ECP-BOL-\d{4}$/);
  assert.equal(store.getDeal(creada.id).company, 'Prueba Unitaria S.R.L.');
});
