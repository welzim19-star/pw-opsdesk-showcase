/**
 * PW OpsDesk — Global Internationalization (i18n) Engine
 * Supported: 'pt' (Português - Brasil) | 'en' (English - US)
 */
(function() {
  'use strict';

  const DICTIONARY = {
    pt: {
      nav_main: 'Principal',
      nav_dashboard: 'Dashboard',
      nav_my_tickets: 'Meus Chamados',
      nav_incidents: 'Incidentes',
      nav_requests: 'Requisições',
      nav_management: 'Gestão',
      nav_problems: 'Problemas',
      nav_changes: 'Mudanças',
      nav_knowledge: 'Base de Conhecimento',
      nav_reports: 'Relatórios',
      nav_ecosystem: 'Ecossistema PW',
      nav_bridge: 'Ponte Certify',
      nav_governance: 'Governança & Auditoria',
      nav_audit_vault: 'Cofre de Auditoria',
      nav_logout: 'Sair do Sistema',

      topbar_search_ph: 'Buscar chamados, ID, cliente...',
      btn_new_ticket: '＋ Novo Chamado',
      btn_guide: '💡 Guia Operacional',
      lang_btn: '🇧🇷 PT',
      lang_title: 'Mudar para Inglês (Switch to English)',

      onboarding_title: '🧭 Comece por aqui:',
      onboarding_p1: 'Ver chamados críticos',
      onboarding_sim: 'Testar apps na Ponte Certify',
      onboarding_new: 'Abrir chamado de teste',
      onboarding_guide: 'Entenda como a central funciona',

      grp_urgent: '🔥 Atenção agora (prioridades e bloqueios)',
      grp_overview: '📊 Visão geral da operação',

      kpi_p1: 'Incidentes P1 Críticos',
      kpi_breached: 'SLA Violado',
      kpi_pending: 'Pendentes com Terceiros',
      kpi_open: 'Incidentes Abertos',
      kpi_req: 'Requisições de Serviço',
      kpi_resolved: 'Resolvidos Hoje',

      bridge_title: '📡 Ponte do Ecossistema PW',
      bridge_sub: 'Simulador dos aplicativos de campo enviando dados ao OpsDesk em tempo real',
      bridge_step1_title: 'App de campo envia',
      bridge_step1_sub: 'Técnico abre, atende e fecha a OS no celular',
      bridge_step2_title: 'OpsDesk recebe pela API',
      bridge_step2_sub: 'Mesmos canais de integração usados em produção',
      bridge_step3_title: 'Central acompanha ao vivo',
      bridge_step3_sub: 'Chamado, SLA, fotos e laudo atualizam via WebSocket',
      bridge_timeline_title: '⏱️ Linha do tempo ao vivo',
      bridge_request_title: '📨 Requisição enviada pelo app',
      bridge_btn_sim: '▶ Simular atendimento',
      bridge_btn_next: 'Próxima etapa',
      bridge_btn_auto: '⏩ Auto-executar',

      toast_lang_changed: 'Idioma alterado para Português (Brasil)'
    },
    en: {
      nav_main: 'Main',
      nav_dashboard: 'Dashboard',
      nav_my_tickets: 'My Tickets',
      nav_incidents: 'Incidents',
      nav_requests: 'Requests',
      nav_management: 'Management',
      nav_problems: 'Problems',
      nav_changes: 'Changes',
      nav_knowledge: 'Knowledge Base',
      nav_reports: 'Reports',
      nav_ecosystem: 'PW Ecosystem',
      nav_bridge: 'Certify Bridge',
      nav_governance: 'Governance & Audit',
      nav_audit_vault: 'Audit Vault',
      nav_logout: 'Sign Out',

      topbar_search_ph: 'Search tickets, ID, customer...',
      btn_new_ticket: '＋ New Ticket',
      btn_guide: '💡 Operational Guide',
      lang_btn: '🇺🇸 EN',
      lang_title: 'Switch to Portuguese (Mudar para Português)',

      onboarding_title: '🧭 Start here:',
      onboarding_p1: 'Review critical tickets',
      onboarding_sim: 'Test apps in Certify Bridge',
      onboarding_new: 'Open test ticket',
      onboarding_guide: 'Learn how OpsDesk works',

      grp_urgent: '🔥 Attention Now (critical priorities & blockers)',
      grp_overview: '📊 General Operations Overview',

      kpi_p1: 'Critical P1 Incidents',
      kpi_breached: 'Breached SLA',
      kpi_pending: 'Pending with Third-Parties',
      kpi_open: 'Open Incidents',
      kpi_req: 'Service Requests',
      kpi_resolved: 'Resolved Today',

      bridge_title: '📡 PW Ecosystem Bridge',
      bridge_sub: 'Interactive simulator streaming mobile field app events into OpsDesk in real-time',
      bridge_step1_title: 'Field App Dispatches',
      bridge_step1_sub: 'Technician opens, services, and signs off work orders',
      bridge_step2_title: 'OpsDesk Ingests via API',
      bridge_step2_sub: 'Exact enterprise integration transport used in production',
      bridge_step3_title: 'Command Desk Tracks Live',
      bridge_step3_sub: 'Tickets, SLA, evidence photos, and audit log update via WebSocket',
      bridge_timeline_title: '⏱️ Live Event Timeline',
      bridge_request_title: '📨 HTTP Request Dispatched by App',
      bridge_btn_sim: '▶ Simulate Service',
      bridge_btn_next: 'Next Step',
      bridge_btn_auto: '⏩ Auto-Run',

      toast_lang_changed: 'Language switched to English (US)'
    }
  };

  const OpsI18n = {
    current: localStorage.getItem('opsdesk_lang') || 'pt',

    getLang() {
      return this.current;
    },

    setLang(lang) {
      if (!DICTIONARY[lang]) return;
      this.current = lang;
      localStorage.setItem('opsdesk_lang', lang);
      this.apply();
      window.dispatchEvent(new CustomEvent('opsLangChanged', { detail: { lang } }));
    },

    toggle() {
      const next = this.current === 'pt' ? 'en' : 'pt';
      this.setLang(next);
      return next;
    },

    t(key, fallback = '') {
      const dict = DICTIONARY[this.current] || DICTIONARY.pt;
      return dict[key] !== undefined ? dict[key] : (fallback || key);
    },

    apply() {
      const dict = DICTIONARY[this.current] || DICTIONARY.pt;
      document.documentElement.setAttribute('lang', this.current === 'pt' ? 'pt-BR' : 'en');

      // Update text nodes with data-i18n
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
      });

      // Update placeholders
      document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        if (dict[key]) el.setAttribute('placeholder', dict[key]);
      });

      // Update titles
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key]) el.setAttribute('title', dict[key]);
      });

      // Update toggle button
      const btn = document.getElementById('btnLangToggle');
      if (btn) {
        btn.textContent = dict.lang_btn;
        btn.setAttribute('title', dict.lang_title);
      }
    }
  };

  window.OpsI18n = OpsI18n;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => OpsI18n.apply());
  } else {
    OpsI18n.apply();
  }
})();
