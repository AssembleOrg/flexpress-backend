import { Injectable, Logger } from '@nestjs/common';

type SendArgs = {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
};

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/**
 * Envío de mails transaccionales con Brevo (API HTTP, sin SMTP).
 *
 * Si falta BREVO_API_KEY no tira error: loguea y sigue. Un mail que no sale
 * nunca tiene que romper el registro ni otra operación del usuario.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private get apiKey() {
    return process.env.BREVO_API_KEY;
  }

  get frontendUrl() {
    return (process.env.FRONTEND_URL || 'https://flex-press.com.ar').replace(
      /\/$/,
      '',
    );
  }

  async send({ to, subject, html, text }: SendArgs): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(
        `BREVO_API_KEY no configurada: no se envió "${subject}" a ${to.email}`,
      );
      return false;
    }

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: process.env.MAIL_FROM || 'no-responder@flex-press.com.ar',
            name: process.env.MAIL_FROM_NAME || 'Flexpress',
          },
          to: [to],
          subject,
          htmlContent: html,
          textContent: text,
        }),
      });
      if (!res.ok) {
        this.logger.error(
          `Brevo respondió ${res.status} al enviar "${subject}": ${await res.text()}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(
        `No se pudo enviar "${subject}" a ${to.email}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  sendEmailVerification(to: { email: string; name: string }, link: string) {
    const name = escapeHtml(to.name.split(' ')[0] || to.name);
    const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f5f1ec;font-family:Arial,Helvetica,sans-serif;color:#212121">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ec;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#380116;padding:24px 32px">
          <span style="font-size:24px;font-weight:bold;color:#ffffff;letter-spacing:0.5px">Flex<span style="color:#DCA621">press</span></span>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:22px;color:#380116">¡Hola ${name}! Confirmá tu email</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5">
            Gracias por crear tu cuenta en Flexpress. Tocá el botón para confirmar que este email es tuyo.
          </p>
          <p style="margin:0 0 24px">
            <a href="${link}" style="display:inline-block;background:#DCA621;color:#380116;font-weight:bold;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:8px">Confirmar mi email</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#666666">Si el botón no funciona, copiá este link en tu navegador:</p>
          <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${link}" style="color:#380116">${link}</a></p>
          <p style="margin:0;font-size:13px;color:#666666">El link vence en 48 horas. Si no creaste una cuenta en Flexpress, ignorá este mensaje.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `¡Hola ${to.name}!\n\nGracias por crear tu cuenta en Flexpress. Confirmá tu email entrando a este link:\n${link}\n\nEl link vence en 48 horas. Si no creaste una cuenta en Flexpress, ignorá este mensaje.`;
    return this.send({
      to,
      subject: 'Confirmá tu email en Flexpress',
      html,
      text,
    });
  }
}
