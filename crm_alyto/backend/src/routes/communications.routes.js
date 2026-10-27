import { Router } from 'express';
import {
  getTemplate,
  listObjections,
  listTemplates,
  sendTemplate,
} from '../controllers/communicationsController.js';
import { requireRole, ROLES } from '../middleware/auth.js';
import { brandLinterMiddleware } from '../middleware/brandLinterMiddleware.js';

const router = Router();
router.get('/templates', listTemplates);
router.get('/templates/:id', getTemplate);
router.get('/objections', listObjections);

// El linter va delante del envio: un texto con termino vetado no llega al disparador de la base
// ni a un canal real. Las variables las escribe una persona, y ahi es donde se cuela un termino
// prohibido dentro de una plantilla aprobada.
router.post('/send', requireRole(ROLES.ADMIN, ROLES.VENTAS, ROLES.SOPORTE), brandLinterMiddleware, sendTemplate);

export default router;
