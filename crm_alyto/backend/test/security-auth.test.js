import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  ROLE_LABELS,
  createAuth,
  signSession,
  verifySession,
} from '../../skills/security-auth/src/index.js';
import { DEMO_ACCOUNTS } from '../src/data/demoAccounts.js';

const SECRET = '0123456789abcdef0123456789abcdef-ecp';
const PASSWORD = 'clave-ecp-2026';

function buildAuth(overrides = {}) {
  return createAuth({
    demoMode: true,
    authSecret: SECRET,
    demoPassword: PASSWORD,
    demoAccounts: DEMO_ACCOUNTS,
    ...overrides,
  });
}

function fakeRequest(token) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

function runAuthenticate(auth, token) {
  return new Promise((resolve) => {
    const req = fakeRequest(token);
    auth.authenticate(req, {}, (err) => {
      resolve({ error: err ?? null, user: req.user ?? null });
    });
  });
}

const auth = buildAuth();

test('la sesion de demostracion sale firmada con HMAC y no en texto abierto', async () => {
  const { token, user } = await auth.signInWithPassword({
    email: 'ventas@avfinance.bo',
    password: PASSWORD,
  });
  const [prefix, body, signature] = token.split('.');
  assert.equal(prefix, 'v1');
  assert.equal(signature.length, 43, 'la firma base64url de SHA-256 mide 43 caracteres');
  assert.doesNotMatch(body, /ecp-demo|secret/i);
  assert.equal(user.role, ROLES.VENTAS);
  assert.ok(verifySession(token, SECRET));
});

test('el rol sale de la lista de cuentas, no del prefijo del correo', async () => {
  await assert.rejects(
    () => auth.signInWithPassword({ email: 'admin@atacante.com', password: PASSWORD }),
    (err) => err.status === 401,
    'un correo que no esta en la lista no puede entrar aunque empiece con admin',
  );
  await assert.rejects(
    () => auth.signInWithPassword({ email: 'compliance@exterior.bo', password: PASSWORD }),
    (err) => err.status === 401,
  );
});

test('cualquier contrasena distinta es rechazada', async () => {
  for (const password of ['loquesea', 'Clave—Segura2026', PASSWORD + 'x']) {
    await assert.rejects(
      () => auth.signInWithPassword({ email: 'admin@avfinance.bo', password }),
      (err) => err.status === 401,
      `la contrasena "${password}" no debe abrir el CRM`,
    );
  }
  await assert.rejects(
    () => auth.signInWithPassword({ email: 'admin@avfinance.bo', password: '' }),
    (err) => err.status === 400 && err.code === 'INVALID_CREDENTIALS',
    'una contrasena vacia es un error de forma, no un acceso',
  );
});

test('sin correo o contrasena responde 400 con codigo INVALID_CREDENTIALS', async () => {
  await assert.rejects(
    () => auth.signInWithPassword({}),
    (err) => err.status === 400 && err.code === 'INVALID_CREDENTIALS',
  );
});

test('authenticate acepta la sesion firmada y pobla req.user con expiracion', async () => {
  const { token } = await auth.signInWithPassword({
    email: 'compliance@avfinance.bo',
    password: PASSWORD,
  });
  const { error, user } = await runAuthenticate(auth, token);
  assert.equal(error, null);
  assert.equal(user.role, ROLES.COMPLIANCE);
  assert.ok(user.exp > user.iat);
});

test('authenticate rechaza un token forjado a mano sin pasar por el login', async () => {
  const forjado = `v1.${Buffer.from(JSON.stringify({ id: 'intruso', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.firma-falsa`;
  const { error } = await runAuthenticate(auth, forjado);
  assert.equal(error.status, 401);

  const formatoViejo = `demo.${Buffer.from(JSON.stringify({ id: 'x', role: 'admin' })).toString('base64url')}.${SECRET}`;
  const otro = await runAuthenticate(auth, formatoViejo);
  assert.equal(otro.error.status, 401, 'el formato demo.sin-firma ya no vale');
});

test('authenticate rechaza una sesion adulterada cambiandole el rol', async () => {
  const { token } = await auth.signInWithPassword({ email: 'ventas@avfinance.bo', password: PASSWORD });
  const [, body, signature] = token.split('.');
  const adulterado = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  adulterado.role = ROLES.ADMIN;
  const nuevoBody = Buffer.from(JSON.stringify(adulterado)).toString('base64url');
  const { error } = await runAuthenticate(auth, `v1.${nuevoBody}.${signature}`);
  assert.equal(error.status, 401);
});

