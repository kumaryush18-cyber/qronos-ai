import { randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { isPermanentEmailAddress, normalizeEmail } from "./localAuth";
import { getEmailAllowlistConfig, authenticateOrRegisterWithEmailOtp, getUserByEmail } from "./db";

type OtpRecord = {
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
};

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

// In-memory OTP registry
const otpStore = new Map<string, OtpRecord>();

// Clean up expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, record] of otpStore.entries()) {
    if (record.expiresAt < now) {
      otpStore.delete(email);
    }
  }
}, 5 * 60 * 1000).unref();

let mailTransporter: nodemailer.Transporter | null = null;

function getMailTransporter(): { transporter: nodemailer.Transporter; senderAddress: string } {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.error("[OTP] SMTP_USER or SMTP_PASS is not configured in environment secrets.");
    throw new Error("Email delivery service is currently unavailable. Please contact support.");
  }

  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user,
        pass,
      },
    });
  }

  return { transporter: mailTransporter, senderAddress: user };
}

export async function sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean> {
  const { transporter, senderAddress } = getMailTransporter();

  // Direct CDN URL for TokenForge emblem (universally accessible by Gmail & email proxies)
  const avatarUrl = "https://i.ibb.co/BKL0zbQS/IMG-20260902-202731.jpg";

  const html = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark">
  <title>${otpCode} is your TokenForge Verification Code</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #07080c; -webkit-font-smoothing: antialiased; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <div style="display: none; font-size: 1px; color: #07080c; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    Your 6-digit TokenForge verification passcode is ${otpCode}. Valid for 10 minutes.
  </div>
  
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #07080c; width: 100%; min-height: 100vh; padding: 36px 12px;">
    <tr>
      <td align="center" valign="top">
        
        <!-- Main Email Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #0f1118; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);">
          
          <!-- Top Accent Bar -->
          <tr>
            <td height="4" style="background: linear-gradient(90deg, #ff6b63 0%, #f7b35a 25%, #6b5cff 70%, #c9ff73 100%); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header with Profile Avatar & Brand -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; background: linear-gradient(180deg, #161925 0%, #0f1118 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.06); text-align: center;">
              
              <!-- Centered Profile Avatar -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto 16px auto;">
                <tr>
                  <td align="center" style="position: relative;">
                    <div style="width: 64px; height: 64px; border-radius: 18px; background: linear-gradient(135deg, #1e2330 0%, #11141e 100%); border: 2px solid rgba(201, 255, 115, 0.4); box-shadow: 0 0 24px rgba(201, 255, 115, 0.25); overflow: hidden; display: inline-block;">
                      <img src="${avatarUrl}" alt="TokenForge" width="64" height="64" style="display: block; width: 64px; height: 64px; object-fit: cover; border-radius: 16px;" onerror="this.style.display='none'" />
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Brand Name -->
              <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.03em; color: #ffffff; line-height: 1.2;">
                Token<span style="color: #c9ff73;">Forge</span>
              </div>
              <div style="margin-top: 6px;">
                <span style="display: inline-block; padding: 3px 10px; background-color: rgba(201, 255, 115, 0.12); border: 1px solid rgba(201, 255, 115, 0.25); border-radius: 100px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: #c9ff73;">
                  High-Speed Model Gateway
                </span>
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px 32px 28px 32px; text-align: center;">
              
              <h1 style="margin: 0 0 10px 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">
                Verification Passcode
              </h1>
              
              <p style="margin: 0 0 28px 0; font-size: 14px; line-height: 1.6; color: #9aa1b3;">
                Please use the single-use 6-digit code below to verify your email and securely access your TokenForge developer workspace.
              </p>

              <!-- Futuristic OTP Card -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 26px 0;">
                <tr>
                  <td style="background-color: #08090d; border: 1px solid rgba(201, 255, 115, 0.35); border-radius: 16px; padding: 26px 16px; text-align: center; box-shadow: inset 0 0 20px rgba(0,0,0,0.8), 0 0 30px rgba(201, 255, 115, 0.08);">
                    
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #849182; font-weight: 700; margin-bottom: 8px;">
                      Your One-Time Code
                    </div>
                    
                    <!-- Code Display -->
                    <div style="font-family: 'SF Mono', 'Roboto Mono', Menlo, Consolas, Monaco, monospace; font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #c9ff73; text-shadow: 0 0 16px rgba(201, 255, 115, 0.45); padding: 4px 0 6px 10px;">
                      ${otpCode}
                    </div>

                    <div style="margin-top: 10px; font-size: 12px; color: #8893a7;">
                      ⏱️ Expires in <strong style="color: #ffffff;">10 minutes</strong> · Single use only
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Notice Callout -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 12px; padding: 14px 16px; text-align: left;">
                <tr>
                  <td width="24" valign="top" style="padding-right: 10px; font-size: 16px; line-height: 1;">
                    🔒
                  </td>
                  <td style="font-size: 12px; line-height: 1.5; color: #848c9e;">
                    <strong style="color: #d1d7e2;">Security Tip:</strong> TokenForge team members will never ask for your verification code. If you did not request this, you can ignore this email.
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #090a0f; border-top: 1px solid rgba(255, 255, 255, 0.05); text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; color: #737c8e;">
                TokenForge AI Platform
              </p>
              <p style="margin: 0; font-size: 11px; color: #4e5564; line-height: 1.5;">
                Zero-latency inference · 11B tokens processed · Enterprise router<br>
                © ${new Date().getFullYear()} TokenForge AI. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: `"TokenForge" <${senderAddress}>`,
      to: toEmail,
      subject: `${otpCode} is your TokenForge verification code`,
      html,
    });

    console.log(`[OTP] Sent verification email to ${toEmail} via Gmail SMTP (id: ${info.messageId})`);
    return true;
  } catch (error: any) {
    console.error("[OTP] Gmail SMTP delivery error:", error?.message || error);
    throw new Error(`Failed to deliver email: ${error?.message || "SMTP error"}`);
  }
}

