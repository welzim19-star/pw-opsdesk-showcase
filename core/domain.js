/**
 * PW OPSDESK — CORE DOMAIN v2.0 (CHERWELL SERVICE MANAGEMENT STANDARD)
 * Isolamento Galvânico Total: Zero dependência de HTTP/WebSocket/Storage neste módulo.
 * Implements: Incident Lifecycle, SLA Clock Stop com Pending Reasons, Journals por tipo.
 */

import { v4 as uuidv4 } from 'uuid';
import { telemetry } from './telemetry.js';

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export const TICKET_TYPE = {
    INCIDENT: 'INCIDENT',         // Algo quebrou / parou de funcionar
    SERVICE_REQUEST: 'SERVICE_REQUEST' // Pedido planejado / solicitação de serviço
};

export const STATUS = {
    NEW: 'NEW',
    ASSIGNED: 'ASSIGNED',
    IN_PROGRESS: 'IN_PROGRESS',
    PENDING: 'PENDING',
    RESOLVED: 'RESOLVED',
    CLOSED: 'CLOSED',
    REOPENED: 'REOPENED',
    CANCELLED: 'CANCELLED'
};

export const PRIORITY = {
    P1: { id: 'P1', label: 'P1 — Crítico',   color: '#ef4444', respMin: 60,   resMin: 240  },
    P2: { id: 'P2', label: 'P2 — Alto',       color: '#f97316', respMin: 120,  resMin: 480  },
    P3: { id: 'P3', label: 'P3 — Médio',      color: '#eab308', respMin: 240,  resMin: 1440 },
    P4: { id: 'P4', label: 'P4 — Baixo',      color: '#3b82f6', respMin: 480,  resMin: 2880 },
    P5: { id: 'P5', label: 'P5 — Planejado',  color: '#94a3b8', respMin: 1440, resMin: 7200 }
};

// ─── PENDING REASONS (CLOCK STOP SUBCATEGORIES) ───────────────────────────────
export const PENDING_REASONS = [
    { id: 'AGUARDANDO_USUARIO',   label: 'Aguardando Retorno do Usuário / Solicitante',     stopsTheClock: true  },
    { id: 'AGUARDANDO_CLIENTE',   label: 'Aguardando Aprovação do Cliente / Gestor',         stopsTheClock: true  },
    { id: 'AGUARDANDO_ACESSO',    label: 'Aguardando Liberação de Acesso Físico',             stopsTheClock: true  },
    { id: 'AGUARDANDO_PECA',      label: 'Aguardando Hardware / Peça de Reposição',           stopsTheClock: true  },
    { id: 'AGUARDANDO_TERCEIRO',  label: 'Aguardando Fornecedor / Empresa Externa',           stopsTheClock: true  },
    { id: 'AGUARDANDO_MUDANCA',   label: 'Aguardando Aprovação de Change (CAB)',              stopsTheClock: true  },
    { id: 'MPRJ_PENDENTE',        label: 'Pendente MPRJ — Aguardando Fiscal / Diretoria TI', stopsTheClock: true  },
    { id: 'AGENDADO',             label: 'Agendado para Data / Horário Específico',           stopsTheClock: true  },
    { id: 'MANUTENCAO_INTERNA',   label: 'Em Fila de Manutenção Interna (sem pausa de SLA)', stopsTheClock: false }
];

// ─── JOURNAL TYPES ────────────────────────────────────────────────────────────
export const JOURNAL_TYPE = {
    NOTE:             'NOTE',             // 📝 Nota manual do técnico
    CUSTOMER_CONTACT: 'CUSTOMER_CONTACT', // 📞 Contato registrado com o solicitante
    EMAIL:            'EMAIL',            // 📧 E-mail / comunicado externo
    HISTORY:          'HISTORY',          // 🔄 Mudança automática de campo
    SLM:              'SLM',              // ⏱️ Evento de SLA (pausa, breach, warning)
    ESCALATION:       'ESCALATION',       // 🔺 Escalação de nível
    SYSTEM:           'SYSTEM',           // 🤖 Evento automático do sistema
    RESOLUTION:       'RESOLUTION'        // 🏆 Registro de resolução/fechamento
};

