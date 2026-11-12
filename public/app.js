const BUSINESS_ID = parseInt(new URLSearchParams(location.search).get('b') || '1', 10) || 1;

let contacts = [];
let selected = new Set();

async function init() {
  await loadBusiness();
  await loadContacts();
  await loadStats();
  setupForm();
  setupSendButton();
}

async function loadBusiness() {
  try {
    const res = await fetch(`/api/businesses/${BUSINESS_ID}`);
    const biz = await res.json();
    document.getElementById('businessName').textContent = biz.name;
  } catch {}
}

async function loadContacts() {
  try {
    const res = await fetch(`/api/contacts/${BUSINESS_ID}/today`);
    contacts = await res.json();
    renderContacts();
  } catch (err) {
    console.error(err);
  }
}

async function loadStats() {
  try {
    const res = await fetch(`/api/businesses/${BUSINESS_ID}/stats`);
    const stats = await res.json();
    document.getElementById('monthStats').textContent =
      `${stats.monthCount} ${stats.monthCount === 1 ? 'avaliação' : 'avaliações'} · ⭐ ${stats.avgRating || '—'}`;
  } catch {}
}

function renderContacts() {
  const pending = contacts.filter(c => c.status === 'pending');
  const sent = contacts.filter(c => c.status === 'sent');

  document.getElementById('pendingCount').textContent = pending.length;

  const listEl = document.getElementById('contactList');

  if (pending.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>Nenhum contato adicionado hoje.</p>
        <p class="empty-sub">Adicione acima ou encaminhe um contato pelo WhatsApp para o bot.</p>
      </div>`;
  } else {
    listEl.innerHTML = pending.map(c => `
      <div class="contact-card ${selected.has(c.id) ? 'selected' : ''}" data-id="${c.id}" onclick="toggleSelect(${c.id})">
        <div class="contact-checkbox"></div>
        <div class="contact-info">
          <div class="contact-name">${c.name}</div>
          <div class="contact-meta">${c.phone}${c.service ? ' · ' + c.service : ''}</div>
        </div>
        <span class="contact-status pending">pendente</span>
      </div>
    `).join('');
  }

  // Histórico enviados
  const sentList = document.getElementById('sentList');
  if (sent.length === 0) {
    sentList.innerHTML = `<div class="empty-state"><p>Nenhum envio hoje ainda.</p></div>`;
  } else {
    sentList.innerHTML = sent.map(c => {
      const ratingLabel = c.rating == null
        ? `<span class="rating-badge waiting">aguardando resposta</span>`
        : c.rating >= 4
          ? `<span class="rating-badge good">${c.rating} ⭐ · link enviado</span>`
          : `<span class="rating-badge bad">${c.rating} ⭐ · feedback capturado</span>`;
      const time = c.sent_at ? new Date(c.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="sent-card">
          <div class="sent-info">
            <div class="sent-name">${c.name}</div>
            <div class="sent-time">${time}${c.service ? ' · ' + c.service : ''}</div>
          </div>
          ${ratingLabel}
        </div>
      `;
    }).join('');
  }

  updateSendButton();
}

function toggleSelect(id) {
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  renderContacts();
}

function updateSendButton() {
  const btn = document.getElementById('btnSend');
  const count = selected.size;
  btn.disabled = count === 0;
  btn.textContent = count > 0 ? `Enviar para ${count} selecionado${count > 1 ? 's' : ''} →` : 'Enviar selecionados →';
}

function setupSendButton() {
  document.getElementById('btnSend').addEventListener('click', async () => {
    if (selected.size === 0) return;

    const btn = document.getElementById('btnSend');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: [...selected], businessId: BUSINESS_ID }),
      });

      const data = await res.json();
      const sent = data.results.filter(r => r.status === 'sent').length;
      const errors = data.results.filter(r => r.status === 'error').length;

      selected.clear();
      await loadContacts();

      if (errors === 0) {
        showToast(`${sent} mensagem${sent > 1 ? 'ns' : ''} enviada${sent > 1 ? 's' : ''} com sucesso!`, 'success');
      } else {
        showToast(`${sent} enviadas, ${errors} com erro.`, 'error');
      }
    } catch {
      showToast('Erro ao enviar. Tente novamente.', 'error');
      btn.disabled = false;
      updateSendButton();
    }
  });
}

function setupForm() {
  document.getElementById('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inputName').value.trim();
    const phone = document.getElementById('inputPhone').value.trim();
    const service = document.getElementById('inputService').value.trim();
    const errEl = document.getElementById('addError');
    errEl.textContent = '';

    try {
      const res = await fetch(`/api/contacts/${BUSINESS_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, service }),
      });

      if (res.status === 409) {
        errEl.textContent = 'Avaliação já solicitada nos últimos 30 dias para este contato.';
        return;
      }
      if (!res.ok) {
        const d = await res.json();
        errEl.textContent = d.error || 'Erro ao adicionar.';
        return;
      }

      document.getElementById('addForm').reset();
      await loadContacts();
      showToast(`${name} adicionado à lista!`, 'success');
    } catch {
      errEl.textContent = 'Erro de conexão.';
    }
  });
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, 3000);
}

// Recarrega a lista a cada 30s para pegar atualizações de nota
setInterval(loadContacts, 30000);

init();
