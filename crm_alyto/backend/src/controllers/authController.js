import { signInWithPassword } from '../middleware/auth.js';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const session = await signInWithPassword({ email, password });
    return res.json({ data: session });
  } catch (err) {
    return next(err);
  }
}

export function me(req, res) {
  return res.json({ data: { user: req.user } });
}