// ─── CLOSE CODES & CAUSE CODES ───────────────────────────────────────────────
export const CLOSE_CODES = [
    { id: 'FCR',             label: 'Resolvido no Primeiro Contato (FCR)' },
    { id: 'WORKAROUND',      label: 'Contorno Temporário Aplicado' },
    { id: 'HW_REPLACEMENT',  label: 'Substituição / Troca de Hardware' },
    { id: 'RECONFIGURATION', label: 'Reconfiguração Lógica (Porta / VLAN / IP)' },
    { id: 'USER_TRAINING',   label: 'Orientação / Treinamento do Usuário' },
    { id: 'VENDOR_FIX',      label: 'Corrigido pelo Fornecedor / Fabricante' },
    { id: 'NO_FAULT_FOUND',  label: 'Não Reproduzível / Falso Positivo' },
    { id: 'DUPLICATE',       label: 'Duplicado — Vinculado ao Chamado Principal' },
    { id: 'CANCELLED',       label: 'Cancelado pelo Solicitante' },
    { id: 'RESOLVED_BY_CHANGE', label: 'Resolvido por Mudança (Change Request)' }
];

export const CAUSE_CODES = [
    { id: 'HW_FAILURE',       label: 'Falha de Hardware (Switch / Câmera / Fonte)' },
    { id: 'CABLE_UTP',        label: 'Cabo UTP / Patch Cord Rompido ou Danificado' },
    { id: 'CONNECTOR_RJ45',   label: 'Conector RJ45 / Fêmea Defeituoso' },
    { id: 'SWITCH_PORT',      label: 'Porta do Switch em Falha / Travada' },
    { id: 'FIBER_OPTIC',      label: 'Problema em Fibra Óptica (Atenuação / Fusão)' },
    { id: 'CFTV_CAMERA',      label: 'Câmera CFTV Desalinhada / Sem Sinal / Queimada' },
    { id: 'VLAN_MISCONFIG',   label: 'VLAN / Roteamento Desconfigurado' },
    { id: 'SOFTWARE_BUG',     label: 'Bug de Software / Aplicativo Instável' },
    { id: 'USER_ERROR',       label: 'Erro / Ação Indevida do Usuário' },
    { id: 'POWER_SUPPLY',     label: 'Falha de Alimentação / PoE / Nobreak' },
    { id: 'EXTERNAL_FAILURE', label: 'Falha de Infraestrutura Externa (Telecom / ISP)' },
    { id: 'UNKNOWN',          label: 'Causa Indeterminada (Detalhado nas Notas)' }
];

export const SERVICE_CATEGORIES = [
    {
        id: 'NETWORK', label: 'Redes & Conectividade',
        categories: [
            { id: 'STRUCTURED_CABLING', label: 'Cabeamento Estruturado', subcategories: ['Ponto de rede sem sinal','Cabo danificado','Conector defeituoso','Rack / Patch panel'] },
            { id: 'SWITCH_WIFI',        label: 'Switch / Wi-Fi / Roteamento',  subcategories: ['Porta do switch','VLAN / Roteamento','Wi-Fi sem sinal','Equipamento travado'] },
            { id: 'FIBER',              label: 'Fibra Óptica',                 subcategories: ['Fusão / Emenda','Atenuação alta','Conector óptico','Link de backbone'] }
        ]
    },
    {
        id: 'CCTV', label: 'Segurança Eletrônica & CFTV',
        categories: [
            { id: 'CAMERAS',   label: 'Câmeras CFTV',         subcategories: ['Câmera sem imagem','Câmera desalinhada','Câmera danificada','Foco / Lente'] },
            { id: 'NVR_DVR',   label: 'NVR / DVR / Gravação', subcategories: ['NVR offline','Disco sem espaço','Câmera offline no NVR','Configuração de canal'] },
            { id: 'CABLING_CCTV', label: 'Cabeamento CFTV',   subcategories: ['Cabo coaxial','Cabo UTP PoE câmera','Fonte de alimentação'] }
        ]
    },
    {
        id: 'HARDWARE', label: 'Hardware & Desktop',
        categories: [
            { id: 'COMPUTERS', label: 'Computadores / Notebooks', subcategories: ['Não liga','Tela com problema','Teclado / Mouse','HD / SSD'] },
            { id: 'PERIPHERALS', label: 'Periféricos',            subcategories: ['Impressora','Scanner','Monitor','Headset'] }
        ]
    },
    {
        id: 'SOFTWARE', label: 'Software & Sistemas',
        categories: [
            { id: 'OS',          label: 'Sistema Operacional',    subcategories: ['Lento / travando','Atualização com erro','Perfil corrompido','Acesso negado'] },
            { id: 'APPS',        label: 'Aplicativos / ERP',      subcategories: ['Erro ao abrir','Não salva dados','Lentidão','Acesso / Permissão'] }
        ]
    },
    {
        id: 'CERTIFICATION', label: 'Certificação & Auditoria',
        categories: [
            { id: 'CERT_NETWORK', label: 'Certificação de Rede',  subcategories: ['Certificar ponto Cat5e','Certificar ponto Cat6','Laudo de cabeamento','Emissão de relatório'] },
            { id: 'CERT_CCTV',   label: 'Auditoria CFTV',         subcategories: ['Levantamento de câmeras','Laudo de instalação','Relatório de cobertura'] }
        ]
    }
];

