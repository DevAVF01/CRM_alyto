import { Router } from 'express';
import { sendTest, subscribe, vapidKey } from '../controllers/notificationsController.js';

const router = Router();
router.get('/vapid-public-key', vapidKey);
router.post('/subscriptions', subscribe);
router.post('/test-push', sendTest);

export default router;
