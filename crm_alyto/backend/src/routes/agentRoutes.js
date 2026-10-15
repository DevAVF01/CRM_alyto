import { Router } from 'express';
import { communicationsController } from '../controllers/communicationsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/templates', authMiddleware, communicationsController.getTemplates);
router.get('/objections', authMiddleware, communicationsController.getObjectionsCatalog);
router.post('/support-ai/query', authMiddleware, communicationsController.askSupportAi);
router.get('/communications/history', authMiddleware, communicationsController.getDispatchedCommunications);
router.post('/communications/dispatch', authMiddleware, communicationsController.dispatchCommunication);

export default router;
