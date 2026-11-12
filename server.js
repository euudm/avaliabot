require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const { startReminder, startFollowup } = require('./services/reminder');
const whatsapp = require('./services/whatsapp');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/send', require('./routes/send'));
app.use('/api/webhook', require('./routes/webhook'));

app.get('/api/businesses/:id', (req, res) => {
  const biz = db.getBusiness(req.params.id);
  if (!biz) return res.status(404).json({ error: 'Não encontrado' });
  res.json(biz);
});

app.get('/api/businesses/:id/stats', (req, res) => {
  res.json(db.getMonthStats(req.params.id));
});

app.post('/api/businesses', (req, res) => {
  const { name, owner_phone, google_review_link } = req.body;
  if (!name || !owner_phone || !google_review_link) {
    return res.status(400).json({ error: 'name, owner_phone e google_review_link são obrigatórios' });
  }
  const biz = db.createBusiness({ name, owner_phone: owner_phone.replace(/\D/g, ''), google_review_link });
  res.json(biz);
});

// Status da conexão WhatsApp
app.get('/api/status', (req, res) => {
  res.json(whatsapp.getStatus());
});

// Página do QR Code para escanear
app.get('/qrcode', (req, res) => {
  const qr = whatsapp.getQRCode();
  const status = whatsapp.getStatus();
  if (status.connected) {
    return res.send(`<!DOCTYPE html><html><body style="background:#0a0f0a;color:#22c55e;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px">
      <h2>✅ WhatsApp Conectado!</h2>
      <p style="color:#6b7280">Pode fechar esta aba.</p>
    </body></html>`);
  }
  if (!qr) {
    return res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="3"></head><body style="background:#0a0f0a;color:#e8f5e9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px">
      <h2>Aguardando QR Code...</h2>
      <p style="color:#6b7280">Esta página atualiza automaticamente.</p>
    </body></html>`);
  }
  res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="30"></head><body style="background:#0a0f0a;color:#e8f5e9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:24px;text-align:center">
    <h2 style="color:#22c55e">Escanear com WhatsApp</h2>
    <img src="${qr}" style="width:280px;height:280px;border-radius:16px"/>
    <p style="color:#6b7280;font-size:14px">Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo<br>Esta página atualiza a cada 30s</p>
  </body></html>`);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Palavras que indicam que o cliente fez a avaliação no Google
const GOOGLE_DONE_REGEX = /fiz|deixei|pronto|feito|avaliei|coloquei|já|ja\b|ok\b|feita/i;

// Tratamento de mensagens recebidas via Baileys
whatsapp.onMessage(async ({ phone, text }) => {
  console.log(`[Mensagem recebida] ${phone}: "${text}"`);

  // Verifica estados de follow-up (últimas 24h) — com fallback para LID
  let recentSend = db.getRecentSendByPhone(phone);
  if (!recentSend) {
    recentSend = db.getLatestRecentSend();
    if (recentSend) console.log(`[Match] Follow-up via fallback LID (id: ${recentSend.id})`);
  }
  if (recentSend) {
    const contact = db.getContact(recentSend.contact_id);

    // Cliente respondeu com feedback após nota ruim (1-3)
    if (recentSend.rating !== null && recentSend.rating < 4 && recentSend.feedback_text === null) {
      console.log(`[Follow-up] Feedback recebido de ${phone}: "${text}"`);
      db.setSendFeedback(recentSend.id, text);
      if (contact) await whatsapp.sendFeedbackConfirmation(contact.phone, contact.name);
      return;
    }

    // Cliente confirmou que fez a avaliação no Google
    if (recentSend.google_link_sent && GOOGLE_DONE_REGEX.test(text)) {
      console.log(`[Follow-up] Confirmação de avaliação Google de ${phone}`);
      if (contact) await whatsapp.sendGoogleThankYou(contact.phone, contact.name);
      return;
    }
  }

  // Fluxo principal: resposta com nota 1-5
  const match = text.match(/[1-5]/);
  if (!match) return;
  const rating = parseInt(match[0]);

  let send = db.getSendByPhone(phone);
  if (!send) {
    send = db.getLatestUnansweredSend();
    if (send) console.log(`[Match] Usando send mais recente sem nota (id: ${send.id})`);
  }
  if (!send) return;

  db.setSendRating(send.id, rating);

  const contact = db.getContact(send.contact_id);
  const business = db.getBusiness(contact?.business_id);
  if (!business) return;

  if (rating >= 4) {
    await whatsapp.sendGoogleLink(contact.phone, contact.name, business);
    db.setSendGoogleLink(send.id);
  } else {
    await whatsapp.sendFeedbackRequest(contact.phone, contact.name);
  }
});

// Seed demo
if (process.env.DEMO_MODE === 'true') {
  db.createBusiness({
    name: 'Allaska Demo',
    owner_phone: '11999999999',
    google_review_link: 'https://g.page/r/demo/review',
  });
  console.log('[DEMO] Negócio demo criado (id: 1)');
}

startReminder();
startFollowup();

// Inicia WhatsApp (em demo mode só loga, não conecta de verdade)
if (process.env.DEMO_MODE !== 'true') {
  whatsapp.initBaileys().catch(err => console.error('[WhatsApp] Erro ao iniciar:', err.message));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AvaliaBot rodando em http://localhost:${PORT}/?b=1`);
  if (process.env.DEMO_MODE !== 'true') {
    console.log(`QR Code: http://localhost:${PORT}/qrcode`);
  }
});
