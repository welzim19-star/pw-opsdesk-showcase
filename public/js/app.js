/**
 * PW OpsDesk v2.0 — Frontend Engine
 * Galvanic Isolation: UI Layer only, communicates with backend via API + WebSocket.
 */

const API = (typeof window !== 'undefined' && window.location.origin) ? `${window.location.origin}/api` : 'http://192.168.1.100:3000/api';
let token = localStorage.getItem('opsdesk_token');
let currentUser = JSON.parse(localStorage.getItem('opsdesk_user') || 'null');
let allTickets = [];
let constants = {};
let currentTicketId = null;
let currentPage = 'dashboard';
let activeJournalFilter = 'ALL';
let journalDraft = '';
let socket = null;
let sigCanvas = null, sigCtx = null, sigDrawing = false;
let pendingSelectedReason = null;
let slaIntervalId = null;
let searchQuery = '';

// ─── P1 ALARM SYNTHESIZER (WEB AUDIO API — ZERO EXTERNAL ASSET) ───────────────
const P1AlarmEngine = {
  audioCtx: null,
  isMuted: localStorage.getItem("pw_p1_alarm_muted") === "true",

  init() {
    const btn = document.getElementById("btnAudioAlarm");
    if (btn) {
      this.updateBtnUI(btn);
      btn.addEventListener("click", () => {
        this.toggleMute();
        this.updateBtnUI(btn);
      });
    }
    this.updateP1LiveBadge();
  },

  updateBtnUI(btn) {
    if (this.isMuted) {
      btn.textContent = "🔇";
      btn.title = "Alarme Sonoro P1 Desativado (Clique para ativar)";
      btn.style.opacity = "0.6";
    } else {
      btn.textContent = "🔊";
      btn.title = "Alarme Sonoro P1 Ativo (Clique para silenciar)";
      btn.style.opacity = "1";
    }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem("pw_p1_alarm_muted", String(this.isMuted));
    showToast("info", "Áudio", this.isMuted ? "🔇 Alarme Sonoro P1 silenciado." : "🔊 Alarme Sonoro P1 ativado!");
  },

  playRadarPing() {
    if (this.isMuted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.type = "sawtooth";
      osc2.type = "sine";

      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
      osc1.frequency.setValueAtTime(880, now + 0.2);
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.35);

      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(880, now + 0.35);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.45);
      osc2.stop(now + 0.45);
    } catch (err) {
      console.warn("[P1AlarmEngine] Áudio não pôde ser reproduzido:", err);
    }
  },

  triggerIfP1(ticket) {
    if (ticket && (ticket.priority === "P1" || ticket.priority === "Crítico")) {
      this.playRadarPing();
      this.updateP1LiveBadge();
    }
  },

  updateP1LiveBadge() {
    const badge = document.getElementById("p1LiveBadge");
    if (!badge) return;
    const p1Count = allTickets.filter(t => (t.priority === "P1" || t.priority === "Crítico") && !["CLOSED", "CANCELLED", "RESOLVED"].includes(t.status)).length;
    if (p1Count > 0) {
      badge.style.display = "inline-flex";
      const text = document.getElementById("p1LiveText");
      if (text) text.textContent = `🚨 ${p1Count} P1 ATIVO${p1Count > 1 ? "S" : ""}`;
      badge.onclick = () => {
        navigateTo("incidents");
        setTimeout(() => {
          const p1Chip = document.querySelector('.filter-chip[data-filter="P1"]');
          if (p1Chip) p1Chip.click();
        }, 100);
      };
    } else {
      badge.style.display = "none";
    }
  }
};

let queueFilters = { status: 'ALL', prio: 'ALL', assignee: 'ALL', team: 'ALL', sla: 'ALL', chip: 'ALL' };

// ─── SHOW LOGIN / QUICK LOGIN ─────────────────────────────────────────────────
function showLogin() {
  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');
  if (loginScreen) loginScreen.classList.remove('hidden');
  if (app) app.classList.add('hidden');
  const btn = document.getElementById('loginBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Entrar no Sistema'; }
}

function fillQuickLogin(u, p) {
  const userEl = document.getElementById('loginUser');
  const passEl = document.getElementById('loginPass');
  if (userEl) userEl.value = u;
  if (passEl) passEl.value = p;
  handleLogin();
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Bind events defensivamente primeiro
  const form = document.getElementById('loginForm');
  if (form) form.addEventListener('submit', handleLogin);

  const closeBtn = document.getElementById('sidebarCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeMobileSidebar);

  const hamburger = document.getElementById('hamburger');
  if (hamburger) hamburger.addEventListener('click', toggleMobileSidebar);

  const overlay = document.getElementById('mobileOverlay');
  if (overlay) overlay.addEventListener('click', closeMobileSidebar);

  const btnDark = document.getElementById('btnDarkMode');
  if (btnDark) btnDark.addEventListener('click', toggleDarkMode);

  const btnNew = document.getElementById('btnNewTicket');
  if (btnNew) btnNew.addEventListener('click', () => showNewTicketModal());

  const search = document.getElementById('searchInput');
  if (search) {
    search.addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      if (currentPage === 'incidents' || currentPage === 'requests' || currentPage === 'my-tickets') {
        renderQueue(currentPage);
      }
    });
  }

  const saved = localStorage.getItem('opsdesk_theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

  // Inicialização de sessão
  if (token && currentUser) {
    initApp();
  } else {
    showLogin();
  }
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  if (e) e.preventDefault();
  const userEl = document.getElementById('loginUser');
  const passEl = document.getElementById('loginPass');
  const user = (userEl ? userEl.value : '').trim();
  const pass = (passEl ? passEl.value : '').trim();
  const btn = document.getElementById('loginBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Autenticando...'; }

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no login');
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('opsdesk_token', token);
    localStorage.setItem('opsdesk_user', JSON.stringify(currentUser));
    initApp();
  } catch(err) {
    console.error('[OpsDesk] Falha de login:', err);
    showToast('error', 'Acesso Negado', err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar no Sistema'; }
  }
}

function initApp() {
  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');
  if (loginScreen) loginScreen.classList.add('hidden');
  if (app) app.classList.remove('hidden');

  populateSidebarUser();
  setupWebSocket();
  setupNavigation();
  P1AlarmEngine.init();

  // Roteamento inteligente por RBAC:
  // OPERADOR spawna direto na sua fila de chamados ("my-tickets")
  // MASTER / ADMIN spawna no Dashboard global de controle
  const defaultPage = currentUser?.role === 'OPERADOR' ? 'my-tickets' : 'dashboard';

  loadConstants()
    .then(() => fetchTickets())
    .then(() => {
      P1AlarmEngine.updateP1LiveBadge();
      navigateTo(defaultPage);
      startSLAPolling();
    })
    .then(() => {
      // Checagem de Deep-Link (#ticket=INC-123456)
      const hash = window.location.hash || '';
      if (hash.includes('ticket=')) {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const deepTicketId = params.get('ticket');
        if (deepTicketId) {
          setTimeout(() => {
            if (typeof window.openTicket === 'function') {
              window.openTicket(deepTicketId);
              if (params.get('action') === 'resolve' && params.get('prefill')) {
                try {
                  const prefill = JSON.parse(decodeURIComponent(params.get('prefill')));
                  setTimeout(() => {
                    if (typeof window.handleAction === 'function') {
                      window.handleAction(deepTicketId, 'RESOLVE_PROMPT', prefill);
                    }
                  }, 500);
                } catch(e) {}
              }
            }
          }, 400);
        }
      }
    })
    .catch(err => {
      console.warn('[OpsDesk] Inicialização parcial:', err);
      navigateTo(defaultPage);
    });

  const sidebarUser = document.getElementById('sidebarUser');
  if (sidebarUser) sidebarUser.onclick = handleLogout;
}

async function handleLogout() {
  if (!confirm('Sair do sistema?')) return;
  try { await apiFetch('/auth/logout', 'POST'); } catch(e){}
  localStorage.removeItem('opsdesk_token');
  localStorage.removeItem('opsdesk_user');
  location.reload();
}

function populateSidebarUser() {
  document.getElementById('sidebarAvatar').textContent = currentUser.avatar || currentUser.name.substring(0,2).toUpperCase();
  document.getElementById('sidebarName').textContent = currentUser.name;
  document.getElementById('sidebarRole').textContent = currentUser.role;

  const isMasterOrAdmin = currentUser?.role === "MASTER" || currentUser?.role === "ADMIN";
  const govSec = document.getElementById("navSecGovernance");
  const govItem = document.getElementById("navAuditVault");
  if (govSec) govSec.style.display = isMasterOrAdmin ? "block" : "none";
  if (govItem) govItem.style.display = isMasterOrAdmin ? "flex" : "none";
}

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function apiFetch(path, method='GET', body=null) {
  const opts = {
    method,
    headers: { 'Content-Type':'application/json', 'x-auth-token': token }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function loadConstants() {
  try {
    constants = await apiFetch('/constants');
  } catch(e) { console.error('Constants fail:', e); }
}

async function fetchTickets() {
  try {
    allTickets = await apiFetch('/tickets');
    updateBadges();
  } catch(e) { showToast('error','Erro', 'Falha ao carregar chamados'); }
}

function updateBadges() {
  const incidents = allTickets.filter(t => t.type === 'INCIDENT');
  const elInc = document.getElementById('badgeIncidents');
  const activeInc = incidents.filter(t => !['CLOSED','CANCELLED','RESOLVED'].includes(t.status)).length;
  if (elInc) { elInc.textContent = activeInc; elInc.style.display = activeInc > 0 ? '' : 'none'; }

  const myTickets = allTickets.filter(t => t.assignedTo === currentUser?.name && !['CLOSED','CANCELLED','RESOLVED'].includes(t.status));
  const elMy = document.getElementById('badgeMyTickets');
  if (elMy) { elMy.textContent = myTickets.length; elMy.style.display = myTickets.length > 0 ? '' : 'none'; }
}

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
function setupWebSocket() {
  socket = io((typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'http://192.168.1.100:3000');
  socket.on('ticket:created', (data) => {
    const existing = allTickets.find(t => t.id === data.ticket.id);
    if (!existing) allTickets.unshift(data.ticket);
    else allTickets = allTickets.map(t => t.id === data.ticket.id ? data.ticket : t);
    updateBadges();
    P1AlarmEngine.triggerIfP1(data.ticket);
    showToast('info','Novo Chamado',`#${data.ticket.id} — ${data.ticket.title}`);
    if (currentPage === 'incidents' || currentPage === 'requests') renderQueue(currentPage);
    if (currentPage === 'dashboard') renderDashboard();
  });
  socket.on('ticket:updated', (data) => {
    allTickets = allTickets.map(t => t.id === data.ticketId ? data.ticket : t);
    updateBadges();
    P1AlarmEngine.triggerIfP1(data.ticket);
    if (currentTicketId === data.ticketId) renderFormView(data.ticket);
    else if (currentPage === 'incidents' || currentPage === 'requests' || currentPage === 'my-tickets') renderQueue(currentPage);
    if (currentPage === 'dashboard') renderDashboard();
  });
  socket.on('ticket:remote_resolved', (data) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch(e) {}
    showToast('success', 'Fechamento em Campo 🚀', `#${data.ticketId} finalizado via ${data.appSource} por ${data.technicianName}!`);
    if (currentPage === 'dashboard') renderDashboard();
    else if (['incidents', 'requests', 'my-tickets'].includes(currentPage)) renderQueue(currentPage);
    if (currentTicketId === data.ticketId) {
      apiFetch(`/tickets/${data.ticketId}`).then(t => renderFormView(t)).catch(console.error);
    }
  });
  socket.on('audit:entry', (entry) => {
    if (typeof handleLiveAuditEntry === "function") {
      handleLiveAuditEntry(entry);
    }
  });
  socket.on('connect', () => console.log('[WS] Connected — Real-time SLA sync online'));
  socket.on('disconnect', () => showToast('warning','WebSocket', 'Conexão perdida. Reconectando...'));
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });
}

