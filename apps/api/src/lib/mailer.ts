import { logger } from './logger.js';

// Sends transactional email via Resend's HTTP API (no SDK dependency).
// From-address defaults to Resend's shared test sender; once the domain is
// verified in Resend, set RESEND_FROM to noreply@inspiroiasacademy.in.
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    logger.error('RESEND_API_KEY not configured — cannot send email');
    return false;
  }
  const from = process.env['RESEND_FROM'] ?? 'Inspiro IAS Academy <onboarding@resend.dev>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Resend email send failed');
      return false;
    }
    logger.info({ to: opts.to, subject: opts.subject }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Resend email send threw');
    return false;
  }
}

// Staff-account credentials email (sent when a staff member is created).
export function staffWelcomeEmail(
  name: string,
  loginEmail: string,
  tempPassword: string,
  loginUrl: string,
): { subject: string; html: string } {
  const safeName = name && name.trim().length > 0 ? name.trim() : 'there';
  return {
    subject: 'Your Inspiro LMS staff account',
    html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="color:#1668E3;margin:0 0 8px">Inspiro IAS Academy</h2>
  <p style="font-size:15px;line-height:1.5">Hi ${safeName},</p>
  <p style="font-size:15px;line-height:1.5">A staff account has been created for you on the Inspiro LMS. Use these credentials to sign in:</p>
  <div style="background:#f1f5f9;border-radius:10px;padding:16px;margin:16px 0;font-size:14px">
    <div><strong>Email:</strong> ${loginEmail}</div>
    <div style="margin-top:6px"><strong>Temporary password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px">${tempPassword}</code></div>
  </div>
  <p style="margin:20px 0">
    <a href="${loginUrl}" style="background:#1668E3;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">Sign in</a>
  </p>
  <p style="font-size:13px;color:#64748b;line-height:1.5">Please change your password after your first sign-in for security.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
  <p style="font-size:12px;color:#94a3b8">Inspiro IAS Academy · by Bizence Solutions</p>
</div>`,
  };
}

// Student welcome/credentials email (sent when a counsellor converts a lead
// and sets a password, giving the student immediate app access without OTP).
export function studentWelcomeEmail(
  name: string,
  loginEmail: string,
  tempPassword: string,
): { subject: string; html: string } {
  const safeName = name && name.trim().length > 0 ? name.trim() : 'there';
  return {
    subject: 'Welcome to Inspiro IAS Academy — your login details',
    html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="color:#1668E3;margin:0 0 8px">Inspiro IAS Academy</h2>
  <p style="font-size:15px;line-height:1.5">Hi ${safeName},</p>
  <p style="font-size:15px;line-height:1.5">Welcome aboard! Your admission is confirmed and your course access is now active. Sign in to the Inspiro app with:</p>
  <div style="background:#f1f5f9;border-radius:10px;padding:16px;margin:16px 0;font-size:14px">
    <div><strong>Email:</strong> ${loginEmail}</div>
    <div style="margin-top:6px"><strong>Password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px">${tempPassword}</code></div>
  </div>
  <p style="font-size:13px;color:#64748b;line-height:1.5">Use "Sign in with email &amp; password" on the login screen. Please change your password after your first sign-in.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
  <p style="font-size:12px;color:#94a3b8">Inspiro IAS Academy · by Bizence Solutions</p>
</div>`,
  };
}

// Password-reset email template.
export function passwordResetEmail(name: string, resetUrl: string): { subject: string; html: string } {
  const safeName = name && name.trim().length > 0 ? name.trim() : 'there';
  return {
    subject: 'Reset your Inspiro LMS password',
    html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="color:#1668E3;margin:0 0 8px">Inspiro IAS Academy</h2>
  <p style="font-size:15px;line-height:1.5">Hi ${safeName},</p>
  <p style="font-size:15px;line-height:1.5">We received a request to reset your Inspiro LMS admin password. Click the button below to choose a new one. This link expires in <strong>30 minutes</strong>.</p>
  <p style="margin:24px 0">
    <a href="${resetUrl}" style="background:#1668E3;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">Reset password</a>
  </p>
  <p style="font-size:13px;color:#64748b;line-height:1.5">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${resetUrl}</span></p>
  <p style="font-size:13px;color:#64748b;line-height:1.5">If you didn't request this, you can safely ignore this email — your password won't change.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
  <p style="font-size:12px;color:#94a3b8">Inspiro IAS Academy · by Bizence Solutions</p>
</div>`,
  };
}
