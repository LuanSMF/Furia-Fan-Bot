const fs = require('fs');
const path = require('path');
require('dotenv').config();
const nodemailer = require('nodemailer');

// Verifica se as variáveis de e-mail estão definidas no .env. Se não, encerra o programa com erro.
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('❌ EMAIL_USER ou EMAIL_PASS não definidos no .env');
  process.exit(1);
}

// Cria o transportador SMTP com as configurações do .env
const transporter = nodemailer.createTransport({ 
  host: process.env.EMAIL_HOST, // Ex: smtp.gmail.com
  port: Number(process.env.EMAIL_PORT), // Ex: 465 (SSL) ou 587 (TLS)
  secure: process.env.EMAIL_SECURE === 'true', //// Define o tipo de conexão segura
  auth: {
    user: process.env.EMAIL_USER, // Usuário do e-mail (autenticador)
    pass: process.env.EMAIL_PASS  // Senha ou App Password
  }
});

/**
 * Envia um código de verificação para o e-mail informado
 * @param {string} destinatario - Email do usuário
 * @param {string} codigo - Código numérico
 * @returns {Promise<boolean>}
 */
async function enviarCodigoPorEmail(destinatario, codigo) {
   // Define o caminho absoluto para o template HTML do e-mail
  const htmlPath = path.join(__dirname, '../templates/email.html');

   // Lê o conteúdo HTML do template
  let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

  // Substitui o marcador {{CODIGO}} pelo código real
  htmlContent = htmlContent.replace('{{CODIGO}}', codigo);

  // Define as opções do e-mail a ser enviado
  const mailOptions = {
    from: `"FURIA Fan Bot" <${process.env.EMAIL_USER}>`, // Remetente com nome amigável
    to: destinatario, // Destinatário do e-mail
    subject: '🔐 Código de verificação - FURIA Fan Bot', // Assunto do e-mail
    text: `Seu código de verificação é: ${codigo}`, // Texto alternativo (caso HTML falhe)
    html: htmlContent  // Corpo HTML com o código inserido
  };

  try {
    // Envia o e-mail
    await transporter.sendMail(mailOptions);
    console.log(`✅ Código enviado com sucesso para: ${destinatario}`);
    return true;
  } catch (error) {
    // Em caso de erro, mostra mensagem no console e retorna false
    console.error('❌ Falha ao enviar e-mail:', error.message);
    return false;
  }
}

module.exports = { enviarCodigoPorEmail };