function navigateTo(page) {
  currentPage = page;
  currentTicketId = null;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const bc = document.getElementById('breadcrumbCurrent');
  if (bc) {
    bc.textContent = {
      dashboard: 'Dashboard', 'my-tickets': 'Meus Chamados',
      incidents: 'Incidentes', requests: 'Requisições de Serviço',
      problems: 'Problemas', changes: 'Mudanças',
      knowledge: 'Base de Conhecimento', reports: 'Relatórios', 'audit-vault': 'Cofre de Auditoria',
      'certify-bridge': 'Ponte do Ecossistema PW'
    }[page] || page;
  }

  const content = document.getElementById('pageContent');
  if (page === 'dashboard') renderDashboard();
  else if (page === 'my-tickets') renderMyTickets();
  else if (page === 'incidents') renderQueue('incidents');
  else if (page === 'requests') renderQueue('requests');
  else if (page === 'audit-vault') renderAuditVault();
  else if (page === 'certify-bridge') renderCertifyBridge();
  else {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${page==='problems'?'🔍':page==='changes'?'🔄':page==='knowledge'?'📚':'📈'}</div><div class="empty-state-title">Módulo em Implementação</div><div class="empty-state-sub">Este módulo será disponibilizado na Fase 2 do roadmap.</div></div>`;
  }
  closeMobileSidebar();
}

// ─── MINHA FILA (OPERADOR) ───────────────────────────────────────────────────
function renderMyTickets() {
  const myTickets = allTickets.filter(t => t.assignedTo === currentUser?.name);
  const open = myTickets.filter(t => !['CLOSED', 'CANCELLED'].includes(t.status));
  const inProgress = myTickets.filter(t => t.status === 'IN_PROGRESS');
  const pending = myTickets.filter(t => t.status === 'PENDING');
  const breached = open.filter(t => t.sla?.isBreached);

  const statusFilter = document.getElementById('myStatusFilter')?.value || 'ALL';

  const content = document.getElementById('pageContent');
  content.innerHTML = `
  <div class="queue-header">
    <div>
      <h1 class="queue-title">🎯 Minha Fila de Atendimento</h1>
      <div class="queue-subtitle">Técnico: <strong>${escHtml(currentUser?.name || 'Operador')}</strong> (${currentUser?.role} · ${currentUser?.team || 'Operações'})</div>
    </div>
    <div class="queue-actions">
      <button class="btn btn-primary" onclick="showNewTicketModal('INCIDENT')">＋ Novo Chamado</button>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-label">Meus Chamados Ativos</div>
      <div class="stat-value">${open.length}</div>
      <div class="stat-meta">Sob sua responsabilidade</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Em Execução</div>
      <div class="stat-value">${inProgress.length}</div>
      <div class="stat-meta">Trabalhando agora</div>
    </div>
    <div class="stat-card ${pending.length > 0 ? 'stat-warning' : ''}">
      <div class="stat-label">Em Pendência</div>
      <div class="stat-value">${pending.length}</div>
      <div class="stat-meta">SLA congelado</div>
    </div>
    <div class="stat-card ${breached.length > 0 ? 'stat-danger' : ''}">
      <div class="stat-label">SLA Crítico / Estourado</div>
      <div class="stat-value">${breached.length}</div>
      <div class="stat-meta">Atenção máxima</div>
    </div>
  </div>

  <div class="filter-bar">
    <select id="myStatusFilter" class="form-select" style="width:auto;padding:5px 28px 5px 10px" onchange="renderMyTickets()">
      <option value="ALL" ${statusFilter==='ALL'?'selected':''}>Todos os Meus Chamados</option>
      <option value="IN_PROGRESS" ${statusFilter==='IN_PROGRESS'?'selected':''}>Em Andamento</option>
      <option value="ASSIGNED" ${statusFilter==='ASSIGNED'?'selected':''}>Atribuídos</option>
      <option value="PENDING" ${statusFilter==='PENDING'?'selected':''}>Pendentes</option>
      <option value="RESOLVED" ${statusFilter==='RESOLVED'?'selected':''}>Resolvidos</option>
    </select>

    ${['ALL','IN_PROGRESS','PENDING','RESOLVED'].map(s=>`
    <span class="filter-chip ${statusFilter===s?'active':''}" onclick="setMyQueueFilter('${s}')">
      ${s==='ALL'?'Todos':statusLabel(s)}
    </span>`).join('')}
  </div>

  <div class="ticket-table-wrapper">
    ${renderTicketTableContent(filterTickets(myTickets, statusFilter, 'ALL'))}
  </div>`;
}

window.setMyQueueFilter = function(status) {
  const el = document.getElementById('myStatusFilter');
  if (el) el.value = status;
  renderMyTickets();
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const incidents = allTickets.filter(t => t.type === 'INCIDENT');
  const requests  = allTickets.filter(t => t.type === 'SERVICE_REQUEST');
  const open      = allTickets.filter(t => !['CLOSED','CANCELLED'].includes(t.status));
  const p1Open    = open.filter(t => t.priority === 'P1');
  const pending   = open.filter(t => t.status === 'PENDING');
  const breached  = open.filter(t => t.sla?.isBreached);

  const content = document.getElementById('pageContent');
  content.innerHTML = `
  <div class="queue-header">
    <div>
      <h1 class="queue-title">Dashboard Operacional</h1>
      <div class="queue-subtitle">Visão em tempo real · Olá, ${currentUser.name} 👋</div>
    </div>
    <div class="queue-actions">
      <button class="btn btn-primary" onclick="showNewTicketModal()">＋ Novo Chamado</button>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-card" onclick="navigateTo('incidents')">
      <div class="stat-label">Incidentes Abertos</div>
      <div class="stat-value">${incidents.filter(t=>!['CLOSED','CANCELLED'].includes(t.status)).length}</div>
      <div class="stat-meta">${incidents.filter(t=>t.status==='IN_PROGRESS').length} em andamento</div>
    </div>
    <div class="stat-card ${p1Open.length > 0 ? 'stat-danger' : ''}">
      <div class="stat-label">Críticos P1</div>
      <div class="stat-value">${p1Open.length}</div>
      <div class="stat-meta">Prioridade máxima</div>
    </div>
    <div class="stat-card ${breached.length > 0 ? 'stat-danger' : ''}">
      <div class="stat-label">SLA Estourado</div>
      <div class="stat-value">${breached.length}</div>
      <div class="stat-meta">Requer ação imediata</div>
    </div>
    <div class="stat-card ${pending.length > 0 ? 'stat-warning' : ''}">
      <div class="stat-label">Em Pendência</div>
      <div class="stat-value">${pending.length}</div>
      <div class="stat-meta">SLA congelado</div>
    </div>
    <div class="stat-card" onclick="navigateTo('requests')">
      <div class="stat-label">Requisições</div>
      <div class="stat-value">${requests.filter(t=>!['CLOSED','CANCELLED'].includes(t.status)).length}</div>
      <div class="stat-meta">Solicitações de serviço</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Resolvidos Hoje</div>
      <div class="stat-value">${allTickets.filter(t=>t.resolvedAt && new Date(t.resolvedAt).toDateString()===new Date().toDateString()).length}</div>
      <div class="stat-meta">Chamados fechados</div>
    </div>
  </div>

  ${p1Open.length > 0 ? `
  <div style="margin-bottom:16px">
    <div class="section-title">🚨 Alertas Críticos — P1 Abertos</div>
    <div class="ticket-table-wrapper">
      ${renderTicketTableContent(p1Open.slice(0,5))}
    </div>
  </div>` : ''}

  <div class="section-title" style="margin-bottom:12px">📋 Últimos Chamados Ativos</div>
  <div class="ticket-table-wrapper">
    ${renderTicketTableContent(open.slice(0,10))}
  </div>`;
}

// ─── QUEUE VIEW (FULL ITSM FILTERS & DUAL MOBILE/DESKTOP ENGINE) ───────────────
function renderQueue(page) {
  const isIncidents = page === 'incidents';
  const type = isIncidents ? 'INCIDENT' : 'SERVICE_REQUEST';
  const rawTickets = allTickets.filter(t => t.type === type);

  // Stats para badges dinâmicos dos chips
  const totalCount = rawTickets.length;
  const mineCount  = rawTickets.filter(t => t.assignedTo === currentUser?.name && !['CLOSED','CANCELLED'].includes(t.status)).length;
  const inProgCount = rawTickets.filter(t => t.status === 'IN_PROGRESS').length;
  const pendingCount = rawTickets.filter(t => t.status === 'PENDING').length;
  const p1Count = rawTickets.filter(t => t.priority === 'P1' && !['CLOSED','CANCELLED'].includes(t.status)).length;
  const unassignedCount = rawTickets.filter(t => !t.assignedTo && !['CLOSED','CANCELLED'].includes(t.status)).length;
  const resolvedCount = rawTickets.filter(t => t.status === 'RESOLVED').length;

  // Técnicos e equipes para dropdowns
  const technicians = [...new Set(allTickets.map(t => t.assignedTo).filter(Boolean))];
  const teams = [...new Set(allTickets.map(t => t.assignedTeam).filter(Boolean))];

  // Aplicação dos filtros multi-dimensionais
  const filtered = filterTickets(rawTickets, {
    status: queueFilters.status,
    prio: queueFilters.prio,
    assignee: queueFilters.assignee,
    team: queueFilters.team,
    sla: queueFilters.sla,
    chip: queueFilters.chip,
    search: searchQuery
  });

  const hasActiveFilters = queueFilters.chip !== 'ALL' || 
                           queueFilters.status !== 'ALL' || 
                           queueFilters.prio !== 'ALL' || 
                           queueFilters.assignee !== 'ALL' || 
                           queueFilters.team !== 'ALL' || 
                           queueFilters.sla !== 'ALL' || 
                           Boolean(searchQuery);

  const content = document.getElementById('pageContent');
  content.innerHTML = `
  <div class="queue-header">
    <div>
      <h1 class="queue-title">${isIncidents ? '🔥 Incidentes' : '📋 Requisições de Serviço'}</h1>
      <div class="queue-subtitle">
        Exibindo <strong>${filtered.length}</strong> de ${totalCount} chamado${totalCount !== 1 ? 's' : ''}
        ${hasActiveFilters ? ' · (Filtros ativos)' : ''}
      </div>
    </div>
    <div class="queue-actions">
      <button class="btn btn-primary" onclick="showNewTicketModal('${type}')">＋ Abrir Chamado</button>
    </div>
  </div>

  <div class="filter-bar">
    <!-- CHIPS RÁPIDOS DE ROLAGEM HORIZONTAL -->
    <div class="filter-chips-scroll">
      <span class="filter-chip ${queueFilters.chip === 'ALL' ? 'active' : ''}" onclick="setQueueFilterChip('${page}', 'ALL')">
        🗂️ Todos <span class="chip-count">${totalCount}</span>
      </span>
      <span class="filter-chip ${queueFilters.chip === 'MINE' ? 'active' : ''}" onclick="setQueueFilterChip('${page}', 'MINE')">
        🎯 Meus Chamados <span class="chip-count">${mineCount}</span>
      </span>
      <span class="filter-chip ${queueFilters.chip === 'IN_PROGRESS' ? 'active' : ''}" onclick="setQueueFilterChip('${page}', 'IN_PROGRESS')">
        ⚡ Em Andamento <span class="chip-count">${inProgCount}</span>
      </span>
      <span class="filter-chip ${queueFilters.chip === 'PENDING' ? 'active' : ''}" onclick="setQueueFilterChip('${page}', 'PENDING')">
        ⏸️ Pausados / MPRJ <span class="chip-count">${pendingCount}</span>
      </span>
      <span class="filter-chip ${queueFilters.chip === 'P1' ? 'active' : ''}" onclick="setQueueFilterChip('${page}', 'P1')">
        🚨 P1 Críticos <span class="chip-count">${p1Count}</span>
      </span>
      <span class="filter-chip ${queueFilters.chip === 'UNASSIGNED' ? 'active' : ''}" onclick="setQueueFilterChip('${page}', 'UNASSIGNED')">
        ⚠️ Não Atribuídos <span class="chip-count">${unassignedCount}</span>
      </span>
      <span class="filter-chip ${queueFilters.chip === 'RESOLVED' ? 'active' : ''}" onclick="setQueueFilterChip('${page}', 'RESOLVED')">
        ✅ Resolvidos <span class="chip-count">${resolvedCount}</span>
      </span>
    </div>

    <!-- DROPDOWNS MULTI-DIMENSIONAIS DE CONTROLE -->
    <div class="filter-dropdowns-row">
      <select id="statusFilter" class="filter-select" onchange="onFilterChange('${page}', 'status', this.value)">
        <option value="ALL">Status: Todos</option>
        ${['NEW','ASSIGNED','IN_PROGRESS','PENDING','RESOLVED','CLOSED','REOPENED','CANCELLED'].map(s=>`<option value="${s}" ${queueFilters.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
      </select>

      <select id="prioFilter" class="filter-select" onchange="onFilterChange('${page}', 'prio', this.value)">
        <option value="ALL">Prioridade: Todas</option>
        ${['P1','P2','P3','P4','P5'].map(p=>`<option value="${p}" ${queueFilters.prio===p?'selected':''}>${p}</option>`).join('')}
      </select>

      <select id="assigneeFilter" class="filter-select" onchange="onFilterChange('${page}', 'assignee', this.value)">
        <option value="ALL">Responsável: Todos</option>
        <option value="ME" ${queueFilters.assignee==='ME'?'selected':''}>🎯 Atribuídos a Mim</option>
        <option value="UNASSIGNED" ${queueFilters.assignee==='UNASSIGNED'?'selected':''}>⚠️ Não Atribuídos</option>
        ${technicians.map(t=>`<option value="${escHtml(t)}" ${queueFilters.assignee===t?'selected':''}>👤 ${escHtml(t)}</option>`).join('')}
      </select>

      <select id="teamFilter" class="filter-select" onchange="onFilterChange('${page}', 'team', this.value)">
        <option value="ALL">Equipe: Todas</option>
        ${teams.map(tm=>`<option value="${escHtml(tm)}" ${queueFilters.team===tm?'selected':''}>🏢 ${escHtml(tm)}</option>`).join('')}
      </select>

      <select id="slaFilter" class="filter-select" onchange="onFilterChange('${page}', 'sla', this.value)">
        <option value="ALL">SLA: Todos</option>
        <option value="BREACHED" ${queueFilters.sla==='BREACHED'?'selected':''}>🚨 SLA Estourado</option>
        <option value="CRITICAL" ${queueFilters.sla==='CRITICAL'?'selected':''}>⚠️ Crítico (&lt; 25%)</option>
        <option value="PAUSED" ${queueFilters.sla==='PAUSED'?'selected':''}>⏸️ SLA Pausado</option>
      </select>

      ${hasActiveFilters ? `
      <button class="btn btn-ghost btn-sm" onclick="clearAllQueueFilters('${page}')" style="font-size:11px;padding:4px 8px;color:var(--danger)">
        ✕ Limpar Filtros
      </button>` : ''}
    </div>
  </div>

  <div class="ticket-table-wrapper">
    ${renderTicketTableContent(filtered)}
  </div>`;
}

function filterTickets(tickets, filtersOrStatus = {}, maybePrio = 'ALL') {
  const filters = typeof filtersOrStatus === 'string' ? { status: filtersOrStatus, prio: maybePrio } : (filtersOrStatus || {});
  const { status, prio, assignee, team, sla, chip, search } = filters;

  return tickets.filter(t => {
    // 1. Chip rápido
    if (chip === 'MINE') {
      if (t.assignedTo !== currentUser?.name || ['CLOSED','CANCELLED'].includes(t.status)) return false;
    } else if (chip === 'IN_PROGRESS') {
      if (t.status !== 'IN_PROGRESS') return false;
    } else if (chip === 'PENDING') {
      if (t.status !== 'PENDING') return false;
    } else if (chip === 'P1') {
      if (t.priority !== 'P1' || ['CLOSED','CANCELLED'].includes(t.status)) return false;
    } else if (chip === 'UNASSIGNED') {
      if (t.assignedTo || ['CLOSED','CANCELLED'].includes(t.status)) return false;
    } else if (chip === 'RESOLVED') {
      if (t.status !== 'RESOLVED') return false;
    }

    // 2. Status dropdown
    if (status && status !== 'ALL' && t.status !== status) return false;

    // 3. Priority dropdown
    if (prio && prio !== 'ALL' && t.priority !== prio) return false;

    // 4. Assignee dropdown
    if (assignee && assignee !== 'ALL') {
      if (assignee === 'ME') {
        if (t.assignedTo !== currentUser?.name) return false;
      } else if (assignee === 'UNASSIGNED') {
        if (t.assignedTo) return false;
      } else {
        if (t.assignedTo !== assignee) return false;
      }
    }

    // 5. Team dropdown
    if (team && team !== 'ALL' && t.assignedTeam !== team) return false;

    // 6. SLA dropdown
    if (sla && sla !== 'ALL') {
      const snap = t.sla || {};
      if (sla === 'BREACHED' && !snap.isBreached) return false;
      if (sla === 'CRITICAL' && (snap.percentUsed < 75 || snap.isBreached || t.isPaused)) return false;
      if (sla === 'PAUSED' && !t.isPaused) return false;
    }

    // 7. Search query
    if (search) {
      const q = search.toLowerCase();
      const idMatch = (t.id || '').toLowerCase().includes(q);
      const titleMatch = (t.title || '').toLowerCase().includes(q);
      const custMatch = (t.customer?.name || '').toLowerCase().includes(q);
      const locMatch = (t.customer?.location || t.customer?.comarca || '').toLowerCase().includes(q);
      const techMatch = (t.assignedTo || '').toLowerCase().includes(q);
      if (!idMatch && !titleMatch && !custMatch && !locMatch && !techMatch) return false;
    }

    return true;
  }).sort((a, b) => {
    const po = { P1: 0, P2: 1, P3: 2, P4: 3, P5: 4 };
    if (po[a.priority] !== po[b.priority]) return po[a.priority] - po[b.priority];
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

window.setQueueFilterChip = function(page, chipKey) {
  queueFilters.chip = chipKey;
  if (chipKey === 'IN_PROGRESS') queueFilters.status = 'IN_PROGRESS';
  else if (chipKey === 'PENDING') queueFilters.status = 'PENDING';
  else if (chipKey === 'RESOLVED') queueFilters.status = 'RESOLVED';
  else if (chipKey === 'ALL') queueFilters.status = 'ALL';
  renderQueue(page);
};

window.onFilterChange = function(page, key, val) {
  queueFilters[key] = val;
  if (key === 'status' && val !== 'ALL') queueFilters.chip = 'CUSTOM';
  renderQueue(page);
};

window.clearAllQueueFilters = function(page) {
  queueFilters = { status: 'ALL', prio: 'ALL', assignee: 'ALL', team: 'ALL', sla: 'ALL', chip: 'ALL' };
  searchQuery = '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  renderQueue(page);
};

window.setQueueFilter = function(page, status) {
  queueFilters.status = status;
  renderQueue(page);
};

function renderTicketTableContent(tickets) {
  if (!tickets.length) {
    return `<div class="empty-state">
      <div class="empty-state-icon">✅</div>
      <div class="empty-state-title">Fila Limpa!</div>
      <div class="empty-state-sub">Nenhum chamado encontrado para os filtros selecionados.</div>
    </div>`;
  }

  // 1. Desktop Table
  const desktop = `
  <div class="ticket-desktop-view">
    <table class="ticket-table">
      <thead><tr>
        <th>ID</th><th>Título</th><th>Prioridade</th><th>Status</th>
        <th>SLA Resolução</th><th>Responsável</th><th>Categoria</th><th>Criado em</th>
      </tr></thead>
      <tbody>
        ${tickets.map(t => `
        <tr onclick="openTicket('${t.id}')" ${t.priority==='P1'&&!['CLOSED','RESOLVED'].includes(t.status)?'class="p1-pulse"':''}>
          <td><div class="ticket-id">${t.id}</div>${t.type==='SERVICE_REQUEST'?'<span class="ticket-type-sr">SR</span>':''}</td>
          <td>
            <div class="ticket-title-text">${escHtml(t.title)}</div>
            <div class="ticket-subtitle">👤 ${escHtml(t.customer?.name||'—')} · 📍 ${escHtml(t.customer?.location||'—')}</div>
            ${t.isPaused?`<div class="pause-chip">⏸️ ${getPendingReasonLabel(t.pauseReason)}</div>`:''}
          </td>
          <td><span class="prio-badge prio-${t.priority}">● ${t.priority}</span></td>
          <td><span class="status-badge s-${t.status}"><span class="status-dot" style="background:${statusColor(t.status)}"></span>${statusLabel(t.status)}</span></td>
          <td>${renderSLAMini(t.sla)}</td>
          <td>
            ${t.assignedTo ?
              `<div class="assignee-cell"><div class="assignee-avatar">${t.assignedTo.substring(0,2).toUpperCase()}</div>${escHtml(t.assignedTo)}</div>` :
              `<span style="color:var(--text-muted);font-size:12px">Não atribuído</span>`}
          </td>
          <td><div class="ticket-subtitle">${t.category||'—'}</div><div class="ticket-subtitle">${t.subcategory||''}</div></td>
          <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">${fmtDate(t.createdAt)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  // 2. Mobile Cards (Touch Ergonomics)
  const mobile = `
  <div class="ticket-mobile-view">
    ${tickets.map(t => {
      const sla = t.sla || {};
      const isBreached = sla.isBreached;
      const isPaused = t.isPaused;
      const slaCls = isPaused ? 'paused' : isBreached ? 'breached' : (sla.percentUsed > 80 ? 'critical' : (sla.percentUsed > 50 ? 'warning' : 'ok'));
      const fillCls = `sla-fill-${slaCls}`;
      const pct = Math.min(100, sla.percentUsed || 0);

      return `
      <div class="ticket-mobile-card ${t.priority === 'P1' && !['CLOSED','RESOLVED'].includes(t.status) ? 'p1-card' : ''}" onclick="openTicket('${t.id}')">
        <div class="tm-top-row">
          <div class="tm-id-wrap">
            <span class="tm-id">#${t.id}</span>
            ${t.type === 'SERVICE_REQUEST' ? '<span class="ticket-type-sr">SR</span>' : ''}
            <span class="prio-badge prio-${t.priority}">● ${t.priority}</span>
          </div>
          <span class="status-badge s-${t.status}">
            <span class="status-dot" style="background:${statusColor(t.status)}"></span>
            ${statusLabel(t.status)}
          </span>
        </div>

        <div class="tm-title">${escHtml(t.title)}</div>

        <div class="tm-meta-list">
          <div class="tm-meta-item">
            <span>👤</span>
            <span>${escHtml(t.customer?.name || 'Solicitante')}</span>
            <span style="color:var(--text-muted)">·</span>
            <span>📍 ${escHtml(t.customer?.location || t.customer?.comarca || 'Campo')}</span>
          </div>
          <div class="tm-meta-item">
            <span>🏷️</span>
            <span>${escHtml(t.category || 'Geral')} ${t.subcategory ? `› ${escHtml(t.subcategory)}` : ''}</span>
          </div>
          <div class="tm-meta-item">
            <span>🛠️</span>
            <span>${t.assignedTo ? `Resp: <strong>${escHtml(t.assignedTo)}</strong> (${escHtml(t.assignedTeam || 'N1')})` : '<span style="color:var(--warning);font-weight:600">⚠️ Não atribuído</span>'}</span>
          </div>
          ${isPaused ? `<div class="pause-chip" style="margin-top:2px">⏸️ ${getPendingReasonLabel(t.pauseReason)}</div>` : ''}
        </div>

        <div class="tm-sla-box">
          <div class="tm-sla-header">
            <span style="color:var(--text-secondary)">⏱️ SLA Resolução:</span>
            <span class="sla-label-mini sla-${slaCls}">${isPaused ? '⏸️ PAUSADO' : isBreached ? '🚨 ESTOURADO' : (sla.formattedRemaining || '—')}</span>
          </div>
          <div class="sla-track">
            <div class="sla-fill ${fillCls}" style="width: ${pct}%"></div>
          </div>
        </div>

        <div class="tm-action-bar">
          <button class="btn btn-primary btn-sm tm-action-btn">
            ${t.assignedTo === currentUser?.name ? 'Continuar Atendimento ›' : 'Abrir Chamado ›'}
          </button>
        </div>
      </div>`;
    }).join('')}
  </div>`;

  return desktop + mobile;
}

function renderSLAMini(sla) {
  if (!sla) return '—';
  const cls = sla.isPaused ? 'paused' : sla.isBreached ? 'breached' : sla.status === 'COMPLETED' ? 'completed' : sla.percentUsed > 80 ? 'critical' : sla.percentUsed > 50 ? 'warning' : 'ok';
  const fillCls = `sla-fill-${cls}`;
  const pct = Math.min(100, sla.percentUsed||0);
  return `<div class="sla-bar-mini">
    <div class="sla-track-mini"><div class="sla-fill-mini ${fillCls}" style="width:${pct}%"></div></div>
    <span class="sla-label-mini sla-${cls}">${sla.isPaused?'⏸️':sla.isBreached?'🚨':''} ${sla.formattedRemaining||'—'}</span>
  </div>`;
}

// ─── FORM VIEW ────────────────────────────────────────────────────────────────
window.openTicket = async function(id) {
  currentTicketId = id;
  const content = document.getElementById('pageContent');
  content.innerHTML = `<div class="empty-state"><div class="skeleton" style="height:200px;margin-bottom:12px"></div><div class="skeleton" style="height:400px"></div></div>`;
  try {
    const ticket = await apiFetch(`/tickets/${id}`);
    renderFormView(ticket);
  } catch(e) {
    showToast('error','Erro', e.message);
  }
};

function renderFormView(ticket) {
  if (currentTicketId !== ticket.id) return; // stale update guard
  const content = document.getElementById('pageContent');
  const sla = ticket.sla || {};
  const prio = (constants.PRIORITY || {})[ticket.priority] || {};
  const isTerminal = ['CLOSED','CANCELLED'].includes(ticket.status);
  const isResolved  = ticket.status === 'RESOLVED';
  const actions = getActions(ticket);

  document.getElementById('breadcrumbCurrent').textContent = ticket.id;

  const slaFillCls = sla.isPaused ? 'paused' : sla.isBreached ? 'breached' : sla.percentUsed > 80 ? 'critical' : sla.percentUsed > 50 ? 'warning' : 'ok';

  content.innerHTML = `
  <div class="form-view">
    <!-- BACK BUTTON -->
    <button class="btn btn-ghost btn-sm" style="margin-bottom:10px" onclick="navigateTo('${ticket.type==='INCIDENT'?'incidents':'requests'}')">← Voltar à Fila</button>

    <!-- STICKY HEADER -->
    <div class="form-header" id="formHeader">
      <div class="form-ticket-id">${ticket.id}</div>
      <div class="form-header-top">
        <h2 class="form-ticket-title">${escHtml(ticket.title)}</h2>
      </div>
      <div class="form-badges">
        <span class="type-badge type-${ticket.type==='INCIDENT'?'INC':'SR'}">${ticket.type==='INCIDENT'?'⚡ Incidente':'📋 Requisição'}</span>
        <span class="status-badge s-${ticket.status}"><span class="status-dot" style="background:${statusColor(ticket.status)}"></span>${statusLabel(ticket.status)}</span>
        <span class="prio-badge prio-${ticket.priority}">● ${ticket.priority} — ${prio.label||ticket.priority}</span>
        ${ticket.isFCR ? '<span style="background:var(--success-bg);color:var(--success);border:1px solid #bbf7d0;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">🏆 FCR</span>' : ''}
        ${ticket.isPaused ? `<span class="pause-chip">⏸️ ${getPendingReasonLabel(ticket.pauseReason)}</span>` : ''}
      </div>

      <div class="sla-meters">
        <div class="sla-meter">
          <div class="sla-meter-label">
            <span class="sla-meter-name">⏱️ SLA Resolução</span>
            <span class="sla-meter-time sla-time-${slaFillCls}" id="slaTimeMain">${sla.formattedRemaining || '—'}</span>
          </div>
          <div class="sla-track"><div class="sla-fill sla-fill-${slaFillCls}" id="slaFillMain" style="width:${Math.min(100,sla.percentUsed||0)}%"></div></div>
        </div>
        <div class="sla-meter" style="max-width:200px">
          <div class="sla-meter-label">
            <span class="sla-meter-name">📅 Deadline</span>
            <span class="sla-meter-time sla-time-${sla.isBreached?'breached':'ok'}" style="font-size:11px">${fmtDateFull(ticket.resolutionDeadline)}</span>
          </div>
          <div class="sla-track" style="height:4px;opacity:.5"><div class="sla-fill sla-fill-${slaFillCls}" style="width:${Math.min(100,sla.percentUsed||0)}%"></div></div>
        </div>
      </div>

      <!-- ONE-STEP ACTIONS BAR -->
      <div class="actions-bar" id="actionsBar">
        ${actions.map(a => `
          <button class="btn btn-${a.style} btn-sm" id="action-${a.id}" onclick="handleAction('${ticket.id}','${a.id}',${JSON.stringify(a.payload||null).replace(/"/g,'&quot;')})">
            ${a.icon} ${a.label}
          </button>`).join('')}
      </div>
    </div>

    <!-- 5-TAB FORM -->
    <div class="form-tabs-wrapper">
      <div class="form-tabs-nav">
        <div class="form-tab active" data-tab="details">📋 Detalhes</div>
        <div class="form-tab" data-tab="sla">⏱️ SLA <span class="form-tab-count">${(ticket.pendingHistory||[]).length}</span></div>
        <div class="form-tab" data-tab="cmdb">🖥️ Ativos <span class="form-tab-count">${(ticket.ciAssets||[]).length}</span></div>
        <div class="form-tab" data-tab="journals">📓 Diários <span class="form-tab-count">${(ticket.journals||[]).length}</span></div>
        <div class="form-tab" data-tab="resolution">🏆 Resolução</div>
      </div>

      <!-- TAB 1: DETAILS -->
      <div class="form-tab-panel active" id="tab-details">
        <div class="tab-section">
          <div class="section-title">📝 Informações do Chamado</div>
          <div class="field-grid" style="margin-bottom:12px">
            <div class="field-group full-width">
              <div class="field-label">Título / Assunto</div>
              <div class="field-value">${escHtml(ticket.title)}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Tipo</div>
              <div class="field-value">${ticket.type === 'INCIDENT' ? '⚡ Incidente' : '📋 Requisição'}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Grupo de Serviço</div>
              <div class="field-value">${ticket.serviceGroup || '—'}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Categoria</div>
              <div class="field-value">${ticket.category || '—'}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Subcategoria</div>
              <div class="field-value">${ticket.subcategory || '—'}</div>
            </div>
          </div>
          <div class="field-group full-width" style="margin-bottom:12px">
            <div class="field-label">Descrição / Relato</div>
            <div class="field-value" style="white-space:pre-wrap;line-height:1.6;min-height:80px">${escHtml(ticket.description||'Sem descrição.')}</div>
          </div>
        </div>

        <hr class="divider">

        <div class="tab-section">
          <div class="section-title">👤 Solicitante</div>
          <div class="field-grid field-grid-3">
            <div class="field-group"><div class="field-label">Nome</div><div class="field-value">${escHtml(ticket.customer?.name||'—')}</div></div>
            <div class="field-group"><div class="field-label">Matrícula</div><div class="field-value">${escHtml(ticket.customer?.matricula||'—')}</div></div>
            <div class="field-group"><div class="field-label">Cargo</div><div class="field-value">${escHtml(ticket.customer?.cargo||'—')}</div></div>
            <div class="field-group"><div class="field-label">Setor / Departamento</div><div class="field-value">${escHtml(ticket.customer?.setor||ticket.customer?.department||'—')}</div></div>
            <div class="field-group"><div class="field-label">Localização / Comarca</div><div class="field-value">${escHtml(ticket.customer?.location||ticket.customer?.comarca||'—')}</div></div>
            <div class="field-group"><div class="field-label">Ramal / Telefone</div><div class="field-value">${escHtml(ticket.customer?.phone||'—')}</div></div>
            <div class="field-group"><div class="field-label">E-mail</div><div class="field-value" style="font-size:12px">${escHtml(ticket.customer?.email||'—')}</div></div>
            <div class="field-group"><div class="field-label">Empresa / Órgão</div><div class="field-value">${escHtml(ticket.customer?.company||'—')}</div></div>
            <div class="field-group"><div class="field-label">Andar</div><div class="field-value">${escHtml(ticket.customer?.andar||'—')}</div></div>
          </div>
        </div>

        <hr class="divider">

        <div class="tab-section">
          <div class="section-title">🧑‍💻 Atribuição & Responsabilidade</div>
          <div class="field-grid field-grid-3">
            <div class="field-group"><div class="field-label">Técnico Responsável</div><div class="field-value">${ticket.assignedTo ? `<div class="assignee-cell"><div class="assignee-avatar" style="width:26px;height:26px">${ticket.assignedTo.substring(0,2).toUpperCase()}</div>${escHtml(ticket.assignedTo)}</div>` : '<span style="color:var(--text-muted)">Não atribuído</span>'}</div></div>
            <div class="field-group"><div class="field-label">Fila / Equipe</div><div class="field-value">${escHtml(ticket.assignedTeam||'—')}</div></div>
            <div class="field-group"><div class="field-label">Grupo Escalação</div><div class="field-value">${escHtml(ticket.escalationGroup||'—')}</div></div>
          </div>
        </div>

        <hr class="divider">

        <div class="tab-section">
          <div class="section-title">✅ Quest Checklist de Campo</div>
          <div class="quest-list">
            ${(ticket.questChecklist||[]).map(q => `
            <div class="quest-item ${q.done?'done':''}" onclick="toggleQuest('${ticket.id}','${q.id}')">
              <div class="quest-checkbox">${q.done?'✓':''}</div>
              <div class="quest-text">${escHtml(q.text)}</div>
              ${q.done ? '<span style="color:var(--success);font-size:12px;font-weight:600">✓ Concluído</span>' : ''}
            </div>`).join('')}
          </div>
          <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">
            Progresso: ${(ticket.questChecklist||[]).filter(q=>q.done).length}/${(ticket.questChecklist||[]).length} itens concluídos
          </div>
        </div>
      </div>

      <!-- TAB 2: SLA -->
      <div class="form-tab-panel" id="tab-sla">
        <div class="tab-section">
          <div class="section-title">📊 Dados do SLA</div>
          <div class="field-grid field-grid-3">
            <div class="field-group"><div class="field-label">Impacto</div><div class="field-value">${ticket.impact||'—'}</div></div>
            <div class="field-group"><div class="field-label">Urgência</div><div class="field-value">${ticket.urgency||'—'}</div></div>
            <div class="field-group"><div class="field-label">Prioridade Calculada</div><div class="field-value"><span class="prio-badge prio-${ticket.priority}">● ${ticket.priority}</span></div></div>
            <div class="field-group"><div class="field-label">Criado em</div><div class="field-value" style="font-size:12px">${fmtDateFull(ticket.createdAt)}</div></div>
            <div class="field-group"><div class="field-label">Respondido em</div><div class="field-value" style="font-size:12px">${ticket.respondedAt?fmtDateFull(ticket.respondedAt):'⏳ Pendente'}</div></div>
            <div class="field-group"><div class="field-label">Deadline Resolução</div><div class="field-value" style="font-size:12px;color:${sla.isBreached?'var(--danger)':'var(--text-primary)'}">${fmtDateFull(ticket.resolutionDeadline)}</div></div>
            <div class="field-group"><div class="field-label">Total Pausado (min)</div><div class="field-value" style="font-weight:700;color:var(--status-pending)">${ticket.totalPausedMinutes||0} min compensados</div></div>
            <div class="field-group"><div class="field-label">Status SLA</div><div class="field-value"><span class="sla-label-mini sla-${sla.isPaused?'paused':sla.isBreached?'breached':sla.percentUsed>80?'critical':sla.percentUsed>50?'warning':'ok'}">${sla.isPaused?'⏸️ PAUSADO':sla.isBreached?'🚨 ESTOURADO':sla.status||'OK'}</span></div></div>
          </div>
        </div>

        <hr class="divider">

        <div class="tab-section">
          <div class="section-title">⏸️ Histórico de Pendências (Clock Stop Log)</div>
          ${(ticket.pendingHistory||[]).length === 0
            ? '<div style="color:var(--text-muted);font-size:13px;padding:12px 0">Nenhuma pendência registrada para este chamado.</div>'
            : `<table class="pending-history-table">
                <thead><tr><th>#</th><th>Motivo</th><th>SLA Parou?</th><th>Pausado em</th><th>Retomado em</th><th>Duração</th><th>Pausado Por</th></tr></thead>
                <tbody>
                  ${(ticket.pendingHistory||[]).map((p,i) => `<tr>
                    <td>${i+1}</td>
                    <td style="font-weight:500">${escHtml(p.reasonLabel||p.reasonId)}</td>
                    <td>${p.stopsTheClock?'<span class="clock-stopped-badge">⏸️ SIM</span>':'<span class="clock-running-badge">▶️ NÃO</span>'}</td>
                    <td style="font-size:11px">${fmtDateFull(p.pausedAt)}</td>
                    <td style="font-size:11px">${p.resumedAt?fmtDateFull(p.resumedAt):'<span style="color:var(--status-pending)">Em andamento</span>'}</td>
                    <td style="font-weight:600">${p.durationMinutes!=null?p.durationMinutes+' min':'—'}</td>
                    <td style="font-size:12px">${escHtml(p.pausedBy||'—')}</td>
                  </tr>`).join('')}
                </tbody>
              </table>`}
        </div>
      </div>

      <!-- TAB 3: CMDB -->
      <div class="form-tab-panel" id="tab-cmdb">
        <div class="tab-section">
          <div class="section-title" style="justify-content:space-between">
            🖥️ Ativos Vinculados (CMDB)
            <button class="btn btn-secondary btn-sm" onclick="showAddAssetModal('${ticket.id}')">+ Adicionar Ativo</button>
          </div>
          <div class="asset-list">
            ${(ticket.ciAssets||[]).length === 0
              ? '<div style="color:var(--text-muted);font-size:13px;padding:12px 0">Nenhum ativo vinculado. Clique em Adicionar para associar Configuration Items.</div>'
              : (ticket.ciAssets||[]).map(a => `
              <div class="asset-card">
                <div class="asset-icon">${a.type==='SWITCH'?'🔌':a.type==='CAMERA'?'📷':a.type==='SERVER'?'🖥️':a.type==='FIBER'?'🔆':'🔧'}</div>
                <div class="asset-info">
                  <div class="asset-name">${escHtml(a.name||a.type||'Ativo')}</div>
                  <div class="asset-meta">${escHtml(a.location||'')} ${a.ip?`· IP: ${a.ip}`:''} ${a.port?`· Porta: ${a.port}`:''}</div>
                </div>
                <span class="prio-badge" style="font-size:10px;background:var(--info-bg);color:var(--info);border-color:var(--p4-border)">${a.type||'CI'}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- TAB 4: JOURNALS -->
      <div class="form-tab-panel" id="tab-journals">
        <div class="journal-filters" id="journalFilters">
          ${['ALL','NOTE','CUSTOMER_CONTACT','HISTORY','SLM','ESCALATION','SYSTEM','RESOLUTION'].map(f=>`
          <span class="journal-filter-chip ${activeJournalFilter===f?'active':''}" onclick="setJournalFilter('${ticket.id}','${f}')">${journalFilterLabel(f)}</span>`).join('')}
        </div>

        <div class="journal-add-bar">
          <textarea class="journal-add-textarea" id="journalDraftTA" placeholder="Adicionar nota de acompanhamento... (Shift+Enter para nova linha)" rows="2">${journalDraft}</textarea>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="btn btn-primary btn-sm" onclick="addNote('${ticket.id}',false)">📝 Nota</button>
            <button class="btn btn-secondary btn-sm" onclick="addNote('${ticket.id}',true)">📞 Contato</button>
          </div>
        </div>

        <div class="journal-timeline" id="journalTimeline">
          ${renderJournalTimeline(ticket.journals||[])}
        </div>
      </div>

      <!-- TAB 5: RESOLUTION -->
      <div class="form-tab-panel" id="tab-resolution">
        ${ticket.resolution?.solvedAt
          ? `<div class="fcr-indicator" style="margin-bottom:20px">
              <span class="icon">🏆</span>
              CHAMADO RESOLVIDO em ${fmtDateFull(ticket.resolution.solvedAt)} por ${escHtml(ticket.resolution.solvedBy||'—')}
            </div>
            <div class="field-grid field-grid-2" style="margin-bottom:16px">
              <div class="field-group"><div class="field-label">Close Code</div><div class="field-value" style="font-weight:600">${escHtml(ticket.resolution.closeCode||'—')}</div></div>
              <div class="field-group"><div class="field-label">Causa Raiz</div><div class="field-value" style="font-weight:600">${escHtml(ticket.resolution.causeCode||'—')}</div></div>
              <div class="field-group"><div class="field-label">Primeiro Contato (FCR)?</div><div class="field-value" style="color:${ticket.resolution.isFCR?'var(--success)':'var(--text-secondary)'};font-weight:700">${ticket.resolution.isFCR?'✅ Sim':'❌ Não'}</div></div>
            </div>
            <div class="field-group full-width">
              <div class="field-label">Laudo Técnico</div>
              <div class="field-value" style="white-space:pre-wrap;line-height:1.6;min-height:100px">${escHtml(ticket.resolution.notes||'—')}</div>
            </div>
            ${ticket.resolution.evidencePhotos && ticket.resolution.evidencePhotos.length > 0 ? `
            <div class="field-group full-width" style="margin-top:16px">
              <div class="field-label" style="font-weight:700;display:flex;align-items:center;gap:6px">
                📷 Evidências Fotográficas de Campo (${ticket.resolution.evidencePhotos.length})
              </div>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
                ${ticket.resolution.evidencePhotos.map((photo, i) => {
                  const src = typeof photo === 'string' ? photo : (photo.dataUrl || photo);
                  return `
                    <div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:#000;box-shadow:0 2px 6px rgba(0,0,0,0.15);">
                      <img src="${src}" style="width:130px;height:95px;object-fit:cover;cursor:pointer;display:block;" onclick="window.open('${src}')" alt="Foto ${i+1}">
                      <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#fff;font-size:10px;padding:2px 4px;text-align:center;">Evidência #${i+1}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>` : ''}
            ${ticket.resolution.signature ? `
            <div class="field-group full-width" style="margin-top:16px">
              <div class="field-label" style="font-weight:700;display:flex;align-items:center;gap:6px">
                ✍️ Assinatura Digital do Solicitante / Servidor
              </div>
              <div style="background:#ffffff;border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:inline-block;margin-top:6px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <img src="${ticket.resolution.signature}" style="max-height:80px;max-width:320px;display:block;" alt="Assinatura Digital">
                <div style="font-size:10px;color:var(--success);margin-top:4px;font-weight:700;">
                  ✓ Autenticidade Registrada na Trilha Criptográfica SHA-256
                </div>
              </div>
            </div>` : ''}`
          : `<div class="resolution-form" id="resolutionFormEl">
              <div style="padding:12px;background:var(--warning-bg);border:1px solid var(--p3-border);border-radius:var(--radius);font-size:13px;color:var(--warning);font-weight:500">
                ⚠️ Preencha todos os campos obrigatórios para resolver o chamado. O laudo fica permanentemente registrado.
              </div>
              <div class="field-grid field-grid-2">
                <div class="field-group">
                  <div class="field-label field-required">Close Code</div>
                  <select class="form-select" id="resCloseCode">
                    <option value="">Selecione o Close Code...</option>
                    ${(constants.CLOSE_CODES||[]).map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}
                  </select>
                </div>
                <div class="field-group">
                  <div class="field-label field-required">Causa Raiz</div>
                  <select class="form-select" id="resCauseCode">
                    <option value="">Selecione a Causa Raiz...</option>
                    ${(constants.CAUSE_CODES||[]).map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="field-group">
                <div class="field-label field-required">Laudo Técnico (Resolução Detalhada)</div>
                <textarea class="form-textarea" id="resNotes" rows="6" placeholder="Descreva detalhadamente o que foi feito: diagnóstico, procedimento executado, resultado final..."></textarea>
              </div>

              <div class="photo-upload-area" onclick="document.getElementById('photoUploadInput').click()">
                <div class="photo-upload-icon">📷</div>
                <div style="font-size:13px;color:var(--text-muted)">Clique para adicionar evidências fotográficas</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">JPG, PNG — Máx 5MB por foto</div>
              </div>
              <input type="file" id="photoUploadInput" accept="image/*" multiple class="hidden" onchange="handlePhotoUpload(event)">
              <div class="photo-preview-grid" id="photoPreviewGrid"></div>

              <div class="field-group">
                <div class="field-label">Assinatura Digital do Solicitante</div>
                <div class="sig-wrap">
                  <canvas id="sigCanvas" width="700" height="160"></canvas>
                </div>
                <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="clearSignature()">🗑️ Limpar Assinatura</button>
              </div>

              <div style="display:flex;gap:8px;padding-top:8px;border-top:1px solid var(--border)">
                <button class="btn btn-success" style="flex:1" onclick="resolveTicket('${ticket.id}')">✅ Confirmar Resolução do Chamado</button>
              </div>
            </div>`}
      </div>
    </div>
  </div>`;

  // Setup tabs
  document.querySelectorAll('.form-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.form-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
      if (tab.dataset.tab === 'resolution') initSignaturePad();
    });
  });

  // Save journal draft
  const ta = document.getElementById('journalDraftTA');
  if (ta) ta.addEventListener('input', e => journalDraft = e.target.value);
}

// ─── JOURNAL ──────────────────────────────────────────────────────────────────
function renderJournalTimeline(journals) {
  const filtered = activeJournalFilter === 'ALL' ? journals : journals.filter(j => j.type === activeJournalFilter);
  const sorted = [...filtered].reverse();
  if (!sorted.length) return `<div style="color:var(--text-muted);font-size:13px">Nenhum diário encontrado para este filtro.</div>`;
  return sorted.map(j => `
  <div class="journal-entry j-${j.type}">
    <div class="journal-dot"></div>
    <div class="journal-card">
      <div class="journal-card-header">
        <span class="journal-type-badge jbadge-${j.type}">${journalTypeLabel(j.type)}</span>
        <span class="journal-author">${escHtml(j.author)}</span>
        <span class="journal-time">${fmtDateFull(j.timestamp)}</span>
      </div>
      <div class="journal-content">${escHtml(j.content)}</div>
    </div>
  </div>`).join('');
}

window.setJournalFilter = function(ticketId, filter) {
  activeJournalFilter = filter;
  const ticket = allTickets.find(t => t.id === ticketId);
  if (!ticket) return;
  document.querySelectorAll('.journal-filter-chip').forEach((c,i) => {
    const filters = ['ALL','NOTE','CUSTOMER_CONTACT','HISTORY','SLM','ESCALATION','SYSTEM','RESOLUTION'];
    c.classList.toggle('active', filters[i] === filter);
  });
  const timeline = document.getElementById('journalTimeline');
  if (timeline) timeline.innerHTML = renderJournalTimeline(ticket.journals||[]);
};

window.addNote = async function(ticketId, isCustomerContact) {
  const ta = document.getElementById('journalDraftTA');
  const text = ta?.value?.trim();
  if (!text) { showToast('warning','Atenção', 'Digite uma nota antes de salvar.'); return; }
  try {
    await apiFetch(`/tickets/${ticketId}/action`, 'POST', {
      action: 'ADD_NOTE', payload: { text, isCustomerContact }
    });
    journalDraft = '';
    if (ta) ta.value = '';
    showToast('success', 'Nota Salva!', isCustomerContact ? 'Contato com cliente registrado.' : 'Nota técnica adicionada.');
  } catch(e) { showToast('error','Erro', e.message); }
};

// ─── ACTIONS ──────────────────────────────────────────────────────────────────
function getActions(ticket) {
  const s = ticket.status;
  const actions = [];
  if (s === 'NEW') {
    actions.push({id:'TAKE_OWNERSHIP',label:'Assumir',icon:'🛡️',style:'primary'});
    if (currentUser.role !== 'OPERADOR') actions.push({id:'ESCALATE_PROMPT',label:'Reatribuir',icon:'📨',style:'secondary'});
    actions.push({id:'ADD_NOTE_PROMPT',label:'Nota',icon:'📝',style:'secondary'});
    actions.push({id:'CANCEL_PROMPT',label:'Cancelar',icon:'❌',style:'danger'});
  } else if (s === 'ASSIGNED') {
    actions.push({id:'START_WORK',label:'Iniciar Trabalho',icon:'▶️',style:'primary'});
    actions.push({id:'PAUSE_PROMPT',label:'Colocar em Pendente',icon:'⏸️',style:'warning'});
    actions.push({id:'ADD_NOTE_PROMPT',label:'Nota',icon:'📝',style:'secondary'});
    if (currentUser.role !== 'OPERADOR') actions.push({id:'ESCALATE_PROMPT',label:'Escalar',icon:'🔺',style:'secondary'});
  } else if (s === 'IN_PROGRESS') {
    actions.push({id:'PAUSE_PROMPT',label:'Colocar em Pendente',icon:'⏸️',style:'warning'});
    actions.push({id:'RESOLVE_TAB',label:'Resolver Chamado',icon:'✅',style:'success'});
    if (currentUser.role !== 'OPERADOR') actions.push({id:'ESCALATE_PROMPT',label:'Escalar N2',icon:'🔺',style:'secondary'});
    actions.push({id:'ADD_NOTE_PROMPT',label:'Nota',icon:'📝',style:'secondary'});
  } else if (s === 'PENDING') {
    actions.push({id:'RESUME_SLA',label:'Retomar Atendimento',icon:'▶️',style:'primary'});
    actions.push({id:'RESOLVE_TAB',label:'Resolver',icon:'✅',style:'success'});
    actions.push({id:'ADD_NOTE_PROMPT',label:'Nota',icon:'📝',style:'secondary'});
  } else if (s === 'RESOLVED') {
    if (currentUser.role !== 'OPERADOR') {
      actions.push({id:'CLOSE',label:'Homologar e Fechar',icon:'🏆',style:'success'});
    }
    actions.push({id:'REOPEN_PROMPT',label:'Reabrir',icon:'⚠️',style:'danger'});
    actions.push({id:'ADD_NOTE_PROMPT',label:'Nota',icon:'📝',style:'secondary'});
  } else if (s === 'REOPENED') {
    actions.push({id:'TAKE_OWNERSHIP',label:'Reassumir',icon:'🛡️',style:'primary'});
    actions.push({id:'START_WORK',label:'Iniciar',icon:'▶️',style:'primary'});
    actions.push({id:'ADD_NOTE_PROMPT',label:'Nota',icon:'📝',style:'secondary'});
  } else if (s === 'CLOSED' || s === 'CANCELLED') {
    if (currentUser.role === 'MASTER') actions.push({id:'REOPEN_PROMPT',label:'Reabrir (Master)',icon:'⚠️',style:'danger'});
  }
  return actions;
}

window.handleAction = async function(ticketId, actionId, payload) {
  if (actionId === 'PAUSE_PROMPT')    { showPendingModal(ticketId); return; }
  if (actionId === 'ADD_NOTE_PROMPT') { scrollToTab('journals'); focusJournalTextarea(); return; }
  if (actionId === 'ESCALATE_PROMPT') { showEscalateModal(ticketId); return; }
  if (actionId === 'CANCEL_PROMPT')   { showPromptModal(ticketId, 'CANCEL', 'Cancelar Chamado', 'Informe o motivo do cancelamento:'); return; }
  if (actionId === 'REOPEN_PROMPT')   { showPromptModal(ticketId, 'REOPEN', 'Reabrir Chamado', 'Informe o motivo da reabertura:'); return; }
  if (actionId === 'RESOLVE_TAB')     { scrollToTab('resolution'); return; }

  try {
    const btn = document.getElementById(`action-${actionId}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    await apiFetch(`/tickets/${ticketId}/action`, 'POST', {action: actionId, payload: payload||{}});
    showToast('success', 'Ação Executada!', `${actionId} aplicado com sucesso.`);
  } catch(e) { showToast('error','Falha na Ação', e.message); }
};

window.toggleQuest = async function(ticketId, itemId) {
  try {
    await apiFetch(`/tickets/${ticketId}/action`, 'POST', {action: 'TOGGLE_QUEST', payload: {itemId}});
  } catch(e) { showToast('error','Erro', e.message); }
};

// ─── PENDING MODAL ────────────────────────────────────────────────────────────
function showPendingModal(ticketId) {
  pendingSelectedReason = null;
  const reasons = constants.PENDING_REASONS || [];
  const icons = {AGUARDANDO_USUARIO:'👤',AGUARDANDO_CLIENTE:'🏢',AGUARDANDO_ACESSO:'🔐',AGUARDANDO_PECA:'📦',AGUARDANDO_TERCEIRO:'🏭',AGUARDANDO_MUDANCA:'📋',MPRJ_PENDENTE:'⚖️',AGENDADO:'📅',MANUTENCAO_INTERNA:'🔧'};
  showModal({
    title: '⏸️ Colocar em Pendente — Selecione o Motivo',
    size: '',
    body: `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
      O relógio do SLA será congelado para os motivos marcados como <strong>SLA Para</strong>.
    </p>
    <div class="pending-reason-list" id="pendingReasonList">
      ${reasons.map(r => `
      <div class="pending-reason-item" id="preason-${r.id}" onclick="selectPendingReason('${r.id}')">
        <span class="pending-reason-icon">${icons[r.id]||'⏸️'}</span>
        <span class="pending-reason-label">${escHtml(r.label)}</span>
        <span class="pending-reason-clock ${r.stopsTheClock?'clock-yes':'clock-no'}">${r.stopsTheClock?'⏸️ SLA Para':'▶️ SLA Segue'}</span>
      </div>`).join('')}
    </div>
    <div class="field-group" style="margin-top:14px" id="schedDateGroup" style="display:none">
      <div class="field-label">Data Agendada</div>
      <input type="datetime-local" class="form-input" id="schedDate">
    </div>`,
    footer: `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-warning" onclick="confirmPending('${ticketId}')">⏸️ Confirmar Pendência</button>`
  });
}

window.selectPendingReason = function(id) {
  pendingSelectedReason = id;
  document.querySelectorAll('.pending-reason-item').forEach(el => {
    el.classList.toggle('selected', el.id === `preason-${id}`);
  });
  const schedGroup = document.getElementById('schedDateGroup');
  if (schedGroup) schedGroup.style.display = id === 'AGENDADO' ? '' : 'none';
};

window.confirmPending = async function(ticketId) {
  if (!pendingSelectedReason) { showToast('warning','Atenção','Selecione o motivo da pendência.'); return; }
  const schedDate = document.getElementById('schedDate')?.value || null;
  try {
    closeModal();
    await apiFetch(`/tickets/${ticketId}/action`, 'POST', {
      action: 'PAUSE_SLA',
      payload: { reasonId: pendingSelectedReason, scheduledDate: schedDate }
    });
    showToast('success','SLA Pausado!', getPendingReasonLabel(pendingSelectedReason));
  } catch(e) { showToast('error','Erro', e.message); }
};

// ─── ESCALATE MODAL ───────────────────────────────────────────────────────────
function showEscalateModal(ticketId) {
  showModal({
    title: '🔺 Escalar Chamado',
    body: `
    <div class="field-group" style="margin-bottom:12px">
      <div class="field-label field-required">Fila / Grupo de Destino</div>
      <select class="form-select" id="escalTarget">
        <option value="">Selecione o destino...</option>
        ${['N2 — Redes','N2 — CFTV','N2 — Sistemas','N3 — Infraestrutura','N3 — Segurança','Gestão TI'].map(t=>`<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div class="field-group">
      <div class="field-label">Motivo da Escalação</div>
      <textarea class="form-textarea" id="escalReason" rows="3" placeholder="Descreva por que está escalando..."></textarea>
    </div>`,
    footer: `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmEscalate('${ticketId}')">🔺 Escalar</button>`
  });
}

window.confirmEscalate = async function(ticketId) {
  const target = document.getElementById('escalTarget')?.value;
  const reason = document.getElementById('escalReason')?.value;
  if (!target) { showToast('warning','Atenção','Selecione o destino da escalação.'); return; }
  closeModal();
  try {
    await apiFetch(`/tickets/${ticketId}/action`, 'POST', {
      action: 'ESCALATE', payload: { targetGroup: target, reason }
    });
    showToast('success','Escalado!', `Chamado transferido para: ${target}`);
  } catch(e) { showToast('error','Erro', e.message); }
};

// ─── PROMPT MODAL ─────────────────────────────────────────────────────────────
function showPromptModal(ticketId, action, title, label) {
  showModal({
    title,
    body: `
    <div class="field-group">
      <div class="field-label field-required">${label}</div>
      <textarea class="form-textarea" id="promptReason" rows="3" placeholder="Informe o motivo..."></textarea>
    </div>`,
    footer: `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-danger" onclick="confirmPromptAction('${ticketId}','${action}')">${action === 'CANCEL' ? '❌ Cancelar Chamado' : '⚠️ Confirmar'}</button>`
  });
}

window.confirmPromptAction = async function(ticketId, action) {
  const reason = document.getElementById('promptReason')?.value?.trim();
  if (!reason) { showToast('warning','Atenção','Informe o motivo.'); return; }
  closeModal();
  try {
    await apiFetch(`/tickets/${ticketId}/action`, 'POST', { action, payload: { reason } });
    showToast('success','Concluído!', `Ação ${action} aplicada.`);
  } catch(e) { showToast('error','Erro', e.message); }
};

// ─── RESOLUTION ───────────────────────────────────────────────────────────────
let photoDataUrls = [];

window.handlePhotoUpload = function(e) {
  const files = [...e.target.files];
  files.forEach(f => {
    const reader = new FileReader();
    reader.onload = ev => {
      photoDataUrls.push(ev.target.result);
      const grid = document.getElementById('photoPreviewGrid');
      if (grid) grid.innerHTML = photoDataUrls.map((d,i) => `<img class="photo-thumb" src="${d}" alt="Foto ${i+1}">`).join('');
    };
    reader.readAsDataURL(f);
  });
};

function initSignaturePad() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas || sigCanvas === canvas) return;
  sigCanvas = canvas;
  sigCtx = canvas.getContext('2d');
  sigCtx.strokeStyle = '#1e293b';
  sigCtx.lineWidth = 2;
  sigCtx.lineCap = 'round';

  const getPos = e => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * (canvas.width / r.width), y: (src.clientY - r.top) * (canvas.height / r.height) };
  };
  canvas.addEventListener('mousedown', e => { sigDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove', e => { if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });
  canvas.addEventListener('mouseup',   () => sigDrawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); sigDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });
  canvas.addEventListener('touchend',   () => sigDrawing = false);
}

