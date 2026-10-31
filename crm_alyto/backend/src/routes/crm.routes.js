import { Router, json as cuerpoJson } from 'express';
import {
  anotarEntrada,
  anotarNota,
  casillasDe,
  contactosDe,
  contenidoDocumento,
  crear,
  cotejosDe,
  editar,
  editarCasilla,
  exentarCasilla,
  personalDe,
  cambiarPersonal,
  corridaMotor,
  documentosDe,
  hilosDe,
  lecturasDisponibles,
  leer,
  moverRuta,
  metricasPanel,
  reclamosDe,
  responder,
  rutasDe,
  senalesDe,
  subirDocumento,
  verFicha,
  verHilo,
  verRuta,
} from '../controllers/crmController.js';
import { requireRole, ROLES } from '../middleware/auth.js';
import { brandLinterMiddleware } from '../middleware/brandLinterMiddleware.js';

// Rutas del CRM. Montadas sobre el guard de sesion y sobre el guard de lectura por fila, y nada
// mas: no hay version en memoria detras de ninguna de estas direcciones.
//
// El linter de marca va delante de cada escritura, no solo del envio de mensajes. La regla 2 del
// capitulo de guardarrailes dice que el filtro corre antes de escribir, y un reclamo, una nota de
// legajo o un motivo de ruta tambien son texto que alguien escribe y que puede quedar en el
// registro.
const router = Router();

router.get('/', lecturasDisponibles);

// ------------------------------------------------------------------ bandeja (F-04, F-05, F-06)
router.get('/bandeja', leer('bandeja'));
router.get('/bandeja/sla', leer('sla'));
router.get('/bandeja/salida', leer('salida'));
router.get('/bandeja/banderas', leer('banderas'));

router.get('/hilos/:id', verHilo);
router.post('/hilos/:id/mensajes', brandLinterMiddleware, responder);
router.patch('/hilos/:id', brandLinterMiddleware, editar('hilos'));

// La entrada anotada a mano por el equipo (el archivador). A proposito NO lleva el linter de marca
// delante: el filtro guarda lo que NOSOTROS escribimos, y el disparador messages_language_guard de
// 0002 solo corre sobre la direccion 'saliente'. Filtrar el texto del cliente perderia su mensaje y
// dejaria el hilo incompleto justo donde la trazabilidad importa, que es el motivo escrito en la
// propia migracion.
router.post('/entrada', anotarEntrada);

// La nota interna si pasa el linter (es texto nuestro). La base ya no la frena por canal porque no
// entra a messages: vive en activities con tipo 'nota'. Ver el porque en src/data/ingesta.js.
router.post('/hilos/:id/notas', brandLinterMiddleware, anotarNota);
router.get('/notas', leer('notas'));

// ------------------------------------------------------------------- las tres rutas (F-17)
router.get('/rutas', leer('rutas'));
router.get('/rutas/tablero', leer('tableroRutas'));
router.get('/rutas/:id', verRuta);
router.post('/rutas', brandLinterMiddleware, crear('rutas'));
router.patch('/rutas/:id', brandLinterMiddleware, moverRuta);

// ---------------------------------------------------------------- senales y viajes (F-24)
router.get('/senales', leer('senales'));
router.post('/senales', brandLinterMiddleware, crear('senales'));
router.patch('/senales/:id', editar('senales'));
router.get('/viajes', leer('viajes'));

// ------------------------------------------------------- legajo, documentos y cotejos (F-14)
router.get('/legajo', leer('legajo'));
router.patch('/casillas/:clientId/:code', brandLinterMiddleware, editarCasilla);
router.post('/casillas/:clientId/:code/exencion',
  requireRole(ROLES.ADMIN, ROLES.COMPLIANCE), brandLinterMiddleware, exentarCasilla);

// La corrida manual del motor de viajes. Es escritura por atajo, asi que solo administracion:
// el ciclo automatico es para todos, el boton es del administrador.
router.post('/motor/corrida', requireRole(ROLES.ADMIN), corridaMotor);

