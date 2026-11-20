// backend/emailService.ts
import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';

// ---- Tipos (Alineados con tu Base de Datos) ----
export interface ReservaParaCorreo {
  clienteNombre: string;
  clienteEmail: string;
  clienteTelefono: string;
  mesa: string;
  fecha: string;
  hora: string;
  personas: number;
}

// ---- Validación de variables de entorno ----
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const DISCOTECA_EMAIL = process.env.DISCOTECA_EMAIL;

// 🚀 LOGS DE DIAGNÓSTICO
console.log('====================================');
console.log('🔍 DIAGNÓSTICO DE VARIABLES DE CORREO');
console.log('👤 Usuario (GMAIL_USER):', GMAIL_USER);
console.log('📧 Destino (DISCOTECA_EMAIL):', DISCOTECA_EMAIL);
console.log('🔑 Contraseña longitud (debe ser 16):', GMAIL_APP_PASSWORD?.length);
console.log('🔑 Contraseña texto (por si tiene espacios):', `"${GMAIL_APP_PASSWORD}"`);
console.log('====================================');

if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !DISCOTECA_EMAIL) {
  throw new Error(
    '❌ Faltan variables de entorno: GMAIL_USER, GMAIL_APP_PASSWORD o DISCOTECA_EMAIL'
  );
}

// ---- URL del Logo ----
const LOGO_URL = 'https://imgur.com/YsZMatw.png'; 

// ---- Transporter con Configuración SMTP Explícita ----
const transporter: Transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true para el puerto 465 (SSL)
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
  // Opcional: Añadir logs de depuración de la conexión SMTP
  logger: true,
  debug: true,
});

// ---- Función principal ----
export async function enviarCorreoReserva(reserva: ReservaParaCorreo): Promise<void> {
  const {
    clienteNombre,
    clienteEmail,
    clienteTelefono,
    mesa,
    fecha,
    hora,
    personas,
  } = reserva;

  // Estilos
  const estiloContenedor = `font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #121212; color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #333; box-shadow: 0 4px 15px rgba(0,0,0,0.5);`;
  const estiloCabecera = `text-align: center; padding: 30px 20px; background-color: #000000; border-bottom: 2px solid #d4af37;`;
  const estiloCuerpo = `padding: 30px; line-height: 1.6; font-size: 16px;`;
  const estiloLista = `list-style-type: none; background-color: #1e1e1e; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #d4af37;`;
  const estiloItem = `padding: 10px 0; border-bottom: 1px solid #333;`;
  const estiloFooter = `text-align: center; padding: 20px; background-color: #0a0a0a; font-size: 12px; color: #888888; border-top: 1px solid #222;`;

  // Correo al cliente
  const correoCliente: SendMailOptions = {
    from: `"Las Vegas Discobar" <${GMAIL_USER}>`,
    to: clienteEmail,
    subject: `✅ Reserva confirmada - Mesa ${mesa} - ${fecha}`,
    html: `
      <div style="${estiloContenedor}">
        <div style="${estiloCabecera}">
          <img src="${LOGO_URL}" alt="Las Vegas Discobar" style="max-width: 220px; height: auto; display: block; margin: 0 auto;" />
        </div>
        
        <div style="${estiloCuerpo}">
          <h2 style="color: #d4af37; margin-top: 0;">¡Hola ${clienteNombre}!</h2>
          <p>Tu reserva en <strong>Las Vegas Discobar</strong> ha sido confirmada exitosamente. Prepárate para vivir <strong>la mejor rumba de Sopetrán y el Occidente Antioqueño</strong>. 🍻🔥</p>
          
          <ul style="${estiloLista}">
            <li style="${estiloItem}"><strong>📍 Mesa:</strong> ${mesa}</li>
            <li style="${estiloItem}"><strong>📅 Fecha:</strong> ${fecha}</li>
            <li style="${estiloItem}"><strong>⏰ Hora:</strong> ${hora}</li>
            <li style="${estiloItem} border-bottom: none;"><strong>👥 Personas:</strong> ${personas}</li>
          </ul>
          
          <p style="text-align: center; color: #ffffff; font-weight: bold; font-size: 18px; margin-top: 30px;">
            ¡Te esperamos para la rumba! 🎶
          </p>
        </div>

        <div style="${estiloFooter}">
          <p>Las Vegas Discobar - Sopetrán, Antioquia</p>
          <p>La mejor rumba del Occidente Antioqueño.</p>
        </div>
      </div>
    `,
  };

  // Correo a la discoteca
  const correoDiscoteca: SendMailOptions = {
    from: `"Sistema de Reservas" <${GMAIL_USER}>`,
    to: DISCOTECA_EMAIL,
    subject: `🔔 Nueva reserva - Mesa ${mesa} - ${clienteNombre}`,
    html: `
      <div style="${estiloContenedor}">
        <div style="${estiloCabecera}">
          <img src="${LOGO_URL}" alt="Las Vegas Discobar" style="max-width: 150px; height: auto; display: block; margin: 0 auto;" />
          <h2 style="color: #d4af37; margin-top: 15px; margin-bottom: 0;">Nueva Reserva Registrada</h2>
        </div>
        
        <div style="${estiloCuerpo}">
          <p>Se ha registrado una nueva reserva en el sistema:</p>
          
          <ul style="${estiloLista}">
            <li style="${estiloItem}"><strong>👤 Cliente:</strong> ${clienteNombre}</li>
            <li style="${estiloItem}"><strong>📞 Teléfono:</strong> ${clienteTelefono}</li>
            <li style="${estiloItem}"><strong>✉️ Email:</strong> ${clienteEmail}</li>
            <li style="${estiloItem}"><strong>📍 Mesa:</strong> ${mesa}</li>
            <li style="${estiloItem}"><strong>📅 Fecha:</strong> ${fecha} a las ${hora}</li>
            <li style="${estiloItem} border-bottom: none;"><strong>👥 Personas:</strong> ${personas}</li>
          </ul>
        </div>
      </div>
    `,
  };

  try {
    console.log('⏳ Intentando enviar correos...');
    
    await Promise.all([
      transporter.sendMail(correoCliente),
      transporter.sendMail(correoDiscoteca),
    ]);
    
    console.log('✅ Correos enviados exitosamente');
  } catch (error) {
    console.error('❌ Error al enviar los correos:', error);
    throw error;
  }
}