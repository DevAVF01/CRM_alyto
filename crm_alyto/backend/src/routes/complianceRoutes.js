import { Router } from 'express';
import { complianceController } from '../controllers/complianceController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/overview', authMiddleware, complianceController.getOverview);
router.get('/audit-logs', authMiddleware, complianceController.getAuditLogs);
router.post('/screening', authMiddleware, complianceController.runSanctionsScreening);
router.post('/audit-text', authMiddleware, complianceController.auditText);

export default router;
