import nodemailer from 'nodemailer';

/** SMTP transport for client emails (RFS, quotations), configured from the SMTP_* / SENDER_* env vars. */
export const createMailTransport = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.uqms.net',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

export const senderAddress = (): string | undefined => process.env.SENDER_EMAIL;
