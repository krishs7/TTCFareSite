// backend/src/email.js
import nodemailer from 'nodemailer';

const {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE,
  SMTP_USER, SMTP_PASS, SMTP_FROM
} = process.env;

export const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 465),
  secure: String(SMTP_SECURE || 'true') === 'true',
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  pool: true,
});

export async function sendEmail(to, subject, text) {
  const from = SMTP_FROM || SMTP_USER;
  if (!from) throw new Error('SMTP_FROM/SMTP_USER missing');
  return mailer.sendMail({ from, to, subject, text });
}

