import 'dotenv/config';
import { ROLES, assertAuthSecret, signSession } from 'security-auth';

const AGENT_ROLES = {
  'compliance-agent': ROLES.COMPLIANCE,
  'pipeline-agent': ROLES.OPERACIONES,
  'support-ai-agent': ROLES.SOPORTE,
};

const [agent, requestedRole] = process.argv.slice(2);

if (!agent || !(agent in AGENT_ROLES)) {
  console.error(`Uso: npm run agent-token -- ${Object.keys(AGENT_ROLES).join(' | ')} [rol]`);
  console.error('Roles posibles: ' + Object.values(ROLES).join(', '));
  process.exit(1);
}

const role = requestedRole ?? AGENT_ROLES[agent];
if (!Object.values(ROLES).includes(role)) {
  console.error(`Rol desconocido: ${role}. Roles posibles: ${Object.values(ROLES).join(', ')}`);
  process.exit(1);
}

const ttlSeconds = Number(process.env.SESSION_TTL_SECONDS || 12 * 3600);
assertAuthSecret(process.env.AUTH_SECRET);
const now = Math.floor(Date.now() / 1000);

const token = signSession(
  { id: agent, email: `${agent}@alyto.local`, role, iat: now, exp: now + ttlSeconds },
  process.env.AUTH_SECRET,
);

console.log(token);
console.error(
  `Agente ${agent} con rol ${role}, valido hasta ${new Date((now + ttlSeconds) * 1000).toISOString()}. ` +
    `Agregue AGENT_TOKEN=<token> al .env de agents/${agent}.`,
);