test('authenticate rechaza una sesion expirada', async () => {
  const expirado = signSession(
    { id: 'demo-ventas', email: 'ventas@avfinance.bo', role: ROLES.VENTAS, iat: 1, exp: 2 },
    SECRET,
  );
  const { error } = await runAuthenticate(auth, expirado);
  assert.equal(error.status, 401);
});

test('authenticate rechaza una sesion sin cabecera de autorizacion', async () => {
  const { error } = await runAuthenticate(auth, null);
  assert.equal(error.status, 401);
});

test('sin DEMO_MODE y sin Supabase el login responde 503 en lugar de dejar entrar', async () => {
  const bloqueado = buildAuth({ demoMode: false, supabase: null });
  await assert.rejects(
    () => bloqueado.signInWithPassword({ email: 'ventas@avfinance.bo', password: PASSWORD }),
    (err) => err.status === 503 && err.code === 'DATA_LAYER_NOT_CONFIGURED',
  );
  const { error } = await runAuthenticate(bloqueado, 'v1.cualquier.cosa');
  assert.equal(error.status, 503);
});

test('el modo demostracion exige secreto largo y contrasena propia', () => {
  assert.throws(() => createAuth({ demoMode: true, authSecret: 'corto', demoPassword: PASSWORD, demoAccounts: DEMO_ACCOUNTS }), /AUTH_SECRET/);
  assert.throws(
    () => createAuth({ demoMode: true, authSecret: SECRET, demoPassword: '123', demoAccounts: DEMO_ACCOUNTS }),
    /DEMO_PASSWORD/,
  );
  assert.throws(
    () => createAuth({ demoMode: true, authSecret: SECRET, demoPassword: PASSWORD, demoAccounts: [] }),
    /cuentas de demostracion/,
  );
});

test('verifySession rechaza secreto distinto, formato invalido y rol desconocido', () => {
  const token = signSession({ id: 'a', role: ROLES.ADMIN, exp: Math.floor(Date.now() / 1000) + 60 }, SECRET);
  assert.equal(verifySession(token, 'x'.repeat(40)), null);
  assert.equal(verifySession('no-tiene-tres-partes', SECRET), null);
  assert.equal(verifySession(token.replace('v1.', 'v2.'), SECRET), null);
  assert.equal(
    verifySession(
      signSession({ id: 'a', role: 'superusuario', exp: Math.floor(Date.now() / 1000) + 60 }, SECRET),
      SECRET,
    ),
    null,
  );
});

test('requireRole deja pasar al rol autorizado y frena al resto', async () => {
  const guardia = auth.requireRole(ROLES.COMPLIANCE);
  const { token } = await auth.signInWithPassword({ email: 'compliance@avfinance.bo', password: PASSWORD });
  const permitido = await runAuthenticate(auth, token);
  assert.equal(permitido.error, null);

  const call = (req) =>
    new Promise((resolve) => guardia(req, {}, (err) => resolve(err ?? 'paso')));

  assert.equal(await call({ user: { role: ROLES.COMPLIANCE } }), 'paso');
  assert.equal((await call({ user: { role: ROLES.VENTAS } })).status, 403);
  assert.equal((await call({})).status, 401);
});

test('issueAgentToken firma con rol valido y rechaza roles inventados', () => {
  const token = auth.issueAgentToken('compliance-agent');
  const payload = verifySession(token, SECRET);
  assert.equal(payload.id, 'compliance-agent');
  assert.equal(payload.role, ROLES.COMPLIANCE);
  assert.equal(payload.email, 'compliance-agent@alyto.local');
  assert.throws(() => auth.issueAgentToken('x', 'duenio'), /Rol de agente invalido/);
});

test('el catalogo de roles cubre los cinco roles institucionales con etiqueta', () => {
  const valores = Object.values(ROLES);
  assert.equal(valores.length, 5);
  for (const rol of valores) {
    assert.equal(typeof ROLE_LABELS[rol], 'string');
    assert.notEqual(ROLE_LABELS[rol], '');
  }
});

test('las cuentas de demostracion cubren los cinco roles y ninguno se repite', () => {
  const roles = DEMO_ACCOUNTS.map((account) => account.role);
  assert.deepEqual([...roles].sort(), Object.values(ROLES).sort());
  assert.equal(new Set(roles).size, roles.length);
});
