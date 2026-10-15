import { store } from '../data/store.js';
import { notificationService } from '../services/notificationService.js';
import { getFirebaseMessaging } from '../config/firebase.js';

export async function vapidKey(req, res, next) {
  try {
    const data = await notificationService.vapidPublicKey();
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

export function subscribe(req, res) {
  const { subscription, userId } = req.body || {};
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: { code: 'INVALID_SUBSCRIPTION', message: 'subscription.endpoint es requerido' } });
  }
  const total = store.addSubscription({ userId: userId || req.user?.email, subscription });
  return res.status(201).json({ data: { subscribed: true, total } });
}

export async function sendTest(req, res, next) {
  try {
    const { title, body, userId } = req.body || {};
    let result = { sent: 0, failed: 0 };
    let channel = 'vapid';
    try {
      result = await notificationService.sendPush({ title, body, userId });
    } catch {
      channel = 'fcm';
      const messaging = getFirebaseMessaging(req.app.locals.logger);
      if (messaging) {
        await messaging.send({ notification: { title: title || 'Alyto CRM', body: body || 'Notificacion institucional' }, topic: 'ecp-operaciones' });
        result = { sent: 1, failed: 0 };
      }
    }
    store.addAudit('notificacion_push', `Notificacion test enviada por canal ${channel}`, req.user?.email);
    return res.json({ data: { channel, result } });
  } catch (err) {
    return next(err);
  }
}
