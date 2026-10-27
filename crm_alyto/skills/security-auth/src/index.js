import { createHmac, timingSafeEqual } from 'node:crypto';

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  COMPLIANCE: 'compliance',
  OPERACIONES: 'operaciones',
  VENTAS: 'ventas',
  SOPORTE: 'soporte',
});

export const ROLE_LABELS = Object.freeze({
  admin: 'Administrador',
  compliance: 'Oficial de Cumplimiento',
  operaciones: 'Operaciones',
  ventas: 'Fuerza de Ventas B2B',
  soporte: 'Atencion y Soporte',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const TOKEN_PREFIX = 'v1';
const MIN_SECRET_LENGTH = 32;
const SESSION_TTL_SECONDS = 12 * 3600;

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  err.code = code ?? (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST');
  return err;
}

export function assertAuthSecret(secret) {
  if (typeof secret !== 'string' || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET falta o es demasiado corto. Hace falta una cadena aleatoria de al menos ${MIN_SECRET_LENGTH} caracteres. ` +
        'Sin ese secreto el backend no arranca, porque un token sin firma se puede fabricar a mano.',
    );
  }
  return secret;
}

function signature(body, secret) {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function signSession(payload, secret) {
  assertAuthSecret(secret);
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${TOKEN_PREFIX}.${body}.${signature(body, secret)}`;
}

export function verifySession(token, secret, nowSeconds) {
  if (typeof token !== 'string' || typeof secret !== 'string') return null;
  const [prefix, body, supplied] = token.split('.');
  if (prefix !== TOKEN_PREFIX || !body || !supplied) return null;

  const expected = signature(body, secret);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.id !== 'string' || !ROLE_VALUES.includes(payload.role)) return null;

  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  return payload;
}

function lookupDemoAccount(demoAccounts, email) {
  const wanted = String(email || '')
    .trim()
    .toLowerCase();
  if (!wanted) return null;
  return demoAccounts.find((account) => String(account.email).toLowerCase() === wanted) ?? null;
}

export function createAuth({
  supabase = null,
  demoMode = false,
  authSecret = process.env.AUTH_SECRET,
  demoAccounts = [],
  demoPassword = process.env.DEMO_PASSWORD,
  sessionTtlSeconds = SESSION_TTL_SECONDS,
  roleResolver = null,
} = {}) {
  if (demoMode) {
    assertAuthSecret(authSecret);
    if (typeof demoPassword !== 'string' || demoPassword.length < 8) {
      throw new Error('DEMO_PASSWORD falta o tiene menos de 8 caracteres. En modo demostracion la contrasena tambien se valida.');
    }
    if (demoAccounts.length === 0) {
      throw new Error('No hay cuentas de demostracion configuradas. El backend no puede aceptar correos libres.');
    }
  }

  // El unico sitio que dice que rol tiene una persona es la tabla profiles, leida por la
  // funcion current_role_name(). Sin ese camino, quien entra por Supabase quedaria con un rol
  // supuesto y los guardamatos de requireRole no significarian nada.
  if (supabase && typeof roleResolver !== 'function') {
    throw new Error('Con Supabase configurado hace falta un roleResolver que lea el rol desde la base del CRM.');
  }

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  async function roleFromDatabase(accessToken) {
    const rol = await roleResolver(accessToken);
    if (!ROLE_VALUES.includes(rol)) {
      throw httpError(
        403,
        'La cuenta no tiene un perfil activo con rol asignado en la base del CRM. La administracion debe crearlo.',
        'PROFILE_WITHOUT_ROLE',
      );
    }
    return rol;
  }

  function issueSession(account) {
    return signSession(
      {
        id: account.id,
        email: account.email,
        role: account.role,
        iat: nowSeconds(),
        exp: nowSeconds() + sessionTtlSeconds,
      },
      authSecret,
    );
  }

  async function signInWithPassword({ email, password } = {}) {
    if (!email || !password) throw httpError(400, 'Email y contrasena requeridos', 'INVALID_CREDENTIALS');

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw httpError(401, 'Credenciales invalidas');
      const role = await roleFromDatabase(data.session.access_token);
      return {
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          role,
        },
      };
    }

    if (!demoMode) {
      throw httpError(503, 'Sin base de datos configurada y sin modo demostracion activo', 'DATA_LAYER_NOT_CONFIGURED');
    }
    const account = lookupDemoAccount(demoAccounts, email);
    if (!account || password !== demoPassword) throw httpError(401, 'Credenciales invalidas');
    return { token: issueSession(account), user: { id: account.id, email: account.email, role: account.role } };
  }

  async function authenticate(req, res, next) {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) throw httpError(401, 'Token de autorizacion requerido');

      if (!supabase && !demoMode) {
        throw httpError(503, 'Sin base de datos configurada y sin modo demostracion activo', 'DATA_LAYER_NOT_CONFIGURED');
      }

      // Una sesion firmada por el propio CRM (los cinco correos en modo demostracion y los
      // tokens de agente) se valida con AUTH_SECRET, y sigue siendo valida con Supabase montado:
      // si no, al pasar a la base real los agentes quedarian fuera del sistema.
      if (token.startsWith(`${TOKEN_PREFIX}.`)) {
        const payload = verifySession(token, authSecret);
        if (!payload) throw httpError(401, 'Sesion invalida o expirada');
        req.user = payload;
        return next();
      }

      if (supabase) {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) throw httpError(401, 'Sesion invalida o expirada');
        req.user = {
          id: data.user.id,
          email: data.user.email,
          role: await roleFromDatabase(token),
        };
        return next();
      }

      // Modo demostracion: aca solo valen sesiones propias, un token de otro lado no abre nada.
      throw httpError(401, 'Sesion invalida o expirada');
    } catch (err) {
      return next(err);
    }
  }

  function requireRole(...allowed) {
    return (req, res, next) => {
      if (!req.user) return next(httpError(401, 'Autenticacion requerida'));
      if (!allowed.includes(req.user.role)) {
        return next(httpError(403, 'Permisos insuficientes para esta operacion'));
      }
      return next();
    };
  }

  function issueAgentToken(agent, role = ROLES.COMPLIANCE) {
    if (!ROLE_VALUES.includes(role)) throw new Error(`Rol de agente invalido: ${role}`);
    return issueSession({ id: agent, email: `${agent}@alyto.local`, role });
  }

  return { signInWithPassword, authenticate, requireRole, issueAgentToken };
}
