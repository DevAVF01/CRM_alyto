import { supabase } from '../config/supabase.js';

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // Para simplificar pruebas en ECP local, inyectamos usuario por defecto
    req.user = {
      id: 'usr_ecp_officer_01',
      email: 'cumplimiento@avfinance.bo',
      fullName: 'Oficial de Cumplimiento ECP',
      role: 'COMPLIANCE_OFFICER'
    };
    return next();
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Sesión no válida o expirada' });
  }

  req.user = {
    id: data.user.id,
    email: data.user.email,
    role: data.user.user_metadata?.role || 'COMPLIANCE_OFFICER',
    fullName: data.user.user_metadata?.fullName || 'Usuario Alyto'
  };

  next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado: rol institucional insuficiente' });
    }
    next();
  };
}
