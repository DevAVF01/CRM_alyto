import { Router } from 'express';
import {
  getTemplate,
  listObjections,
  listTemplates,
  sendTemplate,
} from '../controllers/communicationsController.js';
import { requireRole, ROLES } from '../middleware/auth.js';

const router = Router();
router.get('/templates', listTemplates);
router.get('/templates/:id', getTemplate);
router.get('/objections', listObjections);
router.post('/send', requireRole(ROLES.ADMIN, ROLES.VENTAS, ROLES.SOPORTE), sendTemplate);

export default router;
