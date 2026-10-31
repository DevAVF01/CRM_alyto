import { repository } from '../data/repository.js';
import { corrida as corridaMotorService } from '../motor/planificador.js';
import * as personal from '../data/personal.js';
import * as documentos from '../data/documentos.js';
import * as panel from '../data/panel.js';

// Controladores del CRM. Todos salen del mismo molde: traducir la peticion a una orden contra la
// base y convertir el resultado en JSON. No hay logica de negocio aca a proposito. Si manana
// cambia la forma de una pantalla, cambia el puente; si cambia una regla, cambia la base.

function responde(ejecutar) {
  return async (req, res, next) => {
    try {
      return res.json({ data: await ejecutar(req) });
    } catch (err) {
      return next(err);
    }
  };
}

// Lectura de vista o de tabla, con los filtros declarados en la capa de datos.
export const leer = (nombre) => responde((req) => repository.leerLista(req, nombre));

// Alta. El 201 lo pone la ruta, no el molde: hay lecturas que tambien usan responde.
export const crear = (nombre) => async (req, res, next) => {
  try {
    return res.status(201).json({ data: await repository.crear(req, nombre, req.body ?? {}) });
  } catch (err) {
    return next(err);
  }
};

export const editar = (nombre) => async (req, res, next) => {
  try {
    return res.json({ data: await repository.editar(req, nombre, req.params.id, req.body ?? {}) });
  } catch (err) {
    return next(err);
  }
};

// El hijo de una cuenta, por la columna que la pantalla trae en la URL.
function hijosDe(nombre, columna) {
  return responde((req) => repository.leerHijos(req, nombre, req.params.clientId, columna));
}

// Hilo completo: conversacion y mensajes en orden cronologico.
export const verHilo = responde(async (req) => {
  const hilo = await repository.hilo(req, req.params.id);
  if (!hilo) {
    const err = new Error('La conversacion no existe o no esta visible para este usuario');
    err.status = 404;
    err.expose = true;
    err.code = 'CONVERSATION_NOT_FOUND';
    throw err;
  }
  return hilo;
});

export const responder = (req, res, next) =>
  repository.responder(req, req.params.id, req.body ?? {})
    .then((mensaje) => res.status(201).json({ data: mensaje }))
    .catch(next);

// Archivar una entrada que alguien esta anotando a mano: el cliente escribio por WhatsApp, por
// correo o por telefono y el agente lo deja en el sistema. Es la puerta del archivador
// (src/data/ingesta.js) y responde 201 porque nace un mensaje, y en la mayoria de los casos un hilo.
export const anotarEntrada = (req, res, next) =>
  repository.anotarEntrada(req, req.body ?? {})
    .then((resultado) => res.status(resultado.duplicado ? 200 : 201).json({ data: resultado }))
    .catch(next);

// La nota interna del equipo sobre un hilo que ya existe.
export const anotarNota = (req, res, next) =>
  repository.anotarNota(req, req.params.id, req.body ?? {})
    .then((resultado) => res.status(201).json({ data: resultado }))
    .catch(next);

// Ruta con su historial de movimientos.
export const verRuta = responde(async (req) => {
  const detalle = await repository.ruta(req, req.params.id);
  if (!detalle) {
    const err = new Error('La ruta no existe o no esta visible para este usuario');
    err.status = 404;
    err.expose = true;
    err.code = 'ROUTE_NOT_FOUND';
    throw err;
  }
  return detalle;
});

// Mover una ruta es cambiar estado y escribir el motivo en la misma orden: el disparador copia el
// motivo al asiento del historial, y la restriccion routes_motivo_obligatorio rechaza el intento
// de bloquear o cerrar sin explicacion. Dejar el motivo aparte seria un historial mudo.
export const moverRuta = (req, res, next) =>
  repository.editar(req, 'rutas', req.params.id, req.body ?? {})
    .then((fila) => res.json({ data: fila }))
    .catch(next);

