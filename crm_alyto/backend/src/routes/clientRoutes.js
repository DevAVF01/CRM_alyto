import { Router } from 'express';
import { client360Controller } from '../controllers/client360Controller.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authMiddleware, client360Controller.getAllClients);
router.get('/:clientId', authMiddleware, client360Controller.getClientById);
router.patch('/:clientId/checklist', authMiddleware, client360Controller.updateChecklist);
router.post('/:clientId/wallet', authMiddleware, client360Controller.generateWallet);

export default router;