// ─── TICKET ENTITY ────────────────────────────────────────────────────────────

export class TicketEntity {
    constructor(props = {}) {
        telemetry.checkpoint('domain.js', 'TicketEntity.new', { id: props.id });
        const now = new Date();

        // Identificação
        this.id = props.id || ('INC-' + String(Date.now()).slice(-6));
        this.type = props.type || TICKET_TYPE.INCIDENT;
        this.title = props.title || '';
        this.description = props.description || '';

        // Categorização 3 níveis
        this.serviceGroup = props.serviceGroup || '';   // NETWORK, CCTV, etc.
        this.category    = props.category    || '';
        this.subcategory = props.subcategory || '';

        // Prioridade (Matriz Impacto × Urgência)
        this.impact  = Number(props.impact  ?? 2);
        this.urgency = Number(props.urgency ?? 2);
        const rawPrio = props.priority;
        this.priority = (typeof rawPrio === 'object' && rawPrio?.id) ? rawPrio.id : (rawPrio || this._calcPriority(this.impact, this.urgency));

        // Ciclo de vida
        this.status      = props.status      || STATUS.NEW;
        this.assignedTo  = props.assignedTo  || null;
        this.assignedTeam = props.assignedTeam || '';
        this.escalationGroup = props.escalationGroup || '';

        // Solicitante
        this.customer = {
            name:       props.customer?.name       || '',
            email:      props.customer?.email      || '',
            phone:      props.customer?.phone      || '',
            department: props.customer?.department || '',
            location:   props.customer?.location   || '',
            company:    props.customer?.company    || '',
            // Campos específicos MPRJ / Setor Público
            matricula:  props.customer?.matricula  || '',
            cargo:      props.customer?.cargo      || '',
            craai:      props.customer?.craai      || '',
            comarca:    props.customer?.comarca    || '',
            andar:      props.customer?.andar      || '',
            setor:      props.customer?.setor      || ''
        };

        // CMDB — Ativos Vinculados
        this.ciAssets = props.ciAssets || [];

        // Datas & SLA Engine
        this.createdAt  = props.createdAt  || now.toISOString();
        this.updatedAt  = props.updatedAt  || now.toISOString();
        const prio = PRIORITY[this.priority] || PRIORITY.P3;
        this.responseDeadline   = props.responseDeadline   || new Date(now.getTime() + prio.respMin * 60000).toISOString();
        this.resolutionDeadline = props.resolutionDeadline || new Date(now.getTime() + prio.resMin  * 60000).toISOString();
        this.respondedAt  = props.respondedAt  || null;
        this.resolvedAt   = props.resolvedAt   || null;
        this.closedAt     = props.closedAt     || null;
        this.autoCloseAt  = props.autoCloseAt  || null; // 72h após RESOLVED se não homologado

        // SLA Clock Stop State
        this.isPaused           = props.isPaused           || false;
        this.pauseReason        = props.pauseReason        || null; // ID do PENDING_REASON
        this.pausedAt           = props.pausedAt           || null;
        this.totalPausedMinutes = props.totalPausedMinutes || 0;
        this.pendingHistory     = props.pendingHistory     || []; // Histórico completo de pausas

        // Fechamento (Padrão Cherwell)
        this.resolution = props.resolution || {
            closeCode:     null,
            causeCode:     null,
            notes:         '',
            solvedBy:      null,
            solvedAt:      null,
            isFCR:         false,
            evidencePhotos: [],
            signature:     null,
            npsScore:      null
        };

        // Checklist de Campo (Quest)
        this.questChecklist = props.questChecklist || [
            { id: 'q1', text: 'Inspeção física e identificação do ativo / local', done: false },
            { id: 'q2', text: 'Diagnóstico técnico (link, sinal, teste de conexão)', done: false },
            { id: 'q3', text: 'Execução do reparo, reconfiguração ou substituição', done: false },
            { id: 'q4', text: 'Validação com usuário / teste de funcionamento', done: false },
            { id: 'q5', text: 'Registro fotográfico e coleta de assinatura digital', done: false }
        ];

        // Diários (Journals) — Linha do Tempo Imutável
        this.journals = props.journals || [];
        if (this.journals.length === 0) {
            this._addJournal(JOURNAL_TYPE.SYSTEM, 'Sistema OpsDesk',
                `Chamado spawnado. Tipo: ${this.type}. Prioridade calculada: ${this.priority}. SLA de resolução: ${prio.resMin} minutos.`
            );
        }

        // Flags
        this.isFCR   = props.isFCR   || false;
        this.tags    = props.tags    || [];
    }

