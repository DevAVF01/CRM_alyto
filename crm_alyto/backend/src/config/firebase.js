import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let messaging = null;
let attempted = false;

export function getFirebaseMessaging(logger) {
  if (attempted) return messaging;
  attempted = true;
  if (getApps().length > 0) {
    messaging = getMessaging();
    return messaging;
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) return null;
  try {
    initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    messaging = getMessaging();
    logger?.info('firebase_admin_inicializado');
  } catch (err) {
    logger?.warn(`firebase_admin_no_inicializado: ${err.message}`);
    messaging = null;
  }
  return messaging;
}
