const DEMO_MODE = process.env.DEMO_MODE === 'true';

const TEMPLATES = [
  (name, business) => `Oi ${name}! Tudo certo? 😊\n\nAqui é da *${business.name}*. Como foi o atendimento hoje?\n\nResponde com um número de *1 a 5* ⭐`,
  (name, business) => `Olá ${name}! 👋\n\n*${business.name}* aqui. Esperamos que tenha gostado do atendimento!\n\nNos conta como foi? Só responder de *1 a 5* ⭐`,
  (name, business) => `Oi ${name}! 😄\n\nPassando da *${business.name}* pra saber como foi o atendimento de hoje.\n\nDe *1 a 5*, qual nota você daria? ⭐`,
];

const GOOGLE_TEMPLATES = [
  (name) => `Que ótimo, ${name}! Fico feliz em saber 🙌\n\nVocê poderia nos deixar uma avaliação no Google? Leva menos de 1 minuto e ajuda muito:\n\n`,
  (name) => `Que bom, ${name}! 😊\n\nSe puder, nos ajude com uma estrelinha no Google? É rapidinho:\n\n`,
];

const FEEDBACK_CONFIRM_TEMPLATES = [
  (name) => `Anotamos seu feedback, ${name}! 🙏\n\nVamos trabalhar para melhorar sempre sua experiência. Obrigado por nos contar!`,
  (name) => `Obrigado pelo retorno, ${name}! 🙏\n\nSeu feedback é muito importante pra gente. Vamos melhorar sempre!`,
];

const GOOGLE_THANKS_TEMPLATES = [
  (name) => `Muito obrigado, ${name}! 🌟\n\nSua avaliação faz toda a diferença pra nós. Até a próxima!`,
  (name) => `Que legal, ${name}! 😊🙌\n\nObrigado por dedicar seu tempo. Sua opinião nos ajuda a crescer. Até breve!`,
];

function pickTemplate(arr, ...args) {
  return arr[Math.floor(Math.random() * arr.length)](...args);
}

// ── Estado da conexão Baileys ────────────────────────────────
let sock = null;
let qrCodeData = null;
let connected = false;
const messageHandlers = [];
const msgCache = new Map(); // cache de mensagens enviadas para retry

async function initBaileys() {
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = await import('@whiskeysockets/baileys');
  const pino = (await import('pino')).default;

  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    // Corrige "Aguardando mensagem": responde ao retry com a mensagem do cache
    getMessage: async (key) => {
      return msgCache.get(`${key.remoteJid}::${key.id}`) || { conversation: '' };
    },
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const QRCode = require('qrcode');
      qrCodeData = await QRCode.toDataURL(qr);
      console.log('\n[WhatsApp] QR Code gerado — acesse http://localhost:' + (process.env.PORT || 3000) + '/qrcode para escanear\n');
    }

    if (connection === 'open') {
      connected = true;
      qrCodeData = null;
      console.log('[WhatsApp] Conectado!');
    }

    if (connection === 'close') {
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'desconhecido';
      console.log(`[WhatsApp] Desconectado. Código: ${code} | Motivo: ${reason}`);
      if (code === DisconnectReason.loggedOut) {
        console.log('[WhatsApp] Deslogado. Delete a pasta auth_info e reinicie.');
      } else if (code !== undefined) {
        console.log('[WhatsApp] Reconectando em 5s...');
        setTimeout(() => initBaileys(), 5000);
      } else {
        // Sem código definido = falha antes do QR — aguarda mais
        console.log('[WhatsApp] Tentando novamente em 10s...');
        setTimeout(() => initBaileys(), 10000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    console.log(`[WA Event] messages.upsert type=${type} count=${messages.length}`);
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;
      // Extrai texto de qualquer tipo de mensagem de texto
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.buttonsResponseMessage?.selectedDisplayText ||
        msg.message.listResponseMessage?.title ||
        ''
      ).trim();
      const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
      console.log(`[WA] Mensagem de ${phone}: "${text}" (type=${type})`);
      if (text) {
        for (const handler of messageHandlers) handler({ phone, text });
      }
    }
  });
}

// ── Funções de envio ─────────────────────────────────────────
function normalizePhone(phone) {
  let p = phone.replace(/\D/g, '');
  // Adiciona código do Brasil se necessário (número com DDD = 10 ou 11 dígitos)
  if (p.length <= 11) p = '55' + p;
  return p;
}

async function sendMessage(phone, message) {
  const normalized = normalizePhone(phone);
  if (DEMO_MODE) {
    console.log(`[DEMO] WhatsApp → ${normalized}:\n${message}\n`);
    return;
  }
  if (!sock || !connected) throw new Error('WhatsApp não conectado');
  console.log(`[WhatsApp] Enviando para ${normalized}...`);
  const jid = `${normalized}@s.whatsapp.net`;
  const result = await sock.sendMessage(jid, { text: message });
  // Armazena no cache para responder retries (corrige "Aguardando mensagem")
  if (result?.key) {
    msgCache.set(`${jid}::${result.key.id}`, { conversation: message });
  }
  console.log(`[WhatsApp] Enviado ✓`);
}

async function sendRatingRequest(contact, business) {
  await sendMessage(contact.phone, pickTemplate(TEMPLATES, contact.name, business));
}

async function sendGoogleLink(phone, name, business) {
  await sendMessage(phone, pickTemplate(GOOGLE_TEMPLATES, name) + business.google_review_link);
}

async function sendFeedbackRequest(phone, name) {
  await sendMessage(phone, `Obrigado pelo feedback, ${name} 🙏\n\nNos conta o que aconteceu? Queremos melhorar sempre.`);
}

async function sendFeedbackConfirmation(phone, name) {
  await sendMessage(phone, pickTemplate(FEEDBACK_CONFIRM_TEMPLATES, name));
}

async function sendGoogleThankYou(phone, name) {
  await sendMessage(phone, pickTemplate(GOOGLE_THANKS_TEMPLATES, name));
}

async function sendOwnerReminder(ownerPhone, businessName, pendingCount) {
  const msg = `📋 *Lembrete AvaliaBot*\n\nOlá! Você teve atendimentos hoje na *${businessName}*?\n\nTem *${pendingCount > 0 ? pendingCount + ' contato(s) pendente(s)' : 'contatos esperando'}* na sua lista.\n\nAcesse: ${process.env.DASHBOARD_URL}`;
  await sendMessage(ownerPhone, msg);
}

function onMessage(handler) {
  messageHandlers.push(handler);
}

function getStatus() {
  return { connected, hasQR: !!qrCodeData };
}

function getQRCode() {
  return qrCodeData;
}

module.exports = { initBaileys, sendRatingRequest, sendGoogleLink, sendFeedbackRequest, sendFeedbackConfirmation, sendGoogleThankYou, sendOwnerReminder, onMessage, getStatus, getQRCode };
