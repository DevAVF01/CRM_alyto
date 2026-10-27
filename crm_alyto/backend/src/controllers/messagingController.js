import { repository } from '../data/repository.js';

// Cada lectura vive en la capa de repositorio; el controlador solo traduce el resultado a JSON.
function lectura(nombre) {
  return async (req, res, next) => {
    try {
      return res.json({ data: await repository[nombre](req) });
    } catch (err) {
      return next(err);
    }
  };
}

export const listInbox = lectura('inbox');
export const listConversacionesSla = lectura('conversacionesSla');
export const listCadenciaPendiente = lectura('cadenciaPendiente');
export const listReclamosSla = lectura('reclamosSla');

export function lecturasDisponibles(req, res) {
  return res.json({
    data: {
      baseConfigurada: repository.configured(),
      vistas: repository.lecturas,
      usuario: req.user.email,
    },
  });
}
