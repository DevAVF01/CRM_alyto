import { Router } from 'express';
import {
  addAudit,
  directrices,
  getChecklist,
  limits,
  listAudit,
  summary,
  updateChecklistItem,
} from '../controllers/complianceController.js';
import { requireRole, ROLES } from '../middleware/auth.js';

const router = Router();
router.get('/summary', summary);
router.get('/limits', limits);
router.get('/directrices', directrices);
router.get('/checklist/:clientId', getChecklist);
router.post('/checklist/:clientId/items/:itemKey', requireRole(ROLES.ADMIN, ROLES.COMPLIANCE), updateChecklistItem);
router.get('/audit', listAudit);
router.post('/audit', requireRole(ROLES.ADMIN, ROLES.COMPLIANCE), addAudit);

export default router;