// Ficha 360: la cuenta con sus nueve bloques, en una sola respuesta para la pantalla.
export const verFicha = responde(async (req) => {
  const ficha = await repository.ficha(req, req.params.clientId);
  if (!ficha) {
    const err = new Error('La cuenta no existe o no esta visible para este usuario');
    err.status = 404;
    err.expose = true;
    err.code = 'CLIENT_NOT_FOUND';
    throw err;
  }
  return ficha;
});

export const casillasDe = hijosDe('casillas', 'client_id');

// Revisar una casilla del legajo es modificar el par (cuenta, requisito), no un id: la tabla
// document_reviews no tiene columna id porque su llave natural es justamente esa pareja.
export const editarCasilla = (req, res, next) =>
  repository.editarCasilla(req, req.params.clientId, req.params.code, req.body ?? {})
    .then((fila) => res.json({ data: fila }))
    .catch(next);

// La exencion: la potestad del administrador de aprobar una casilla sin documento, con el
// asiento de auditoria escrito por la base en la misma transaccion.
export const exentarCasilla = (req, res, next) =>
  repository.exentarCasilla(req, req.params.clientId, req.params.code, req.body ?? {})
    .then((fila) => res.json({ data: fila }))
    .catch(next);

// La corrida manual del motor de viajes: la misma maquina que corre sola cada minuto y
// medio, pero a pedido del administrador. Devuelve el resumen de lo que hizo.
export const corridaMotor = (req, res, next) => {
  corridaMotorService(req.app.locals.logger)
    .then((resultado) => res.json({ data: resultado }))
    .catch(next);
};

// Personal del CRM (F-03): el listado para la pantalla del administrador y el cambio de
// estado/rol con su asiento. La solicitud propia vive en authController (no pide sesion).
export const personalDe = (req, res, next) =>
  personal.listar(req)
    .then((lista) => res.json({ data: lista }))
    .catch(next);

export const cambiarPersonal = (req, res, next) =>
  personal.cambiar(req, req.params.id, req.body ?? {})
    .then((fila) => res.json({ data: fila }))
    .catch(next);

// Legajo de documentos (F-18): la subida carga el archivo en base64 y responde con la fila de
// metadatos; el contenido baja directo de el cubo con nombre y tipo bien puestos.
export const subirDocumento = (req, res, next) =>
  documentos.subir(req, req.params.clientId, req.body ?? {})
    .then((fila) => res.status(201).json({ data: fila }))
    .catch(next);

export const contenidoDocumento = (req, res, next) =>
  documentos.contenido(req, req.params.id)
    .then((archivo) => {
      // Los nombres con unicode van en la forma RFC 5987, con un fallback ascii al lado.
      res.setHeader('Content-Type', archivo.mime);
      res.setHeader('Content-Disposition',
        `attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(archivo.filename)}`);
      res.send(archivo.buffer);
    })
    .catch(next);

// Panel de metricas (F-34): los cuatro numeros de trafico de la operacion del dia, leidos de
// las vistas de medicion con el token del administrador.
export const metricasPanel = (req, res, next) =>
  panel.metricas(req)
    .then((semaforos) => res.json({ data: semaforos }))
    .catch(next);
export const documentosDe = hijosDe('documentos', 'client_id');
export const contactosDe = hijosDe('contactos', 'client_id');
export const rutasDe = hijosDe('rutas', 'client_id');
export const hilosDe = hijosDe('hilos', 'client_id');
export const senalesDe = hijosDe('senales', 'client_id');
export const cotejosDe = hijosDe('cotejos', 'client_id');
export const reclamosDe = hijosDe('reclamos', 'client_id');

// Lo que el puente puede leer, dicho desde el propio puente: la interfaz se arma con esta lista y
// no con una copia hecha a mano que se desactualiza.
export function lecturasDisponibles(req, res) {
  return res.json({
    data: {
      baseConfigurada: repository.configured(),
      vistas: repository.vistas,
      tablas: repository.tablas,
      usuario: req.user.email,
      rol: req.user.role,
    },
  });
}
