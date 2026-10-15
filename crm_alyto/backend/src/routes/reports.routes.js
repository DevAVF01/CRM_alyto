import { Router } from 'express';
import { transferReceipt, validationSheet } from '../controllers/reportsController.js';
import { requireRole, ROLES } from '../middleware/auth.js';

const router = Router();
router.post('/transfer-receipt', requireRole(ROLES.ADMIN, ROLES.OPERACIONES, ROLES.VENTAS), transferReceipt);
router.get('/validation-sheet/:clientId', requireRole(ROLES.ADMIN, ROLES.COMPLIANCE), validationSheet);

export default router;
