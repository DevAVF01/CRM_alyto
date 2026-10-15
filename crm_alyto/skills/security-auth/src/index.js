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

const DEFAULT_DEMO_SECRET = 'ecp-demo';

function encodeDemoToken(payload, secret) {
  return `demo.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${secret}`;
}

function decodeDemoToken(token, secret) {
  const [prefix, body, suffix] = token.split('.');
  if (prefix !== 'demo' || !body || suffix !== secret) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  err.code = code ?? (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST');
  return err;
}

const DEMO_ROLE_PATTERNS = [
  [/^admin[@._+-]/i, ROLES.ADMIN],
  [/^(compliance|cumplimiento)[@._+-]/i, ROLES.COMPLIANCE],
  [/^(operaciones|ops)[@._+-]/i, ROLES.OPERACIONES],
  [/^(soporte|support)[@._+-]/i, ROLES.SOPORTE],
];

function inferDemoRole(email) {
  for (const [pattern, role] of DEMO_ROLE_PATTERNS) {
    if (pattern.test(email)) return role;
  }
  return ROLES.VENTAS;
}

export function createAuth({ supabase = null } = {}) {
  const demoSecret = process.env.DEMO_AUTH_SECRET || DEFAULT_DEMO_SECRET;

  async function signInWithPassword({ email, password } = {}) {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw httpError(401, 'Credenciales invalidas');
      return {
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.app_metadata?.role || ROLES.VENTAS,
        },
      };
    }
    if (!email || !password) throw httpError(400, 'Email y contrasena requeridos', 'INVALID_CREDENTIALS');
    const user = { id: `demo-${Date.now()}`, email, role: inferDemoRole(email) };
    return { token: encodeDemoToken(user, demoSecret), user };
  }

  async function authenticate(req, res, next) {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) throw httpError(401, 'Token de autorizacion requerido');

      if (supabase) {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) throw httpError(401, 'Sesion invalida o expirada');
        req.user = {
          id: data.user.id,
          email: data.user.email,
          role: data.user.app_metadata?.role || ROLES.VENTAS,
        };
        return next();
      }

      const payload = decodeDemoToken(token, demoSecret);
      if (!payload) throw httpError(401, 'Sesion invalida o expirada');
      req.user = payload;
      return next();
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

  function issueAgentToken(agent) {
    return encodeDemoToken({ id: agent, email: `${agent}@alyto.local`, role: ROLES.COMPLIANCE }, demoSecret);
  }

  return { signInWithPassword, authenticate, requireRole, issueAgentToken };
}
