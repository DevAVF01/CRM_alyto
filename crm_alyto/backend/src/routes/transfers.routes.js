import { Router } from 'express';
import { listTransfers } from '../controllers/clientsController.js';

const router = Router();
router.get('/', listTransfers);

export default router;
