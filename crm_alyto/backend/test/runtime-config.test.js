import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { requireDataLayer } from '../src/middleware/dataLayer.js';
import { assertBootConfiguration, dataLayer, demoMode, storeAllowed } from '../src/config/runtime.js';

const CONTROLLED_KEYS = ['DEMO_MODE', 'AUTH_SECRET', 'DEMO_PASSWORD'];

function withEnv(values, run) {
  const previous = Object.fromEntries(CONTROLLED_KEYS.map((key) => [key, process.env[key]]));
  for (const key of CONTROLLED_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return run();
  } finally {
    for (const key of CONTROLLED_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const LONG_SECRET = '0123456789abcdef0123456789abcdef-ecp';

async function withEnvAsync(values, run) {
  const previous = Object.fromEntries(CONTROLLED_KEYS.map((key) => [key, process.env[key]]));
  for (const key of CONTROLLED_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const key of CONTROLLED_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('sin credenciales y sin DEMO_MODE el arranque se rechaza', () => {
  withEnv({}, () => {
    assert.equal(demoMode(), false);
    assert.throws(() => assertBootConfiguration(), /no puede arrancar/);
  });
});

test('DEMO_MODE escrito de cualquier otra forma tampoco habilita el modo demostracion', () => {
  withEnv({ DEMO_MODE: 'si', AUTH_SECRET: LONG_SECRET, DEMO_PASSWORD: 'clave-ecp-2026' }, () => {
    assert.equal(demoMode(), false);
    assert.throws(() => assertBootConfiguration(), /DEMO_MODE no es true/);
  });
});

test('DEMO_MODE=true sin AUTH_SECRET se rechaza con la forma de generarlo', () => {
  withEnv({ DEMO_MODE: 'true', DEMO_PASSWORD: 'clave-ecp-2026' }, () => {
    assert.throws(() => assertBootConfiguration(), /AUTH_SECRET falta o mide menos de 32/);
  });
});

test('DEMO_MODE=true sin DEMO_PASSWORD se rechaza', () => {
  withEnv({ DEMO_MODE: 'true', AUTH_SECRET: LONG_SECRET }, () => {
    assert.throws(() => assertBootConfiguration(), /DEMO_PASSWORD falta/);
  });
});

test('el modo demostracion valido arranca y se declara en el estado', () => {
  withEnv({ DEMO_MODE: 'true', AUTH_SECRET: LONG_SECRET, DEMO_PASSWORD: 'clave-ecp-2026' }, () => {
    const status = assertBootConfiguration();
    assert.equal(status.demoMode, true);
    assert.equal(status.dataLayer, 'memoria');
    assert.equal(status.authLayer, 'demo-firmado');
    assert.equal(storeAllowed(), true);
  });
});

test('con DEMO_MODE apagado el almacen en memoria no esta habilitado', () => {
  withEnv({}, () => {
    assert.equal(storeAllowed(), false);
    assert.equal(dataLayer(), 'no disponible');
  });
});

test('requireDataLayer deja pasar en demo y responde 503 fuera de demo', () => {
  withEnv({ DEMO_MODE: 'true' }, () => {
    let avanzada = false;
    requireDataLayer({}, {}, () => {
      avanzada = true;
    });
    assert.equal(avanzada, true);
  });

  withEnv({}, () => {
    const res = {
      statusCode: 0,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    let avanzada = false;
    requireDataLayer({}, res, () => {
      avanzada = true;
    });
    assert.equal(avanzada, false, 'fuera de demo la peticion no debe llegar al almacen en memoria');
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error.code, 'DATA_LAYER_NOT_CONFIGURED');
  });
});

test('salud informa el modo real del backend para que la interfaz no lo adivine', async () => {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const enDemo = await withEnvAsync(
      { DEMO_MODE: 'true', AUTH_SECRET: LONG_SECRET, DEMO_PASSWORD: 'clave-ecp-2026' },
      async () => (await fetch(`${base}/api/health`)).json(),
    );
    assert.equal(enDemo.status, 'ok');
    assert.equal(enDemo.runtime.demoMode, true);
    assert.equal(enDemo.runtime.dataLayer, 'memoria');
    assert.equal(enDemo.runtime.authLayer, 'demo-firmado');
    assert.match(enDemo.regime, /Entorno Controlado de Pruebas/);

    const sinDemo = await withEnvAsync({}, async () => (await fetch(`${base}/api/health`)).json());
    assert.equal(sinDemo.runtime.demoMode, false);
    assert.ok(['no disponible', 'capa de repositorio pendiente', 'supabase'].includes(sinDemo.runtime.dataLayer));
  } finally {
    server.close();
  }
});