    // ── PRIORIDADE ────────────────────────────────────────────────────────────
    _calcPriority(impact, urgency) {
        const s = impact + urgency;
        if (s <= 2) return 'P1';
        if (s === 3) return 'P2';
        if (s === 4) return 'P3';
        if (s === 5) return 'P4';
        return 'P5';
    }

    // ── JOURNALS ──────────────────────────────────────────────────────────────
    _addJournal(type, author, content, extra = {}) {
        const entry = {
            id:        uuidv4(),
            type,
            author,
            content,
            timestamp: new Date().toISOString(),
            ...extra
        };
        this.journals.push(entry);
        return entry;
    }

    addNote(author, text, isCustomerContact = false) {
        telemetry.checkpoint('domain.js', 'addNote', { author });
        this.updatedAt = new Date().toISOString();
        return this._addJournal(
            isCustomerContact ? JOURNAL_TYPE.CUSTOMER_CONTACT : JOURNAL_TYPE.NOTE,
            author, text
        );
    }

    _logFieldChange(author, field, oldVal, newVal) {
        return this._addJournal(JOURNAL_TYPE.HISTORY, author,
            `Campo alterado: [${field}] "${oldVal || '—'}" → "${newVal || '—'}"`
        );
    }

    // ── ONE-STEP ACTIONS ──────────────────────────────────────────────────────

    takeOwnership(operator, team) {
        telemetry.checkpoint('domain.js', 'takeOwnership', { operator });
        const prev = this.assignedTo;
        this.assignedTo   = operator;
        if (team) this.assignedTeam = team;
        if (this.status === STATUS.NEW) this.status = STATUS.ASSIGNED;
        if (!this.respondedAt) this.respondedAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this._logFieldChange(operator, 'Técnico Responsável', prev, operator);
        this._addJournal(JOURNAL_TYPE.SYSTEM, operator, `Técnico ${operator} assumiu a titularidade do chamado.`);
        return this;
    }

    startWork(operator) {
        telemetry.checkpoint('domain.js', 'startWork', { operator });
        if (this.isPaused) this.resumeSLA(operator);
        const prev = this.status;
        this.status    = STATUS.IN_PROGRESS;
        this.updatedAt = new Date().toISOString();
        this._logFieldChange(operator, 'Status', prev, STATUS.IN_PROGRESS);
        return this;
    }

    pauseSLA(operator, reasonId, scheduledDate = null) {
        telemetry.checkpoint('domain.js', 'pauseSLA', { reasonId });
        if (this.isPaused) return this;

        const reasonObj = PENDING_REASONS.find(r => r.id === reasonId);
        if (!reasonObj) throw new Error(`Motivo de pendência inválido: ${reasonId}`);

        const now = new Date().toISOString();
        this.isPaused    = true;
        this.pauseReason = reasonId;
        this.pausedAt    = now;
        this.status      = STATUS.PENDING;
        this.updatedAt   = now;

        const histEntry = {
            id: uuidv4(), reasonId, reasonLabel: reasonObj.label,
            stopsTheClock: reasonObj.stopsTheClock,
            pausedAt: now, resumedAt: null, durationMinutes: null,
            scheduledDate: scheduledDate || null, pausedBy: operator
        };
        this.pendingHistory.push(histEntry);

        this._addJournal(JOURNAL_TYPE.SLM, operator,
            `⏸️ SLA ${reasonObj.stopsTheClock ? 'CONGELADO' : 'EM ANDAMENTO'} — Pendência: "${reasonObj.label}"`,
            { reasonId, stopsTheClock: reasonObj.stopsTheClock }
        );
        this._logFieldChange(operator, 'Status', STATUS.IN_PROGRESS, STATUS.PENDING);
        return this;
    }

