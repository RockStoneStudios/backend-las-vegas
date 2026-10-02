// backend/emailService.ts
import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';

// ---- Tipos ----
export interface ReservaParaCorreo {
  nombreCliente: string;
  emailCliente: string;
  telefonoCliente: string;
  mesa: string;
  fecha: string;
  hora: string;
  personas: number;
}

// ---- Validación de variables de entorno ----
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const DISCOTECA_EMAIL = process.env.DISCOTECA_EMAIL;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !DISCOTECA_EMAIL) {
  throw new Error(
    '❌ Faltan variables de entorno: GMAIL_USER, GMAIL_APP_PASSWORD o DISCOTECA_EMAIL'
  );
}

// ---- Transporter reutilizable ----
const transporter: Transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

// ---- Función principal ----
export async function enviarCorreoReserva(reserva: ReservaParaCorreo): Promise<void> {
  const {
    nombreCliente,
    emailCliente,
    telefonoCliente,
    mesa,
    fecha,
    hora,
    personas,
  } = reserva;

  // Correo al cliente
  const correoCliente: SendMailOptions = {
    from: `"Discoteca" <${GMAIL_USER}>`,
    to: emailCliente,
    subject: `✅ Reserva confirmada - ${mesa} ${fecha} ${hora}`,
    html: `
      <h2>¡Hola ${nombreCliente}!</h2>
      <p>Tu reserva está confirmada:</p>
      <ul>
        <li><strong>Mesa:</strong> ${mesa}</li>
        <li><strong>Fecha:</strong> ${fecha}</li>
        <li><strong>Hora:</strong> ${hora}</li>
        <li><strong>Personas:</strong> ${personas}</li>
      </ul>
      <p>¡Te esperamos!</p>
    `,
  };

  // Correo a la discoteca
  const correoDiscoteca: SendMailOptions = {
    from: `"Sistema de Reservas" <${GMAIL_USER}>`,
    to: DISCOTECA_EMAIL,
    subject: `🔔 Nueva reserva - Mesa ${mesa} - ${nombreCliente}`,
    html: `
      <h3>Nueva reserva</h3>
      <p><strong>Cliente:</strong> ${nombreCliente}</p>
      <p><strong>Teléfono:</strong> ${telefonoCliente}</p>
      <p><strong>Email:</strong> ${emailCliente}</p>
      <p><strong>Mesa:</strong> ${mesa}</p>
      <p><strong>Fecha:</strong> ${fecha} ${hora}</p>
      <p><strong>Personas:</strong> ${personas}</p>
    `,
  };

  // Envío en paralelo
  await Promise.all([
    transporter.sendMail(correoCliente),
    transporter.sendMail(correoDiscoteca),
  ]);

  console.log('✅ Correos enviados');
}