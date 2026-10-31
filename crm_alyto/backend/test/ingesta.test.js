import test from 'node:test';
import assert from 'node:assert/strict';
import { archivarEntrante, normalizaTelefono, normalizaCorreo, dominioIngesta, identificador } from '../src/data/ingesta.js';

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

// El archivador toca la base en cada paso, y por eso sus pruebas unitarias cubren lo que decide
// ANTES de ir: la normalizacion del numero y el correo, y la lista cerrada de canales y motivos.
// Lo que pasa despides se comprueba en vivo (scripts/prueba-ingesta.mjs), que es donde el
// encolamiento, la apertura del hilo y el asiento tienen que responder.

test('el telefono entra en E.164 con el codigo de pais, venga como venga tecleado', () => {
  assert.equal(normalizaTelefono('+591 7-123456'), '+5917123456');
  assert.equal(normalizaTelefono('59171234567'), '+59171234567', 'ya trae el codigo de pais: pasa tal cual');
  assert.equal(normalizaTelefono('7123456'), '+5917123456');
  assert.equal(normalizaTelefono('(3) 3432123'), '+59133432123');
  assert.equal(normalizaTelefono('005917123456'), '+5917123456');
});

test('un numero que no puede ser un numero no se inventa', () => {
  assert.equal(normalizaTelefono(''), null);
  assert.equal(normalizaTelefono('hola'), null);
  assert.equal(normalizaTelefono('12345'), null, 'cinco digitos no son un telefono');
  assert.equal(normalizaTelefono('1'.repeat(16)), null, 'mas de quince digitos se descarta');
});

test('el correo se guarda en minusculas y solo si tiene forma de correo', () => {
  assert.equal(normalizaCorreo(' Cliente@AVFinance.BO '), 'cliente@avfinance.bo');
  assert.equal(normalizaCorreo('cliente@@avfinance.bo'), null);
  assert.equal(normalizaCorreo('sin-arroba'), null);
});

test('con correo y telefono escritos, el telefono queda de respaldo y no se tira', () => {
  assert.deepEqual(identificador({ correo: 'Cliente@AVFinance.BO', telefono: '7123456' }), {
    columna: 'email',
    valor: 'cliente@avfinance.bo',
    respaldo: { columna: 'phone_e164', valor: '+5917123456' },
  });
  // Sin el respaldo, un correo mal tecleado de un cliente que ya tiene ficha por numero creaba
  // una ficha nueva al lado de la vieja.
  assert.deepEqual(identificador({ telefono: '7123456' }), {
    columna: 'phone_e164', valor: '+5917123456', respaldo: null,
  });
  assert.deepEqual(identificador({ correo: 'cliente@avfinance.bo' }), {
    columna: 'email', valor: 'cliente@avfinance.bo', respaldo: null,
  });
  assert.equal(identificador({ correo: 'sin-arroba', telefono: 'hola' }), null);
});

test('el archivador solo admite los canales y los motivos que la base declara', () => {
  // Si alguien agrega un valor al enum de la base y se olvida de esta lista, el archivador lo
  // rechaza en lugar de dejarlo pasar para que la base explote con 22P02 en la pantalla.
  assert.deepEqual(dominioIngesta.canales, [
    'whatsapp', 'correo', 'chat_app', 'web_chat', 'linkedin', 'meta', 'tiktok',
    'formulario', 'telefonica', 'interno',
  ]);
  assert.deepEqual(dominioIngesta.motivos, [
    'soporte_tecnico', 'registro_kyc', 'empresa_b2b', 'reclamo', 'consulta_saldo', 'otro',
  ]);
});

test('sin la configuracion de la base el archivador avisa 503 y no escribe nada', async () => {
  await conAmbiente({}, async () => {
    await assert.rejects(
      () => archivarEntrante({ headers: { authorization: 'Bearer cualquier-cosa' } }, {
        channel: 'whatsapp',
        telefono: '7123456',
        body: 'Hola, necesito ayuda',
      }),
      (err) => {
        assert.equal(err.status, 503);
        assert.equal(err.code, 'DATA_LAYER_NOT_CONFIGURED');
        return true;
      },
    );
  });
});

test('sin token de sesion el archivador no archiva: la entrada es de una persona, no del sistema', async () => {
  await conAmbiente({ SUPABASE_URL: 'https://ejemplo.subabase.co', SUPABASE_ANON_KEY: 'clave-publica' }, async () => {
    await assert.rejects(
      () => archivarEntrante({ headers: {} }, {
        channel: 'whatsapp', telefono: '7123456', body: 'Hola',
      }),
      (err) => {
        assert.equal(err.status, 401);
        assert.equal(err.code, 'UNAUTHENTICATED');
        return true;
      },
    );
  });
});

test('un canal que la base no tiene se rechaza con su lista, no con un 500', async () => {
  await conAmbiente({ SUPABASE_URL: 'https://ejemplo.subabase.co', SUPABASE_ANON_KEY: 'clave-publica' }, async () => {
    await assert.rejects(
      () => archivarEntrante({ headers: { authorization: 'Bearer token' } }, {
        channel: 'telegram', telefono: '7123456', body: 'Hola',
      }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'INVALID_CHANNEL');
        assert.match(err.message, /whatsapp/);
        return true;
      },
    );
  });
});

test('un mensaje sin cuerpo o sin identificador no llega a la base', async () => {
  await conAmbiente({ SUPABASE_URL: 'https://ejemplo.subabase.co', SUPABASE_ANON_KEY: 'clave-publica' }, async () => {
    const req = { headers: { authorization: 'Bearer token' } };
    await assert.rejects(
      () => archivarEntrante(req, { channel: 'whatsapp', telefono: '7123456', body: '   ' }),
      (err) => {
        assert.equal(err.code, 'EMPTY_BODY');
        assert.equal(err.status, 400);
        return true;
      },
    );
    await assert.rejects(
      () => archivarEntrante(req, { channel: 'whatsapp', body: 'escribio pero no dejo numero' }),
      (err) => {
        assert.equal(err.code, 'NEEDS_IDENTIFIER');
        return true;
      },
    );
  });
});

test('un numero con muchos digitos se rechaza antes de buscar: la pantalla tiene que quedar clara', async () => {
  await conAmbiente({ SUPABASE_URL: 'https://ejemplo.subabase.co', SUPABASE_ANON_KEY: 'clave-publica' }, async () => {
    await assert.rejects(
      () => archivarEntrante({ headers: { authorization: 'Bearer token' } }, {
        channel: 'whatsapp', telefono: 'abc', body: 'Hola',
      }),
      (err) => {
        assert.equal(err.code, 'NEEDS_IDENTIFIER');
        assert.match(err.message, /telefono o el correo/);
        return true;
      },
    );
  });
});