    resumeSLA(operator) {
        telemetry.checkpoint('domain.js', 'resumeSLA', { operator });
        if (!this.isPaused) return this;

        const now        = new Date();
        const nowIso     = now.toISOString();
        const lastEntry  = this.pendingHistory.findLast(p => !p.resumedAt);
        let compensatedMinutes = 0;

        if (lastEntry) {
            const pausedMs     = now.getTime() - new Date(lastEntry.pausedAt).getTime();
            const pausedMinutes = Math.max(0, Math.round(pausedMs / 60000));
            lastEntry.resumedAt       = nowIso;
            lastEntry.durationMinutes = pausedMinutes;

            if (lastEntry.stopsTheClock) {
                compensatedMinutes = pausedMinutes;
                this.totalPausedMinutes += compensatedMinutes;
                const currentDeadline = new Date(this.resolutionDeadline).getTime();
                this.resolutionDeadline = new Date(currentDeadline + compensatedMinutes * 60000).toISOString();
            }
        }

        this.isPaused    = false;
        this.pauseReason = null;
        this.pausedAt    = null;
        this.status      = STATUS.IN_PROGRESS;
        this.updatedAt   = nowIso;

        this._addJournal(JOURNAL_TYPE.SLM, operator,
            `▶️ SLA REATIVADO. Tempo compensado: ${compensatedMinutes} min. Total pausa acumulada: ${this.totalPausedMinutes} min.`
        );
        this._logFieldChange(operator, 'Status', STATUS.PENDING, STATUS.IN_PROGRESS);
        return this;
    }

    escalate(operator, targetGroup, reason) {
        telemetry.checkpoint('domain.js', 'escalate', { targetGroup });
        const prev = this.assignedTeam;
        this.escalationGroup = targetGroup;
        this.assignedTeam    = targetGroup;
        this.assignedTo      = null;
        this.updatedAt       = new Date().toISOString();
        this._addJournal(JOURNAL_TYPE.ESCALATION, operator,
            `🔺 Chamado escalado de [${prev}] para [${targetGroup}]. Motivo: ${reason || 'Não informado.'}`
        );
        this._logFieldChange(operator, 'Fila de Atendimento', prev, targetGroup);
        return this;
    }

    resolve(operator, resolutionData) {
        telemetry.checkpoint('domain.js', 'resolve', { operator });

        if (!resolutionData?.closeCode) throw new Error('VALIDATION_FAIL: Close Code é obrigatório para resolver o chamado.');
        if (!resolutionData?.causeCode) throw new Error('VALIDATION_FAIL: Causa Raiz (Cause Code) é obrigatória para resolver o chamado.');
        if (!resolutionData?.notes?.trim()) throw new Error('VALIDATION_FAIL: Laudo Técnico (notas de resolução) é obrigatório.');

        if (this.isPaused) this.resumeSLA(operator);

        const now = new Date().toISOString();
        this.status     = STATUS.RESOLVED;
        this.resolvedAt = now;
        this.updatedAt  = now;

        // Auto-close timer: 72h após resolved
        this.autoCloseAt = new Date(new Date().getTime() + 72 * 60 * 60000).toISOString();

        // FCR: resolvido sem histórico de reatribuição e sem pendências
        this.isFCR = (this.pendingHistory.length === 0) && (!this.escalationGroup);

        this.resolution = {
            closeCode:      resolutionData.closeCode,
            causeCode:      resolutionData.causeCode,
            notes:          resolutionData.notes,
            solvedBy:       operator,
            solvedAt:       now,
            isFCR:          this.isFCR,
            evidencePhotos: resolutionData.evidencePhotos || [],
            signature:      resolutionData.signature || null,
            npsScore:       resolutionData.npsScore || null
        };

        this._addJournal(JOURNAL_TYPE.RESOLUTION, operator,
            `🏆 CHAMADO RESOLVIDO.\nClose Code: [${resolutionData.closeCode}]\nCausa Raiz: [${resolutionData.causeCode}]\nFCR: ${this.isFCR ? 'Sim' : 'Não'}\n\nLaudo: ${resolutionData.notes}`,
            { closeCode: resolutionData.closeCode, causeCode: resolutionData.causeCode, isFCR: this.isFCR }
        );
        this._logFieldChange(operator, 'Status', STATUS.IN_PROGRESS, STATUS.RESOLVED);
        return this;
    }