// Panel de metricas del administrador (F-34): los cuatro numeros de trafico del dia. Es una
// lectura de vista de todo el equipo, no del propio rol, asi que es del administrador; si un dia
// la operacion la quiere para compliance u operaciones, se abre ahi.
router.get('/panel', requireRole(ROLES.ADMIN), metricasPanel);

// Personal del CRM (F-03): ver a los miembros y decidir sobre ellos es del administrador.
router.get('/personal', requireRole(ROLES.ADMIN), personalDe);
router.patch('/personal/:id', requireRole(ROLES.ADMIN), brandLinterMiddleware, cambiarPersonal);
router.patch('/documentos/:id', brandLinterMiddleware, editar('documentos'));

// F-18: documentos del legajo. La subida lleva el archivo en base64, asi que esta ruta levanta su
// propio limite de cuerpo (el global queda en 1 MB en app.js). El contenido del archivo lo leen
// administracion, cumplimiento y operaciones: lo guarda en fila la base, no solo el guardia.
router.post('/fichas/:clientId/documentos', cuerpoJson({ limit: '14mb' }), subirDocumento);
router.get('/documentos/:id/contenido',
  requireRole(ROLES.ADMIN, ROLES.COMPLIANCE, ROLES.OPERACIONES), contenidoDocumento);
router.get('/requisitos', leer('requisitos'));
router.get('/cotejos', leer('cotejos'));

// ----------------------------------------------------------------------- reclamos (F-13)
router.get('/reclamos', leer('reclamos'));
router.post('/reclamos', requireRole(ROLES.ADMIN, ROLES.COMPLIANCE, ROLES.SOPORTE),
  brandLinterMiddleware, crear('reclamos'));
router.patch('/reclamos/:id', requireRole(ROLES.ADMIN, ROLES.COMPLIANCE, ROLES.SOPORTE),
  brandLinterMiddleware, editar('reclamos'));

// ---------------------------------------------------------------------- agenda (F-30)
router.get('/actividades', leer('actividades'));
router.post('/actividades', brandLinterMiddleware, crear('actividades'));
router.patch('/actividades/:id', brandLinterMiddleware, editar('actividades'));

// ------------------------------------------------------------------ el registro (F-15)
// Solo administracion y cumplimiento lo leen por interfaz, y la politica audit_read de 0004 dice
// lo mismo. Son dos guardas con el mismo criterio a proposito: el de arriba no reemplaza al de la
// base, porque la base es la que manda cuando alguien llega por otro camino.
router.get('/registro', requireRole(ROLES.ADMIN, ROLES.COMPLIANCE), leer('registro'));

// ---------------------------------------------------------------- cuentas y ficha (F-16)
router.get('/cuentas', leer('cuentas'));
router.post('/cuentas', brandLinterMiddleware, crear('cuentas'));
router.patch('/cuentas/:id', brandLinterMiddleware, editar('cuentas'));
router.get('/fichas/:clientId', verFicha);
router.get('/fichas/:clientId/contactos', contactosDe);
router.get('/fichas/:clientId/casillas', casillasDe);
router.get('/fichas/:clientId/documentos', documentosDe);
router.get('/fichas/:clientId/rutas', rutasDe);
router.get('/fichas/:clientId/hilos', hilosDe);
router.get('/fichas/:clientId/senales', senalesDe);
router.get('/fichas/:clientId/cotejos', cotejosDe);
router.get('/fichas/:clientId/reclamos', reclamosDe);

// ----------------------------------------------------- material de trabajo y configuracion
router.get('/plantillas', leer('plantillas'));
router.get('/contactos', leer('contactos'));
router.post('/contactos', brandLinterMiddleware, crear('contactos'));
router.patch('/contactos/:id', brandLinterMiddleware, editar('contactos'));

// El diccionario y los parametros del entorno los lee solo administracion y cumplimiento: el
// linter del backend ya los trae a la memoria con la llave de servicio, y desde la interfaz no hay
// nada que hacer con la lista de terminos vetados.
router.get('/glosario', requireRole(ROLES.ADMIN, ROLES.COMPLIANCE), leer('terminos'));
router.get('/parametros', requireRole(ROLES.ADMIN, ROLES.COMPLIANCE), leer('parametros'));

export default router;
