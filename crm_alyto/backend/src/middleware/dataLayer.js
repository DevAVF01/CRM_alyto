import { storeAllowed } from '../config/runtime.js';

// Sin DEMO_MODE activo no se sirve el almacen en memoria. Si ademas falta la capa de
// repositorio, la respuesta correcta es un error visible, no datos de demostracion.
export function requireDataLayer(req, res, next) {
  if (storeAllowed()) return next();
  return res.status(503).json({
    error: {
      code: 'DATA_LAYER_NOT_CONFIGURED',
      message:
        'El backend no tiene capa de datos habilitada. Los datos de demostracion solo se sirven con DEMO_MODE=true; ' +
        'con credenciales de Supabase hace falta la capa de repositorio, que todavia no esta implementada.',
    },
  });
}
