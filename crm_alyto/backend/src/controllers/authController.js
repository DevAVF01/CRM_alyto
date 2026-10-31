import { signInWithPassword } from '../middleware/auth.js';
import { solicitud } from '../data/personal.js';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const session = await signInWithPassword({ email, password });
    return res.json({ data: session });
  } catch (err) {
    return next(err);
  }
}

// F-03: la solicitud de cuenta propia. No pide sesion: es el formulario de entrada. La cuenta
// queda creada y pendiente (is_active false), y su asiento 'solicitud_cuenta' queda en el
// registro a la vista del administrador.
export async function solicitudCuenta(req, res, next) {
  try {
    const fila = await solicitud(req.body ?? {});
    return res.status(201).json({ data: fila });
  } catch (err) {
    return next(err);
  }
}

export function me(req, res) {
  return res.json({ data: { user: req.user } });
}