window.clearSignature = function() {
  if (sigCtx && sigCanvas) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
};

window.resolveTicket = async function(ticketId) {
  const closeCode = document.getElementById('resCloseCode')?.value;
  const causeCode = document.getElementById('resCauseCode')?.value;
  const notes     = document.getElementById('resNotes')?.value?.trim();

  if (!closeCode || !causeCode || !notes) {
    showToast('warning','Campos Obrigatórios','Preencha Close Code, Causa Raiz e Laudo Técnico.');
    return;
  }

  const signature = sigCanvas ? sigCanvas.toDataURL() : null;

  try {
    await apiFetch(`/tickets/${ticketId}/action`, 'POST', {
      action: 'RESOLVE',
      payload: { closeCode, causeCode, notes, evidencePhotos: photoDataUrls, signature }
    });
    photoDataUrls = [];
    showToast('success','🏆 Chamado Resolvido!', 'Laudo registrado com sucesso.');
  } catch(e) { showToast('error','Falha na Resolução', e.message); }
};

// ─── NEW TICKET MODAL ─────────────────────────────────────────────────────────
window.showNewTicketModal = function(preType) {
  const svgGroups = constants.SERVICE_CATEGORIES || [];
  const type = preType || 'INCIDENT';

  showModal({
    title: '＋ Abrir Novo Chamado',
    size: 'modal-lg',
    body: `
    <div class="field-grid field-grid-2" style="margin-bottom:16px">
      <div class="field-group">
        <div class="field-label field-required">Tipo</div>
        <select class="form-select" id="ntType" onchange="updateNTCategories()">
          <option value="INCIDENT" ${type==='INCIDENT'?'selected':''}>⚡ Incidente</option>
          <option value="SERVICE_REQUEST" ${type==='SERVICE_REQUEST'?'selected':''}>📋 Requisição de Serviço</option>
        </select>
      </div>
      <div class="field-group">
        <div class="field-label field-required">Prioridade</div>
        <select class="form-select" id="ntPriority">
          <option value="P1">P1 — Crítico (60min resp.)</option>
          <option value="P2">P2 — Alto (120min resp.)</option>
          <option value="P3" selected>P3 — Médio (240min resp.)</option>
          <option value="P4">P4 — Baixo (480min resp.)</option>
          <option value="P5">P5 — Planejado</option>
        </select>
      </div>
    </div>
    <div class="field-group full-width" style="margin-bottom:12px">
      <div class="field-label field-required">Título / Assunto</div>
      <input class="form-input" id="ntTitle" placeholder="Descreva o problema ou solicitação de forma concisa...">
    </div>
    <div class="field-group full-width" style="margin-bottom:16px">
      <div class="field-label field-required">Descrição Detalhada</div>
      <textarea class="form-textarea" id="ntDesc" rows="4" placeholder="Detalhe o problema: quando começou, qual equipamento, o que foi observado..."></textarea>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:14px">
      <div class="section-title" style="margin-bottom:10px">📁 Categorização</div>
      <div class="field-grid field-grid-3">
        <div class="field-group">
          <div class="field-label">Grupo de Serviço</div>
          <select class="form-select" id="ntServiceGroup" onchange="updateNTCategories()">
            <option value="">Selecione...</option>
            ${svgGroups.map(g=>`<option value="${g.id}">${g.label}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <div class="field-label">Categoria</div>
          <select class="form-select" id="ntCategory" onchange="updateNTSubcategories()">
            <option value="">Selecione o grupo primeiro...</option>
          </select>
        </div>
        <div class="field-group">
          <div class="field-label">Subcategoria</div>
          <select class="form-select" id="ntSubcategory">
            <option value="">Selecione a categoria...</option>
          </select>
        </div>
      </div>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:14px">
      <div class="section-title" style="margin-bottom:10px">👤 Solicitante</div>
      <div class="field-grid field-grid-2">
        <div class="field-group"><div class="field-label field-required">Nome</div><input class="form-input" id="ntCustName" placeholder="Nome completo"></div>
        <div class="field-group"><div class="field-label">Ramal / Telefone</div><input class="form-input" id="ntCustPhone" placeholder="(21) 3805-0000"></div>
        <div class="field-group"><div class="field-label">Setor / Departamento</div><input class="form-input" id="ntCustDept" placeholder="TI, Segurança..."></div>
        <div class="field-group"><div class="field-label">Localização / Sala</div><input class="form-input" id="ntCustLoc" placeholder="3° Andar — Sala 302"></div>
        <div class="field-group"><div class="field-label">E-mail</div><input class="form-input" id="ntCustEmail" type="email" placeholder="usuario@empresa.br"></div>
        <div class="field-group"><div class="field-label">Matrícula</div><input class="form-input" id="ntCustMatr" placeholder="000000"></div>
      </div>
    </div>`,
    footer: `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="createTicket()">＋ Abrir Chamado</button>`
  });
};

window.updateNTCategories = function() {
  const groupId = document.getElementById('ntServiceGroup')?.value;
  const cats = (constants.SERVICE_CATEGORIES||[]).find(g=>g.id===groupId)?.categories||[];
  const el = document.getElementById('ntCategory');
  if (el) el.innerHTML = `<option value="">Selecione...</option>${cats.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}`;
  const el2 = document.getElementById('ntSubcategory');
  if (el2) el2.innerHTML = '<option value="">Selecione a categoria...</option>';
};

window.updateNTSubcategories = function() {
  const groupId = document.getElementById('ntServiceGroup')?.value;
  const catId   = document.getElementById('ntCategory')?.value;
  const cats = (constants.SERVICE_CATEGORIES||[]).find(g=>g.id===groupId)?.categories||[];
  const subs = cats.find(c=>c.id===catId)?.subcategories||[];
  const el = document.getElementById('ntSubcategory');
  if (el) el.innerHTML = `<option value="">Selecione...</option>${subs.map(s=>`<option value="${s}">${s}</option>`).join('')}`;
};

window.createTicket = async function() {
  const title = document.getElementById('ntTitle')?.value?.trim();
  const desc  = document.getElementById('ntDesc')?.value?.trim();
  const name  = document.getElementById('ntCustName')?.value?.trim();
  if (!title || !desc || !name) { showToast('warning','Campos Obrigatórios','Preencha Título, Descrição e Nome do Solicitante.'); return; }

  const body = {
    type:         document.getElementById('ntType')?.value,
    priority:     document.getElementById('ntPriority')?.value,
    title, description: desc,
    serviceGroup: document.getElementById('ntServiceGroup')?.value,
    category:     document.getElementById('ntCategory')?.value,
    subcategory:  document.getElementById('ntSubcategory')?.value,
    customer: {
      name:        name,
      phone:       document.getElementById('ntCustPhone')?.value,
      department:  document.getElementById('ntCustDept')?.value,
      location:    document.getElementById('ntCustLoc')?.value,
      email:       document.getElementById('ntCustEmail')?.value,
      matricula:   document.getElementById('ntCustMatr')?.value,
    }
  };
  try {
    closeModal();
    const ticket = await apiFetch('/tickets','POST', body);
    showToast('success','✅ Chamado Aberto!', `#${ticket.id} criado.`);
    openTicket(ticket.id);
  } catch(e) { showToast('error','Erro ao Criar', e.message); }
};

// ─── ADD ASSET MODAL ──────────────────────────────────────────────────────────
window.showAddAssetModal = function(ticketId) {
  showModal({
    title: '🖥️ Adicionar Ativo (CMDB)',
    body: `
    <div class="field-grid field-grid-2">
      <div class="field-group">
        <div class="field-label field-required">Tipo de Ativo</div>
        <select class="form-select" id="assetType">
          <option value="SWITCH">🔌 Switch</option>
          <option value="CAMERA">📷 Câmera CFTV</option>
          <option value="NVR">📹 NVR/DVR</option>
          <option value="SERVER">🖥️ Servidor</option>
          <option value="FIBER">🔆 Enlace Fibra</option>
          <option value="PATCH_PANEL">🔧 Patch Panel</option>
          <option value="COMPUTER">💻 Computador</option>
          <option value="OTHER">📦 Outro</option>
        </select>
      </div>
      <div class="field-group">
        <div class="field-label field-required">Nome / Identificação</div>
        <input class="form-input" id="assetName" placeholder="ex: SW-3F-24, CAM-B4-01">
      </div>
      <div class="field-group">
        <div class="field-label">IP / Endereço</div>
        <input class="form-input" id="assetIP" placeholder="192.168.1.100">
      </div>
      <div class="field-group">
        <div class="field-label">Porta</div>
        <input class="form-input" id="assetPort" placeholder="ex: 24, GE0/0/1">
      </div>
      <div class="field-group full-width">
        <div class="field-label">Localização</div>
        <input class="form-input" id="assetLocation" placeholder="3° Andar — Rack A, Sala 302">
      </div>
    </div>`,
    footer: `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmAddAsset('${ticketId}')">Adicionar Ativo</button>`
  });
};

window.confirmAddAsset = async function(ticketId) {
  const name = document.getElementById('assetName')?.value?.trim();
  if (!name) { showToast('warning','Atenção','Informe o nome do ativo.'); return; }
  closeModal();
  try {
    await apiFetch(`/tickets/${ticketId}/action`, 'POST', {
      action: 'ADD_CI_ASSET',
      payload: { asset: {
        type:     document.getElementById('assetType')?.value,
        name, ip: document.getElementById('assetIP')?.value,
        port:     document.getElementById('assetPort')?.value,
        location: document.getElementById('assetLocation')?.value,
      }}
    });
    showToast('success','Ativo Adicionado!', name);
  } catch(e) { showToast('error','Erro', e.message); }
};

// ─── MODAL ENGINE ─────────────────────────────────────────────────────────────
function showModal({title, body, footer, size=''}) {
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
  <div class="modal-backdrop" id="modalBackdrop" onclick="closeModalOnBackdrop(event)">
    <div class="modal-box ${size}" id="modalBox">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  </div>`;
}

window.closeModal = function() {
  document.getElementById('modalContainer').innerHTML = '';
};
window.closeModalOnBackdrop = function(e) {
  if (e.target.id === 'modalBackdrop') closeModal();
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function scrollToTab(tabName) {
  const tab = document.querySelector(`.form-tab[data-tab="${tabName}"]`);
  if (tab) tab.click();
}

function focusJournalTextarea() {
  setTimeout(() => {
    const ta = document.getElementById('journalDraftTA');
    if (ta) { ta.focus(); ta.scrollIntoView({behavior:'smooth',block:'center'}); }
  }, 100);
}

function statusLabel(s) {
  const map = { NEW:'Novo', ASSIGNED:'Atribuído', IN_PROGRESS:'Em Andamento', PENDING:'Pendente',
    RESOLVED:'Resolvido', CLOSED:'Fechado', REOPENED:'Reaberto', CANCELLED:'Cancelado' };
  return map[s] || s;
}

function statusColor(s) {
  const map = { NEW:'#7c3aed', ASSIGNED:'#0369a1', IN_PROGRESS:'#0891b2',
    PENDING:'#d97706', RESOLVED:'#059669', CLOSED:'#64748b', REOPENED:'#be185d', CANCELLED:'#dc2626' };
  return map[s] || '#94a3b8';
}

function getPendingReasonLabel(id) {
  if (!id) return 'Pendente';
  const r = (constants.PENDING_REASONS||[]).find(x => x.id === id);
  return r ? r.label : id;
}

function journalTypeLabel(t) {
  const map = { NOTE:'📝 Nota', CUSTOMER_CONTACT:'📞 Contato', EMAIL:'📧 E-mail',
    HISTORY:'🔄 Histórico', SLM:'⏱️ SLA', ESCALATION:'🔺 Escalação',
    SYSTEM:'🤖 Sistema', RESOLUTION:'🏆 Resolução' };
  return map[t] || t;
}

function journalFilterLabel(f) {
  if (f === 'ALL') return '🗂️ Todos';
  return journalTypeLabel(f);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
}

function fmtDateFull(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(type, title, msg, duration=4000) {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><div class="toast-text"><div class="toast-title">${escHtml(title)}</div>${msg?`<div class="toast-msg">${escHtml(msg)}</div>`:''}</div><button class="toast-dismiss" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ─── DARK MODE ────────────────────────────────────────────────────────────────
function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
  localStorage.setItem('opsdesk_theme', isDark ? 'light' : 'dark');
  document.getElementById('btnDarkMode').textContent = isDark ? '🌙' : '☀️';
}

// ─── MOBILE SIDEBAR ───────────────────────────────────────────────────────────
function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
  document.getElementById('mobileOverlay').classList.toggle('open');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('mobileOverlay').classList.remove('open');
}

// ─── SLA LIVE POLLING ─────────────────────────────────────────────────────────
function startSLAPolling() {
  if (slaIntervalId) clearInterval(slaIntervalId);
  slaIntervalId = setInterval(() => fetchTickets(), 60000); // refresh every 60s
}

// ─── GLOBAL WINDOW EXPORTS (Galvanic Defense) ─────────────────────────────────
window.navigateTo = navigateTo;
window.renderQueue = renderQueue;
window.renderDashboard = renderDashboard;
window.renderMyTickets = renderMyTickets;
window.showToast = showToast;
window.toggleDarkMode = toggleDarkMode;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.handleLogout = handleLogout;
window.showLogin = showLogin;
window.initApp = initApp;
window.fillQuickLogin = fillQuickLogin;

window.setQueueFilterChip = setQueueFilterChip;
window.onFilterChange = onFilterChange;
window.clearAllQueueFilters = clearAllQueueFilters;
