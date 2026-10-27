import test from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '../src/data/repository.js';
import { requireScopedRead } from '../src/middleware/dataLayer.js';

const CLAVE = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function conAmbiente(valores, correr) {
  const anterior = Object.fromEntries(CLAVE.map((nombre) => [nombre, process.env[nombre]]));
  for (const nombre of CLAVE) delete process.env[nombre];
  Object.assign(process.env, valores);
  try {
    return correr();
  } finally {
    for (const nombre of CLAVE) {
      if (anterior[nombre] === undefined) delete process.env[nombre];
      else process.env[nombre] = anterior[nombre];
    }
  }
}

function respuestaFalsa() {
  return {
    statusCode: null,
    cuerpo: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(cuerpo) {
      this.cuerpo = cuerpo;
      return this;
    },
  };
}

test('las cuatro lecturas habilitadas son las vistas verificadas en el panel', () => {
  assert.deepEqual(repository.lecturas, ['inbox', 'conversacionesSla', 'cadenciaPendiente', 'reclamosSla']);
});

test('sin las variables de Supabase la lectura avisa 503 y no inventa datos', async () => {
  await conAmbiente({}, async () => {
    assert.equal(repository.configured(), false);
    await assert.rejects(
      () => repository.inbox({ headers: { authorization: 'Bearer cualquier-cosa' } }),
      (err) => {
        assert.equal(err.status, 503);
        assert.equal(err.code, 'DATA_LAYER_NOT_CONFIGURED');
        assert.match(err.message, /SUPABASE_ANON_KEY/);
        return true;
      },
    );
  });
});

test('con la configuracion puesta pero sin token de sesion la lectura es 401', async () => {
  await conAmbiente(
    { SUPABASE_URL: 'https://ejemplo.subabase.co', SUPABASE_ANON_KEY: 'clave-publica-de-ejemplo' },
    async () => {
      assert.equal(repository.configured(), true);
      await assert.rejects(
        () => repository.conversacionesSla({ headers: {} }),
        (err) => {
          assert.equal(err.status, 401);
          assert.equal(err.code, 'UNAUTHENTICATED');
          return true;
        },
      );
    },
  );
});

test('el guard de mensajeria abre el paso solo cuando la base esta configurada', () => {
  conAmbiente({}, () => {
    let avanzada = false;
    const res = respuestaFalsa();
    requireScopedRead({}, res, () => {
      avanzada = true;
    });
    assert.equal(avanzada, false, 'sin configuracion la peticion no debe llegar a la base');
    assert.equal(res.statusCode, 503);
    assert.equal(res.cuerpo.error.code, 'DATA_LAYER_NOT_CONFIGURED');
  });

  conAmbiente(
    { SUPABASE_URL: 'https://ejemplo.subabase.co', SUPABASE_ANON_KEY: 'clave-publica-de-ejemplo' },
    () => {
      let avanzada = false;
      requireScopedRead({}, {}, () => {
        avanzada = true;
      });
      assert.equal(avanzada, true);
    },
  );
});

test('el repositorio solo expone las cuatro lecturas y no se le puede ampliar en marcha', () => {
  assert.equal(Object.isFrozen(repository), true);
  for (const nombre of repository.lecturas) {
    assert.equal(typeof repository[nombre], 'function');
  }
  assert.throws(() => {
    repository.nuevaLectura = () => [];
  }, TypeError, 'los modulos corren en modo estricto y un objeto congelado no admite claves nuevas');
});
