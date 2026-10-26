import { createAuth } from 'security-auth';
import { supabase } from '../config/supabase.js';
import { demoMode } from '../config/runtime.js';
import { DEMO_ACCOUNTS } from '../data/demoAccounts.js';

export { ROLES, ROLE_LABELS } from 'security-auth';

let instance = null;

// Se construye al primer uso porque createAuth exige AUTH_SECRET y DEMO_PASSWORD cuando
// DEMO_MODE esta activo, y esos valores pueden faltar al importar modulos en pruebas.
function auth() {
  if (!instance) {
    instance = createAuth({ supabase, demoMode: demoMode(), demoAccounts: [...DEMO_ACCOUNTS] });
  }
  return instance;
}

export const signInWithPassword = (input) => auth().signInWithPassword(input);

export const authenticate = (req, res, next) => auth().authenticate(req, res, next);

export const requireRole = (...allowed) => (req, res, next) => auth().requireRole(...allowed)(req, res, next);

export const issueAgentToken = (agent, role) => auth().issueAgentToken(agent, role);
