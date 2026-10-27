import { Router } from 'express';
import {
  listCadenciaPendiente,
  listConversacionesSla,
  listInbox,
  listReclamosSla,
  lecturasDisponibles,
} from '../controllers/messagingController.js';

const router = Router();

router.get('/', lecturasDisponibles);
router.get('/inbox', listInbox);
router.get('/sla', listConversacionesSla);
router.get('/cadencia', listCadenciaPendiente);
router.get('/reclamos', listReclamosSla);

export default router;
