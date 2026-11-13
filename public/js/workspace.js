/**
 * PW OPSDESK — WORKSPACE ENHANCER
 * Camada de organização sobre o Dashboard existente (sem alterar a lógica do app.js):
 *   1. Faixa "Comece por aqui" com atalhos para os 3 fluxos principais.
 *   2. Métricas agrupadas em "Atenção agora" e "Visão geral".
 *   3. Botão 💡 de guia rápido na barra superior.
 * Mantém 100% do visual atual: só reorganiza a hierarquia.
 */
(function () {
  'use strict';

  const GUIDE_KEY = 'opsdesk_guide_dismissed';

  // ─── DASHBOARD: envolve o render original ──────────────────────────────────
  const originalRenderDashboard = window.renderDashboard;
  if (typeof originalRenderDashboard === 'function') {
    window.renderDashboard = function () {
      originalRenderDashboard.apply(this, arguments);
      try { enhanceDashboard(); } catch (e) { console.warn('[workspace] enhance falhou:', e); }
    };
  }

  function enhanceDashboard() {
    const content = document.getElementById('pageContent');
    const header = content && content.querySelector('.queue-header');
    const row = content && content.querySelector('.stats-row');
    if (!content || !header || !row || row.dataset.grouped) return;

    // 1) Agrupa as 6 métricas existentes: [0]=Incid. [1]=P1 [2]=SLA [3]=Pend. [4]=Req. [5]=Resolvidos
    const cards = Array.from(row.children);
    if (cards.length === 6) {
      const mk = (label, items) => {
        const g = document.createElement('div');
        g.className = 'ws-group';
        g.innerHTML = `<div class="ws-group-label">${label}</div>`;
        const r = document.createElement('div');
        r.className = 'stats-row';
        r.dataset.grouped = '1';
        items.forEach(c => r.appendChild(c));
        g.appendChild(r);
        return g;
      };
      const attention = mk('🔥 Atenção agora', [cards[1], cards[2], cards[3]]);
      const overview = mk('📊 Visão geral', [cards[0], cards[4], cards[5]]);
      row.replaceWith(attention, overview);
    }

    // 2) Faixa "Comece por aqui"
    if (!localStorage.getItem(GUIDE_KEY)) {
      const guide = document.createElement('div');
      guide.className = 'ws-guide';
      guide.id = 'wsGuide';
      guide.innerHTML = `
        <div class="ws-guide-title">🧭 Comece por aqui</div>
        <div class="ws-guide-actions">
          <button class="ws-guide-btn" onclick="navigateTo('incidents')">🔥 Ver o que é crítico</button>
          <button class="ws-guide-btn" onclick="navigateTo('certify-bridge')">📡 Simular um atendimento de campo</button>
          <button class="ws-guide-btn" onclick="navigateTo('audit-vault')">🛡️ Conferir a trilha de auditoria</button>
          <button class="ws-guide-btn" onclick="showWorkspaceGuide()">💡 Como o OpsDesk funciona</button>
        </div>
        <button class="ws-guide-dismiss" onclick="dismissWorkspaceGuide()" title="Ocultar">Ocultar ✕</button>`;
      header.insertAdjacentElement('afterend', guide);
    }
  }

  window.dismissWorkspaceGuide = function () {
    localStorage.setItem(GUIDE_KEY, '1');
    const g = document.getElementById('wsGuide');
    if (g) g.remove();
  };

  // ─── GUIA RÁPIDO (modal) ───────────────────────────────────────────────────
  window.showWorkspaceGuide = function () {
    if (typeof showModal !== 'function') return;
    showModal({
      title: '💡 Como o PW OpsDesk funciona',
      body: `
        <div class="guide-modal-step"><div class="n">1</div><div><strong>Chamados chegam de dois lugares</strong><span>Abertos manualmente pela central (botão ＋) ou enviados automaticamente pelos aplicativos de campo do ecossistema PW.</span></div></div>
        <div class="guide-modal-step"><div class="n">2</div><div><strong>Cada chamado tem um relógio de SLA</strong><span>A prioridade (P1 a P5) define o prazo. Pendências legítimas, como aguardar acesso, congelam o relógio.</span></div></div>
        <div class="guide-modal-step"><div class="n">3</div><div><strong>O técnico atende e fecha com evidências</strong><span>Fotos, assinatura do cliente e laudo ficam anexados ao chamado, com código de causa e de fechamento.</span></div></div>
        <div class="guide-modal-step"><div class="n">4</div><div><strong>Tudo é auditado</strong><span>Cada ação entra numa trilha encadeada por SHA-256 no Cofre de Auditoria, e dá para verificar que nada foi adulterado.</span></div></div>
        <div class="guide-modal-step"><div class="n">5</div><div><strong>Quer ver isso acontecer?</strong><span>Abra a <strong>Ponte Certify</strong> no menu e simule um atendimento de campo: o chamado aparece e se atualiza ao vivo.</span></div></div>`,
      footer: `<button class="btn btn-secondary" onclick="closeModal && closeModal()">Fechar</button>
               <button class="btn btn-primary" onclick="closeModal && closeModal(); navigateTo('certify-bridge')">📡 Abrir Ponte Certify</button>`
    });
  };

  // ─── BOTÃO 💡 NA TOPBAR ────────────────────────────────────────────────────
  function injectGuideButton() {
    const actions = document.querySelector('.topbar-actions');
    if (!actions || document.getElementById('btnGuide')) return;
    const btn = document.createElement('button');
    btn.className = 'topbar-btn';
    btn.id = 'btnGuide';
    btn.title = 'Guia rápido';
    btn.textContent = '💡';
    btn.addEventListener('click', () => window.showWorkspaceGuide());
    actions.insertBefore(btn, actions.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectGuideButton);
  else injectGuideButton();
})();
