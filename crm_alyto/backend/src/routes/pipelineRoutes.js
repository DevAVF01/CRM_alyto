import { Router } from 'express';
import { pipelineController } from '../controllers/pipelineController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/stages', authMiddleware, pipelineController.getStages);
router.get('/deals', authMiddleware, pipelineController.getAllDeals);
router.get('/metrics', authMiddleware, pipelineController.getMetrics);
router.post('/deals', authMiddleware, pipelineController.createDeal);
router.patch('/deals/:dealId/stage', authMiddleware, pipelineController.advanceDealStage);

export default router;