export async function requestOtp(emailInput: string): Promise<{ success: true; message: string; cooldownSeconds: number }> {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    throw new Error("Please provide a valid email address.");
  }

  // Check email allowlist / whitelist policy from Admin Settings
  const emailPolicy = await getEmailAllowlistConfig();
  const isAllowed = isPermanentEmailAddress(email, emailPolicy?.entries);
  if (!isAllowed) {
    throw new Error("This email is not authorized. Only whitelisted emails and domains can access TokenForge.");
  }

  // Check resend cooldown
  const existing = otpStore.get(email);
  const now = Date.now();
  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    throw new Error(`Please wait ${remainingSeconds} seconds before requesting a new code.`);
  }

  // Generate 6-digit numeric OTP
  const code = randomInt(100000, 1000000).toString();

  // Save to store
  otpStore.set(email, {
    code,
    expiresAt: now + OTP_EXPIRY_MS,
    attempts: 0,
    lastSentAt: now,
  });

  // Dispatch email via Resend
  await sendOtpEmail(email, code);

  return {
    success: true,
    message: `Verification code sent to ${email}.`,
    cooldownSeconds: 60,
  };
}

export async function verifyOtp(
  emailInput: string,
  codeInput: string,
  referralCode?: string
) {
  const email = normalizeEmail(emailInput);
  const code = codeInput.trim();

  if (!email || !code || code.length !== 6) {
    throw new Error("Please enter a valid 6-digit verification code.");
  }

  // Check allowlist once more
  const emailPolicy = await getEmailAllowlistConfig();
  const isAllowed = isPermanentEmailAddress(email, emailPolicy?.entries);
  if (!isAllowed) {
    throw new Error("This email is not authorized. Only whitelisted emails and domains can access TokenForge.");
  }

  const record = otpStore.get(email);
  if (!record) {
    throw new Error("No active verification code found for this email. Please request a new code.");
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    throw new Error("Verification code has expired. Please request a new code.");
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(email);
    throw new Error("Too many failed attempts. Please request a new code.");
  }

  if (record.code !== code) {
    record.attempts += 1;
    const remaining = MAX_ATTEMPTS - record.attempts;
    throw new Error(`Invalid verification code. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`);
  }

  // Verification passed! Clear the OTP
  otpStore.delete(email);

  // Authenticate or register user
  const authResult = await authenticateOrRegisterWithEmailOtp(email, referralCode);

  return authResult;
}
