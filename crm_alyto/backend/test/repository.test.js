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

const CONFIG = {
  SUPABASE_URL: 'https://ejemplo.subabase.co',
  SUPABASE_ANON_KEY: 'clave-publica-de-ejemplo',
};

// Las once vistas del modelo del 27/10. Si una se va del modelo y se queda en la lista, el puente
// apunta a algo que no existe; si entra una nueva y no se anade aqui, la pantalla no la puede leer.
test('las vistas habilitadas son las once del modelo', () => {
  assert.deepEqual(repository.vistas, [
    'bandeja', 'sla', 'salida', 'banderas', 'senales', 'viajes', 'legajo',
    'rutas', 'tableroRutas', 'reclamos', 'actividades',
  ]);
});

test('sin las variables de Supabase la lectura avisa 503 y no inventa datos', async () => {
  await conAmbiente({}, async () => {
    assert.equal(repository.configured(), false);
    await assert.rejects(
      () => repository.leerLista({ headers: { authorization: 'Bearer cualquier-cosa' } }, 'bandeja'),
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
  await conAmbiente(CONFIG, async () => {
    assert.equal(repository.configured(), true);
    await assert.rejects(
      () => repository.leerLista({ headers: {} }, 'sla'),
      (err) => {
        assert.equal(err.status, 401);
        assert.equal(err.code, 'UNAUTHENTICATED');
        return true;
      },
    );
  });
});

test('una lectura que no esta declarada es un defecto del puente, no un vacio', async () => {
  await conAmbiente(CONFIG, async () => {
    await assert.rejects(
      () => repository.leerLista({ headers: { authorization: 'Bearer x' } }, 'embudo'),
      (err) => {
        assert.equal(err.status, 500);
        assert.equal(err.code, 'UNKNOWN_READ');
        return true;
      },
    );
  });
});

// El guardarrailes del puente: lo que no esta en la lista de columnas no llega a la base, y una
// tabla que la base mantiene sola (route_events, audit_events, messages por update) no se escribe
// por este camino ni aunque el usuario tenga permiso.
test('una escritura fuera de la lista de columnas se corta antes de la base', async () => {
  await conAmbiente(CONFIG, async () => {
    await assert.rejects(
      () => repository.crear({ headers: { authorization: 'Bearer x' } }, 'mensajes', {
        estado_interno: 'lo que la interfaz invento',
        etapa_embudo: 4,
      }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'EMPTY_WRITE');
        assert.match(err.message, /columna escribible/);
        return true;
      },
    );
  });
});

test('las tablas que mantiene la base rechazan la escritura con 405', async () => {
  await conAmbiente(CONFIG, async () => {
    for (const nombre of ['registro', 'asientosRuta', 'cotejos', 'plantillas']) {
      await assert.rejects(
        () => repository.crear({ headers: { authorization: 'Bearer x' } }, nombre, { cualquier: 'valor' }),
        (err) => {
          assert.equal(err.status, 405, `${nombre} no se escribe por el puente`);
          assert.equal(err.code, 'WRITE_NOT_ALLOWED');
          return true;
        },
      );
    }
  });
});

// document_reviews no tiene columna id. Si el puente la buscara por id, la pantalla del legajo
// daria un error raro de base en lugar de revisar la casilla; esta prueba fija el camino por pareja.
test('la casilla del legajo se modifica por la pareja cuenta-requisito', async () => {
  await conAmbiente(CONFIG, async () => {
    await assert.rejects(
      () => repository.editarCasilla({ headers: { authorization: 'Bearer x' } }, 'cuenta-1', 'R01', {
        id: 'lo que la interfaz creyo que era la llave',
      }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'EMPTY_WRITE');
        return true;
      },
    );
  });
});

test('un mensaje saliente sin cuerpo no llega a la base', async () => {  await conAmbiente(CONFIG, async () => {
    await assert.rejects(
      () => repository.responder({ headers: { authorization: 'Bearer x' }, user: { id: 'u' } },
        'conv-cualquiera', { body: '   ' }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'EMPTY_BODY');
        return true;
      },
    );
  });
});

test('el guard de lectura abre el paso solo cuando la base esta configurada', () => {
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

  conAmbiente(CONFIG, () => {
    let avanzada = false;
    requireScopedRead({}, {}, () => {
      avanzada = true;
    });
    assert.equal(avanzada, true);
  });
});

test('el repositorio no se puede ampliar en marcha', () => {
  assert.equal(Object.isFrozen(repository), true);
  for (const nombre of [...repository.vistas, ...repository.tablas]) {
    assert.ok(nombre, 'toda clave declarada tiene que ser texto');
  }
  assert.throws(() => {
    repository.nuevaLectura = () => [];
  }, TypeError, 'los modulos corren en modo estricto y un objeto congelado no admite claves nuevas');
});
