import { createAuth } from 'security-auth';
import { supabase } from '../config/supabase.js';

const auth = createAuth({ supabase });

export { ROLES, ROLE_LABELS } from 'security-auth';
export const { signInWithPassword, authenticate, requireRole, issueAgentToken } = auth;
