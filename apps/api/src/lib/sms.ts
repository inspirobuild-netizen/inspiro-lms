import { logger } from './logger.js';

export async function sendOtp(phone: string, otp: string): Promise<void> {
  const provider = process.env['SMS_PROVIDER'] ?? 'msg91';

  if (process.env['NODE_ENV'] !== 'production') {
    // Dev: log OTP to console instead of sending
    logger.info({ phone, otp }, 'DEV MODE — OTP (would send via SMS)');
    return;
  }

  if (provider === 'msg91') {
    await sendViaMSG91(phone, otp);
  } else if (provider === 'twilio') {
    await sendViaTwilio(phone, otp);
  } else {
    throw new Error(`Unknown SMS_PROVIDER: ${provider}`);
  }
}

/**
 * MSG91 v5 OTP API. The DLT-approved template (MSG91_TEMPLATE_ID) must contain
 * the ##OTP## variable; we pass our own OTP so verification stays in our Redis.
 * https://docs.msg91.com/otp
 */
async function sendViaMSG91(phone: string, otp: string): Promise<void> {
  const authKey = process.env['MSG91_AUTH_KEY'];
  const templateId = process.env['MSG91_TEMPLATE_ID'];
  if (!authKey || !templateId) {
    throw new Error('MSG91_AUTH_KEY / MSG91_TEMPLATE_ID not configured');
  }

  // MSG91 wants 91XXXXXXXXXX — no leading +
  const mobile = phone.replace(/^\+/, '');

  const params = new URLSearchParams({
    template_id: templateId,
    mobile,
    otp,
    otp_expiry: '5', // minutes — matches OTP_TTL in redis.ts
  });

  const res = await fetch(`https://control.msg91.com/api/v5/otp?${params.toString()}`, {
    method: 'POST',
    headers: { authkey: authKey, 'Content-Type': 'application/json' },
  });

  const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  if (!res.ok || body.type !== 'success') {
    // Never log the phone number or OTP
    logger.error({ status: res.status, type: body.type }, 'MSG91 send failed');
    throw new Error('MSG91 send failed');
  }
}

async function sendViaTwilio(phone: string, otp: string): Promise<void> {
  const accountSid = process.env['TWILIO_ACCOUNT_SID']!;
  const authToken = process.env['TWILIO_AUTH_TOKEN']!;
  const from = process.env['TWILIO_PHONE_NUMBER']!;

  const body = new URLSearchParams({
    To: phone,
    From: from,
    Body: `Your Inspiro OTP is ${otp}. Valid for 5 minutes. Do not share.`,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
  );
  if (!res.ok) {
    logger.error({ status: res.status }, 'Twilio send failed');
    throw new Error('Twilio send failed');
  }
}
