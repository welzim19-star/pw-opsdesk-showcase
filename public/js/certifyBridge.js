/**
 * PW OPSDESK — PONTE DO ECOSSISTEMA (Simulador dos apps de campo)
 * Página: certify-bridge
 * Reutiliza globals do app.js: apiFetch, escHtml, showToast, openTicket, navigateTo.
 */
(function () {
  'use strict';

  const CHANNEL_META = {
    'ingest':      { label: 'Abertura',  icon: '📥', cls: 'ch-ingest'  },
    'sync-status': { label: 'Sync',      icon: '🔄', cls: 'ch-sync'    },
    'resolve':     { label: 'Fechamento', icon: '✅', cls: 'ch-resolve' }
  };

  const bridge = { apps: [], running: false, runs: {} };

  // ─── RENDER DA PÁGINA ──────────────────────────────────────────────────────
  window.renderCertifyBridge = async function () {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="queue-header">
        <div>
          <h1 class="queue-title">📡 Ponte do Ecossistema PW</h1>
          <div class="queue-subtitle">Simulador dos aplicativos de campo enviando dados ao OpsDesk em tempo real</div>
        </div>
      </div>
      <div class="bridge-flow">
        <div class="bridge-flow-step"><span class="bridge-flow-num">1</span><div><strong>App de campo envia</strong><small>Técnico abre, atende e fecha a OS no celular</small></div></div>
        <div class="bridge-flow-arrow">➜</div>
        <div class="bridge-flow-step"><span class="bridge-flow-num">2</span><div><strong>OpsDesk recebe pela API</strong><small>Mesmos canais de integração usados em produção</small></div></div>
        <div class="bridge-flow-arrow">➜</div>
        <div class="bridge-flow-step"><span class="bridge-flow-num">3</span><div><strong>Central acompanha ao vivo</strong><small>Chamado, SLA, fotos e laudo atualizam via WebSocket</small></div></div>
      </div>
      <div id="bridgeApps" class="bridge-apps"><div class="empty-state"><div class="empty-state-sub">Carregando aplicativos…</div></div></div>
      <div class="bridge-console" id="bridgeConsole">
        <div class="bridge-panel">
          <div class="bridge-panel-title">⏱️ Linha do tempo ao vivo</div>
          <div id="bridgeTimeline" class="bridge-timeline">
            <div class="bridge-placeholder">Escolha um aplicativo acima e clique em <strong>Simular atendimento</strong>.</div>
          </div>
          <div id="bridgeResult"></div>
        </div>
        <div class="bridge-panel">
          <div class="bridge-panel-title">📨 Requisição enviada pelo app</div>
          <pre id="bridgeRequest" class="bridge-code"><span class="c-muted">// Aqui aparece a chamada HTTP real que o app de campo faria.</span></pre>
        </div>
      </div>`;

    try {
      const data = await apiFetch('/simulator/apps');
      bridge.apps = data.apps || [];
      renderBridgeApps();
    } catch (e) {
      document.getElementById('bridgeApps').innerHTML =
        `<div class="empty-state">
          <div class="empty-state-title">Não foi possível carregar o simulador</div>
          <div class="empty-state-sub">${escHtml(e.message)}</div>
          <button class="btn btn-secondary" style="margin-top:12px" onclick="renderCertifyBridge()">🔄 Tentar Novamente</button>
        </div>`;
    }
  };

  function renderBridgeApps() {
    const el = document.getElementById('bridgeApps');
    if (!el) return;
    el.innerHTML = bridge.apps.map(app => app.scenarios.map(sc => `
      <div class="bridge-card" style="--app-color:${app.color}">
        <div class="bridge-card-head">
          <div class="bridge-card-icon">${app.icon}</div>
          <div>
            <div class="bridge-card-name">${escHtml(app.name)}</div>
            <div class="bridge-card-vertical">${escHtml(app.vertical)}</div>
          </div>
          <span class="bridge-prio bridge-prio-${sc.priorityHint}">${sc.priorityHint}</span>
        </div>
        <p class="bridge-card-desc">${escHtml(app.description)}</p>
        <div class="bridge-card-scenario">
          <div class="bridge-card-scenario-title">${escHtml(sc.title)}</div>
          <div class="bridge-card-scenario-sum">${escHtml(sc.summary)}</div>
          <div class="bridge-card-steps">${sc.steps.length} etapas: abre → sincroniza → fecha com laudo</div>
        </div>
        <button class="btn btn-primary bridge-run-btn" data-scenario="${sc.id}" onclick="runBridgeScenario('${sc.id}')">▶ Simular atendimento</button>
      </div>`).join('')).join('');
    setBridgeButtonsDisabled(bridge.running);
  }

  function setBridgeButtonsDisabled(disabled) {
    document.querySelectorAll('.bridge-run-btn').forEach(b => {
      b.disabled = disabled;
      b.textContent = disabled ? '⏳ Simulando…' : '▶ Simular atendimento';
    });
  }

  function findScenario(id) {
    for (const app of bridge.apps) {
      const sc = app.scenarios.find(s => s.id === id);
      if (sc) return { app, sc };
    }
    return null;
  }

  // ─── TIMELINE ──────────────────────────────────────────────────────────────
  function paintTimeline(sc, states) {
    const tl = document.getElementById('bridgeTimeline');
    if (!tl) return;
    tl.innerHTML = sc.steps.map((s, i) => {
      const ch = CHANNEL_META[s.channel] || CHANNEL_META['sync-status'];
      const st = states[i] || 'pending';
      const mark = st === 'done' ? '✔' : st === 'running' ? '<span class="bridge-spin"></span>' : i + 1;
      return `
        <div class="bridge-step bridge-step-${st}">
          <div class="bridge-step-mark">${mark}</div>
          <div class="bridge-step-body">
            <div class="bridge-step-label">${escHtml(s.label)}</div>
            <span class="bridge-chip ${ch.cls}">${ch.icon} ${ch.label}</span>
          </div>
        </div>`;
    }).join('');
  }

  function paintRequest(http) {
    const pre = document.getElementById('bridgeRequest');
    if (!pre || !http) return;
    const body = JSON.stringify(http.body, null, 2)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/"([^"]+)":/g, '<span class="c-key">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="c-str">"$1"</span>');
    pre.innerHTML =
      `<span class="c-verb">${http.method}</span> <span class="c-path">${http.path}</span>\n` +
      `<span class="c-muted">x-api-key: ${http.headers['x-api-key']}</span>\n` +
      `<span class="c-muted">content-type: application/json</span>\n\n${body}`;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ─── EXECUÇÃO ──────────────────────────────────────────────────────────────
  window.runBridgeScenario = async function (scenarioId) {
    if (bridge.running) return;
    const found = findScenario(scenarioId);
    if (!found) return;
    const { sc } = found;

    bridge.running = true;
    setBridgeButtonsDisabled(true);
    document.getElementById('bridgeResult').innerHTML = '';
    const states = sc.steps.map(() => 'pending');
    paintTimeline(sc, states);
    document.getElementById('bridgeConsole').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    let ctx = {};
    let last = null;
    try {
      for (let i = 0; i < sc.steps.length; i++) {
        states[i] = 'running';
        paintTimeline(sc, states);
        await sleep(i === 0 ? 500 : 1100);
        last = await apiFetch('/simulator/step', 'POST', { scenarioId, stepIndex: i, ctx });
        ctx = { ticketId: last.ticketId, osNumber: last.osNumber };
        states[i] = 'done';
        paintTimeline(sc, states);
        paintRequest(last.http);
      }
      showBridgeResult(last);
    } catch (e) {
      const tl = document.getElementById('bridgeTimeline');
      if (tl) tl.insertAdjacentHTML('beforeend', `<div class="bridge-error">⚠️ ${escHtml(e.message)}</div>`);
      showToast('error', 'Simulador', e.message);
    } finally {
      bridge.running = false;
      setBridgeButtonsDisabled(false);
    }
  };

  function showBridgeResult(last) {
    const box = document.getElementById('bridgeResult');
    if (!box || !last) return;
    box.innerHTML = `
      <div class="bridge-done">
        <div>
          <div class="bridge-done-title">🎉 Atendimento concluído — chamado <strong>#${escHtml(last.ticketId)}</strong></div>
          <div class="bridge-done-sub">Status final: <strong>${escHtml(last.status)}</strong> · Prioridade ${escHtml(last.priority)} · fotos, assinatura e laudo anexados</div>
        </div>
        <div class="bridge-done-actions">
          <button class="btn btn-primary btn-sm" onclick="openTicket('${escHtml(last.ticketId)}')">Abrir chamado</button>
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('dashboard')">Ver no Dashboard</button>
        </div>
      </div>`;
  }
})();
