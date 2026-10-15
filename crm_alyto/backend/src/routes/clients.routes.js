import { Router } from 'express';
import { listClients, getClient } from '../controllers/clientsController.js';

const router = Router();
router.get('/', listClients);
router.get('/:id', getClient);

export default router;
