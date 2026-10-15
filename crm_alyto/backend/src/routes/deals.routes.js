import { Router } from 'express';
import { listDeals, createDeal, moveDeal } from '../controllers/dealsController.js';
import { requireRole, ROLES } from '../middleware/auth.js';

const router = Router();
router.get('/', listDeals);
router.post('/', requireRole(ROLES.ADMIN, ROLES.VENTAS, ROLES.OPERACIONES), createDeal);
router.patch('/:id/stage', requireRole(ROLES.ADMIN, ROLES.VENTAS, ROLES.OPERACIONES), moveDeal);

export default router;
