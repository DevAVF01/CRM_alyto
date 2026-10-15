import { Router } from 'express';
import { transferReceiptController } from '../controllers/transferReceiptController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/generate', authMiddleware, transferReceiptController.generateReceipt);

export default router;