    close(actor) {
        telemetry.checkpoint('domain.js', 'close', { actor });
        const now = new Date().toISOString();
        this.status   = STATUS.CLOSED;
        this.closedAt = now;
        this.updatedAt = now;
        this.autoCloseAt = null;
        this._addJournal(JOURNAL_TYPE.SYSTEM, actor, `Chamado homologado e FECHADO em definitivo pelo actor: ${actor}`);
        this._logFieldChange(actor, 'Status', STATUS.RESOLVED, STATUS.CLOSED);
        return this;
    }

    reopen(actor, reason) {
        telemetry.checkpoint('domain.js', 'reopen', { actor });
        const prev = this.status;
        this.status       = STATUS.REOPENED;
        this.resolvedAt   = null;
        this.closedAt     = null;
        this.autoCloseAt  = null;
        this.resolution   = { closeCode: null, causeCode: null, notes: '', solvedBy: null, solvedAt: null, isFCR: false, evidencePhotos: [], signature: null, npsScore: null };
        this.updatedAt    = new Date().toISOString();
        this._addJournal(JOURNAL_TYPE.SYSTEM, actor, `⚠️ CHAMADO REABERTO. Motivo: ${reason || 'Não informado.'}`);
        this._logFieldChange(actor, 'Status', prev, STATUS.REOPENED);
        return this;
    }

    cancel(actor, reason) {
        telemetry.checkpoint('domain.js', 'cancel', { actor });
        this.status    = STATUS.CANCELLED;
        this.updatedAt = new Date().toISOString();
        this._addJournal(JOURNAL_TYPE.SYSTEM, actor, `❌ Chamado CANCELADO. Motivo: ${reason || 'Não informado.'}`);
        return this;
    }

    toggleQuestItem(itemId) {
        const item = this.questChecklist.find(q => q.id === itemId);
        if (item) {
            item.done     = !item.done;
            this.updatedAt = new Date().toISOString();
        }
        return this;
    }

    addCIAsset(asset) {
        this.ciAssets.push({ id: uuidv4(), ...asset });
        this.updatedAt = new Date().toISOString();
        this._addJournal(JOURNAL_TYPE.SYSTEM, 'Sistema', `Ativo adicionado ao CMDB: ${asset.name || asset.type}`);
        return this;
    }

    // ── SLA SNAPSHOT (para API & Frontend) ───────────────────────────────────
    getSLASnapshot() {
        const now      = Date.now();
        const created  = new Date(this.createdAt).getTime();
        const resDl    = new Date(this.resolutionDeadline).getTime();
        const respDl   = new Date(this.responseDeadline).getTime();
        const total    = resDl - created;
        const diff     = resDl - now;

        const isTerminal = [STATUS.CLOSED, STATUS.RESOLVED, STATUS.CANCELLED].includes(this.status);
        if (isTerminal) {
            return { status: 'COMPLETED', percentUsed: 100, minutesRemaining: 0, isBreached: false, isPaused: false, formattedRemaining: 'CONCLUÍDO' };
        }
        if (this.isPaused) {
            const reasonObj = PENDING_REASONS.find(r => r.id === this.pauseReason);
            return { status: 'PAUSED', percentUsed: Math.round(((now - created) / total) * 100), minutesRemaining: Math.round(diff / 60000), isBreached: false, isPaused: true, formattedRemaining: `PAUSADO — ${reasonObj?.label || 'Pendente'}`, pauseReason: this.pauseReason };
        }

        const minutesRemaining = Math.round(diff / 60000);
        const percentUsed      = Math.min(100, Math.max(0, Math.round(((now - created) / total) * 100)));
        const isBreached       = diff < 0;
        let slaStatus = 'OK';
        if (isBreached) slaStatus = 'BREACHED';
        else if (percentUsed > 80) slaStatus = 'CRITICAL';
        else if (percentUsed > 50) slaStatus = 'WARNING';

        const absMin = Math.abs(minutesRemaining);
        const h = Math.floor(absMin / 60);
        const m = absMin % 60;
        const formatted = isBreached ? `-${h}h ${m}m (ESTOURADO)` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

        // Response SLA
        const respDiff = respDl - now;
        const respBreached = respDiff < 0;

        return { status: slaStatus, percentUsed, minutesRemaining, isBreached, isPaused: false, formattedRemaining: formatted, responseBreached: respBreached, respMinutesRemaining: Math.round(respDiff / 60000), totalPausedMinutes: this.totalPausedMinutes };
    }
}
