const REQUIRED: Record<string, string> = {
  DATABASE_URL:             'Neon PostgreSQL connection string',
  REDIS_URL:                'Redis connection URL',
  JWT_SECRET:               'JWT signing secret (min 32 chars)',
  JWT_REFRESH_SECRET:       'JWT refresh secret (min 32 chars)',
  SMS_PROVIDER:             'SMS provider for OTP: msg91 (default) or twilio',
  BUNNY_STREAM_LIBRARY_ID:  'Bunny Stream library ID (number in the library URL)',
  BUNNY_STREAM_API_KEY:     'Bunny Stream API key (library → API)',
  BUNNY_TOKEN_AUTH_KEY:     'Bunny token auth key (library → Security → Token authentication)',
  BUNNY_CDN_HOSTNAME:       'Bunny Stream CDN hostname (vz-XXXX.b-cdn.net, no protocol)',
  BUNNY_WEBHOOK_SECRET:     'Secret embedded in the webhook URL registered with Bunny',
  FCM_SERVICE_ACCOUNT_JSON: 'Firebase service account JSON for FCM HTTP v1',
  AGORA_APP_ID:             'Agora App ID',
  AGORA_APP_CERTIFICATE:    'Agora App Certificate for token generation',
};

const OPTIONAL: Record<string, string> = {
  BUNNY_STORAGE_API_KEY: 'Bunny Storage zone password (only when file storage is used)',
  BUNNY_STORAGE_ZONE:    'Bunny Storage zone name (only when file storage is used)',
  BUNNY_PULL_ZONE_URL:   'Bunny Storage pull-zone URL (only when file storage is used)',
  AI_SERVICE_URL:     'Base URL of the Python AI service (doubts escalate to mentors when unset)',
  AI_INTERNAL_KEY:    'Shared secret for the AI service (X-Internal-Key)',
  CA_RSS_FEEDS:       'Comma-separated RSS URLs for current affairs (has defaults)',
  // Embeddings config lives in the AI service (EMBEDDINGS_* in apps/ai/.env)
  SENTRY_DSN:         'Sentry error reporting DSN',
  PORT:               'HTTP port (default 3000)',
  COOKIE_SECRET:      'Cookie signing secret (falls back to JWT_SECRET)',
  REDIS_KEY_PREFIX:   'Redis key namespace (default inspiro:)',
  NODE_ENV:           'node environment (default development)',
};

// Provider-specific requirements, keyed by SMS_PROVIDER
const SMS_REQUIRED: Record<string, Record<string, string>> = {
  msg91: {
    MSG91_AUTH_KEY: 'MSG91 auth key (control.msg91.com → Authkey)',
    // MSG91_TEMPLATE_ID is validated at OTP send-time (sms.ts), not at boot,
    // so the API can start while DLT template approval is still pending.
  },
  twilio: {
    TWILIO_ACCOUNT_SID:  'Twilio Account SID',
    TWILIO_AUTH_TOKEN:   'Twilio auth token',
    TWILIO_PHONE_NUMBER: 'Twilio sender phone number',
  },
};

function checkEnv(): void {
  const missing: string[] = [];

  for (const [key, desc] of Object.entries(REQUIRED)) {
    if (!process.env[key]) missing.push(`  ${key.padEnd(30)} — ${desc}`);
  }

  const smsProvider = process.env['SMS_PROVIDER'] ?? 'msg91';
  const smsVars = SMS_REQUIRED[smsProvider];
  if (!smsVars) {
    console.error(`[startup] SMS_PROVIDER must be one of: ${Object.keys(SMS_REQUIRED).join(', ')}`);
    process.exit(1);
  }
  for (const [key, desc] of Object.entries(smsVars)) {
    if (!process.env[key]) missing.push(`  ${key.padEnd(30)} — ${desc}`);
  }

  if (missing.length > 0) {
    console.error('\n[startup] Missing required environment variables:\n');
    for (const line of missing) console.error(line);
    console.error('\nSee .env.example for reference.\n');
    process.exit(1);
  }

  // Warn about short secrets
  const jwtSecret = process.env['JWT_SECRET'] ?? '';
  if (jwtSecret.length < 32) {
    console.error('[startup] JWT_SECRET must be at least 32 characters. Aborting.');
    process.exit(1);
  }

  const optional = Object.keys(OPTIONAL).filter((k) => !process.env[k]);
  if (optional.length > 0) {
    console.warn(`[startup] Optional env vars not set: ${optional.join(', ')}`);
  }
}

// Runs at import time so it fires BEFORE hoisted imports evaluate modules
// (like redis.ts) that hard-require env vars. index.ts imports this first.
if (process.env['NODE_ENV'] !== 'test') checkEnv();
