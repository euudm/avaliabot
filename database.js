const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, 'db.json');

const now = () => new Date().toISOString();

const store = {
  businesses: [],
  contacts: [],
  sends: [],
  seq: { businesses: 0, contacts: 0, sends: 0 },
};

// Carrega negócios salvos ao iniciar
try {
  const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (Array.isArray(saved.businesses) && saved.businesses.length > 0) {
    store.businesses = saved.businesses;
    store.seq.businesses = Math.max(...saved.businesses.map(b => b.id));
    console.log(`[DB] ${store.businesses.length} negócio(s) carregado(s) do db.json`);
  }
} catch {}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({ businesses: store.businesses }, null, 2));
  } catch (e) {
    console.error('[DB] Erro ao salvar db.json:', e.message);
  }
}

// ── Businesses ────────────────────────────────────────────────
function getBusiness(id) {
  return store.businesses.find(b => b.id === Number(id)) || null;
}

function createBusiness({ name, owner_phone, google_review_link }) {
  const id = ++store.seq.businesses;
  const row = { id, name, owner_phone, google_review_link, created_at: now() };
  store.businesses.push(row);
  saveDB();
  return row;
}

function getAllBusinesses() {
  return store.businesses;
}

// ── Contacts ──────────────────────────────────────────────────
function getTodayContacts(businessId) {
  const today = new Date().toISOString().split('T')[0];
  return store.contacts
    .filter(c => c.business_id === Number(businessId) && c.added_at.startsWith(today))
    .map(c => {
      const send = store.sends.filter(s => s.contact_id === c.id).sort((a, b) => b.id - a.id)[0];
      return { ...c, sent_at: send?.sent_at || null, rating: send?.rating || null, google_link_sent: send?.google_link_sent || 0 };
    })
    .sort((a, b) => b.id - a.id);
}

function getContact(id) {
  return store.contacts.find(c => c.id === Number(id)) || null;
}

function wasRecentlySent(businessId, phone) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return store.contacts
    .filter(c => c.business_id === Number(businessId) && c.phone === phone)
    .some(c => store.sends.some(s => s.contact_id === c.id && s.sent_at > cutoff));
}

function createContact({ business_id, name, phone, service }) {
  const id = ++store.seq.contacts;
  const row = { id, business_id: Number(business_id), name, phone, service: service || null, added_at: now(), status: 'pending' };
  store.contacts.push(row);
  return row;
}

function deleteContact(id) {
  store.contacts = store.contacts.filter(c => c.id !== Number(id));
}

function setContactStatus(id, status) {
  const c = store.contacts.find(c => c.id === Number(id));
  if (c) c.status = status;
}

// ── Sends ─────────────────────────────────────────────────────
function createSend(contactId) {
  const id = ++store.seq.sends;
  const row = { id, contact_id: Number(contactId), sent_at: now(), rating: null, rating_received_at: null, google_link_sent: 0, feedback_text: null, followup_sent: 0 };
  store.sends.push(row);
  return row;
}

function getLatestSend(contactId) {
  return store.sends.filter(s => s.contact_id === Number(contactId)).sort((a, b) => b.id - a.id)[0] || null;
}

function getSendByPhone(phone) {
  const p = phone.replace(/\D/g, '');
  // Aceita número com ou sem código do país (55)
  const variants = new Set([p]);
  if (p.startsWith('55')) variants.add(p.slice(2));
  else variants.add('55' + p);

  const contacts = store.contacts.filter(c => variants.has(c.phone));
  console.log(`[DB] getSendByPhone(${p}) → ${contacts.length} contato(s) encontrado(s)`);
  return store.sends
    .filter(s => contacts.some(c => c.id === s.contact_id) && s.rating === null)
    .sort((a, b) => b.id - a.id)[0] || null;
}

function setSendRating(sendId, rating) {
  const s = store.sends.find(s => s.id === Number(sendId));
  if (s) { s.rating = rating; s.rating_received_at = now(); }
}

function setSendGoogleLink(sendId) {
  const s = store.sends.find(s => s.id === Number(sendId));
  if (s) s.google_link_sent = 1;
}

function setSendFeedback(sendId, text) {
  const s = store.sends.find(s => s.id === Number(sendId));
  if (s) s.feedback_text = text;
}

function getMonthStats(businessId) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const bizContacts = store.contacts.filter(c => c.business_id === Number(businessId));
  const sends = store.sends.filter(s =>
    bizContacts.some(c => c.id === s.contact_id) &&
    s.rating !== null &&
    new Date(s.sent_at) >= startOfMonth
  );
  const monthCount = sends.length;
  const avgRating = monthCount > 0 ? Math.round(sends.reduce((a, s) => a + s.rating, 0) / monthCount * 10) / 10 : null;
  return { monthCount, avgRating };
}

// Busca o send mais recente (últimas 24h) para um telefone — independente de ter nota ou não
function getRecentSendByPhone(phone) {
  const p = phone.replace(/\D/g, '');
  const variants = new Set([p]);
  if (p.startsWith('55')) variants.add(p.slice(2));
  else variants.add('55' + p);

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const contacts = store.contacts.filter(c => variants.has(c.phone));
  return store.sends
    .filter(s => contacts.some(c => c.id === s.contact_id) && s.sent_at > cutoff)
    .sort((a, b) => b.id - a.id)[0] || null;
}

// Fallback para LID: send mais recente com nota nas últimas 24h
function getLatestRecentSend() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return store.sends
    .filter(s => s.sent_at > cutoff && s.rating !== null)
    .sort((a, b) => b.id - a.id)[0] || null;
}

function getLatestUnansweredSend() {
  return store.sends
    .filter(s => s.rating === null)
    .sort((a, b) => b.id - a.id)[0] || null;
}

function getPendingFollowups() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  return store.sends
    .filter(s => s.rating === null && s.google_link_sent === 0 && s.sent_at < cutoff && !s.followup_sent)
    .map(s => {
      const contact = store.contacts.find(c => c.id === s.contact_id);
      return contact ? { ...s, phone: contact.phone, name: contact.name, contact_id: contact.id } : null;
    })
    .filter(Boolean);
}

module.exports = {
  getBusiness, createBusiness, getAllBusinesses,
  getTodayContacts, getContact, wasRecentlySent, createContact, deleteContact, setContactStatus,
  createSend, getLatestSend, getSendByPhone, getRecentSendByPhone, getLatestRecentSend, getLatestUnansweredSend, setSendRating, setSendGoogleLink, setSendFeedback,
  getMonthStats, getPendingFollowups,
};
