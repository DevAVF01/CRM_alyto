import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://demo-ecp.supabase.co',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'demo-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'demo-service-role-key',
  STELLAR_NETWORK: process.env.STELLAR_NETWORK || 'TESTNET',
  STELLAR_HORIZON_URL: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'alyto-crm-ecp',
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxKv69yViEuiBIa-Ib9-SkvMeAtA3LFgD8r6YKx8wFv_test_key',
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};
