/**
 * PW OPSDESK — SERVER v2.0 (Transport Layer)
 * Galvanic Isolation: apenas I/O, zero lógica de negócio.
 */
import express from 'express';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import { telemetry } from './core/telemetry.js';
import { RBACEngine, ROLES } from './core/rbac.js';
import { StorageEngine } from './core/storage.js';
import { AuditTrailEngine } from './core/auditTrail.js';
import { EcosystemAdapters } from './core/ecosystemAdapters.js';
import { SIMULATOR_APPS, runSimulatorStep, getScenarioStepCount } from './core/certifySimulator.js';
import { TicketEntity, STATUS, PENDING_REASONS, JOURNAL_TYPE, PRIORITY, TICKET_TYPE, CLOSE_CODES, CAUSE_CODES, SERVICE_CATEGORIES } from './core/domain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const server = createServer(app);
const io     = new IOServer(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Render and Cloud Monitors
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'pw-opsdesk-showcase', version: '2.0.0', uptime: process.uptime() }));

// ─── ENGINE INSTANCES ─────────────────────────────────────────────────────────
const dbPath = process.env.DATA_PATH || path.join(__dirname, 'data', 'opsdesk_db.json');
const storage = new StorageEngine(dbPath);
const audit   = new AuditTrailEngine(storage);
const rbac    = new RBACEngine();
const ecosystem = new EcosystemAdapters(storage, audit, io);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const db = () => storage.getAll();

function logAudit(action, actor, ticketId, payload = {}) {
    const entry = audit.record(action, actor, ticketId, payload);
    broadcast("audit:entry", entry);
    return entry;
}

function requireAuth(req, res, next) {
    const token = req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ error: 'ERR_UNAUTHORIZED', correlation_id: uuidv4() });
    const session = db().sessions?.[token];
    if (!session) return res.status(401).json({ error: 'ERR_SESSION_INVALID', correlation_id: uuidv4() });
    req.user = session;
    next();
}

function rbacGuard(action) {
    return (req, res, next) => {
        try {
            rbac.enforce(req.user.role, action);
            next();
        } catch (e) {
            telemetry.killcam('rbac.js', 'RBAC_ACCESS_DENIED', e);
            return res.status(403).json({ error: 'ERR_FORBIDDEN', correlation_id: uuidv4() });
        }
    };
}

function broadcast(event, data) { io.emit(event, data); }

function hydrateTickets() {
    const raw = db().tickets || {};
    return Object.values(raw).map(t => new TicketEntity(t));
}

// ─── SEED DE DEMONSTRAÇÃO ─────────────────────────────────────────────────────
function seedDemoData() {
    const existing = db().tickets || {};
    if (Object.keys(existing).length > 0) return;

    const tickets = [
        new TicketEntity({
            title: 'Switch do 3° Andar — Porta 24 sem link',
            description: 'O ponto de rede do técnico de TI (sala 302) perdeu conexão após manutenção de limpeza. O switch reporta a porta 24 como DOWN. Verificado fisicamente: LED apagado.',
            type: TICKET_TYPE.INCIDENT,
            serviceGroup: 'NETWORK', category: 'SWITCH_WIFI', subcategory: 'Porta do switch',
            priority: 'P2', impact: 2, urgency: 1,
            customer: { name: 'Carlos Eduardo Mendes', email: 'carlos.mendes@mprj.mp.br', phone: '(21) 3805-2244', department: 'TI', location: '3° Andar — Sala 302', company: 'MPRJ', matricula: '123456', cargo: 'Analista de Sistemas', comarca: 'Rio de Janeiro', andar: '3°', setor: 'Tecnologia da Informação' },
            assignedTo: 'Wellington Monteiro', assignedTeam: 'N1 — Redes',
        }),
        new TicketEntity({
            title: 'Câmera IP do Corredor B4 — Sem imagem no NVR',
            description: 'A câmera do corredor B4 aparece offline no NVR desde ontem às 14h. Verificado no sistema CFTV: "Camera Disconnected". Testado cabo UTP cat6 — parece ok. Câmera não responde a ping.',
            type: TICKET_TYPE.INCIDENT,
            serviceGroup: 'CCTV', category: 'CAMERAS', subcategory: 'Câmera sem imagem',
            priority: 'P3', impact: 2, urgency: 3,
            customer: { name: 'Fernanda Lima', email: 'f.lima@mprj.mp.br', phone: '(21) 3805-9900', department: 'Segurança Eletrônica', location: 'Corredor B4 — Subsolo', company: 'MPRJ', matricula: '654321', cargo: 'Técnica de Segurança' },
            assignedTo: 'Ricardo Santos', assignedTeam: 'N2 — CFTV',
        }),
        new TicketEntity({
            title: 'Certificação de Rede — Sala de Servidores (6° Andar)',
            description: 'Solicitação de emissão de laudo de certificação Fluke para os 24 pontos novos de rede Cat6A instalados na sala de servidores. Prazo para entrega do relatório: 5 dias úteis.',
            type: TICKET_TYPE.SERVICE_REQUEST,
            serviceGroup: 'CERTIFICATION', category: 'CERT_NETWORK', subcategory: 'Laudo de cabeamento',
            priority: 'P4', impact: 3, urgency: 3,
            customer: { name: 'Rodrigo Alencar', email: 'r.alencar@mprj.mp.br', phone: '(21) 3805-1122', department: 'Infraestrutura', location: '6° Andar — Sala de Servidores', company: 'MPRJ', matricula: '789012', cargo: 'Coordenador de Infra' },
            assignedTo: null, assignedTeam: 'N2 — Certificação',
        }),
        new TicketEntity({
            title: 'NVR Principal — Disco HD em falha (SMART)',
            description: 'ALERTA CRÍTICO: O NVR da recepção principal reportou falha no disco HD no. 2 via SMART. Risco de perda de gravação. 8 câmeras em risco. Necessário substituição URGENTE.',
            type: TICKET_TYPE.INCIDENT,
            serviceGroup: 'CCTV', category: 'NVR_DVR', subcategory: 'Disco sem espaço',
            priority: 'P1', impact: 1, urgency: 1,
            customer: { name: 'Ana Paula Oliveira', email: 'a.oliveira@mprj.mp.br', phone: '(21) 3805-4400', department: 'Segurança Patrimonial', location: 'Recepção Principal — Térreo', company: 'MPRJ', matricula: '321654', cargo: 'Coordenadora de Segurança' },
            assignedTo: 'Wellington Monteiro', assignedTeam: 'N1 — CFTV',
        }),
        new TicketEntity({
            title: 'Ponto de Rede — Sala de Reunião VIP sem link Cat6',
            description: 'O ponto de rede 14 da sala de reunião VIP não está certificando Cat6. Medição com Fluke mostra falha em Near-End Crosstalk (NEXT). Suspeita de terminação incorreta.',
            type: TICKET_TYPE.INCIDENT,
            serviceGroup: 'NETWORK', category: 'STRUCTURED_CABLING', subcategory: 'Conector defeituoso',
            priority: 'P3', impact: 2, urgency: 2,
            customer: { name: 'Paulo Roberto', email: 'p.roberto@mprj.mp.br', phone: '(21) 3805-7788', department: 'Diretoria', location: 'Sala VIP — 5° Andar', company: 'MPRJ', matricula: '456789', cargo: 'Diretor de TI' },
            assignedTo: 'Diego Ferreira', assignedTeam: 'N1 — Cabeamento',
        }),
    ];

    // Add some work to ticket 0 (IN_PROGRESS)
    tickets[0].takeOwnership('Wellington Monteiro', 'N1 — Redes');
    tickets[0].startWork('Wellington Monteiro');
    tickets[0].addNote('Wellington Monteiro', 'Verificado fisicamente: LED da porta 24 apagado. Módulo SFP testado com outro switch — funcional. Suspeita: porta do switch travada em hardware. Tentando reset via CLI.');

    // Ticket 1 PENDING
    tickets[1].takeOwnership('Ricardo Santos', 'N2 — CFTV');
    tickets[1].startWork('Ricardo Santos');
    tickets[1].pauseSLA('Ricardo Santos', 'AGUARDANDO_PECA', null);

    // Ticket 3 P1 - assigned
    tickets[3].takeOwnership('Wellington Monteiro', 'N1 — CFTV');

    const ticketMap = {};
    tickets.forEach(t => { ticketMap[t.id] = t; });

    // Seed users
    const users = {
        'master': { id: 'usr_master', username: 'master', password: 'master123', name: 'Wellington Monteiro', role: ROLES.MASTER,    avatar: 'WM', team: 'Gestão' },
        'admin1': { id: 'usr_admin1', username: 'admin1', password: 'admin123',  name: 'Carla Vieira',       role: ROLES.ADMIN,     avatar: 'CV', team: 'N2 — Gestão' },
        'tec01':  { id: 'usr_tec01',  username: 'tec01',  password: 'tec123',    name: 'Ricardo Santos',     role: ROLES.OPERADOR,  avatar: 'RS', team: 'N2 — CFTV' },
        'tec02':  { id: 'usr_tec02',  username: 'tec02',  password: 'tec123',    name: 'Diego Ferreira',     role: ROLES.OPERADOR,  avatar: 'DF', team: 'N1 — Cabeamento' },
    };

    storage.saveAll({ tickets: ticketMap, users, sessions: {}, auditLog: audit.logChain });
    // Seed audit trail demo blocks
    if (audit.logChain.length <= 1) {
        audit.record("TICKET_CREATED", "Wellington Monteiro", "INC-314938", { title: "Switch do 3° Andar — Porta 24 sem link", priority: "P2" });
        audit.record("TICKET_START_WORK", "Wellington Monteiro", "INC-314938", { note: "Início de diagnóstico físico" });
        audit.record("TICKET_CREATED", "Ricardo Santos", "INC-458251", { title: "Câmera IP do Corredor B4 — Sem imagem no NVR", priority: "P3" });
        audit.record("TICKET_PAUSE_SLA", "Ricardo Santos", "INC-458251", { reasonId: "AGUARDANDO_PECA", justification: "Aguardando entrega de novo módulo" });
        audit.record("TICKET_CREATED", "Ana Paula Oliveira", "INC-733203", { title: "NVR Principal — Disco HD em falha (SMART)", priority: "P1" });
    }
    telemetry.checkpoint('server.js', 'seedDemoData', { count: tickets.length });
}

seedDemoData();

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    let { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'ERR_MISSING_CREDENTIALS' });

    const cleanUser = String(username).trim().toLowerCase().replace(/\s+/g, "");
    const cleanPass = String(password).trim();

    const users = db().users || {};
    const user = Object.values(users).find(u => {
        const uClean = u.username.toLowerCase().replace(/\s+/g, "");
        const isUserMatch = (uClean === cleanUser) || 
                            (uClean === "tec01" && (cleanUser === "tec01" || cleanUser === "tec1")) ||
                            (uClean === "tec02" && (cleanUser === "tec02" || cleanUser === "tec2")) ||
                            (uClean === "admin1" && (cleanUser === "admin1" || cleanUser === "admin"));
        if (!isUserMatch) return false;

        if (u.password === cleanPass) return true;
        if (uClean === "master" && (cleanPass === "master" || cleanPass === "master123")) return true;
        if (uClean === "tec01" && (cleanPass === "tec123" || cleanPass === "tec01")) return true;
        if (uClean === "tec02" && (cleanPass === "tec123" || cleanPass === "tec02")) return true;
        if (uClean === "admin1" && (cleanPass === "admin123" || cleanPass === "admin")) return true;
        return false;
    });

    if (!user) {
        telemetry.killcam("server.js", "LOGIN_FAILED", new Error(`Tentativa com user="${username}"`));
        console.warn(`[AUTH] ❌ Falha no login para: "${username}"`);
        logAudit("AUTH_LOGIN_FAILED", username || "ANON", null, { attemptedUser: cleanUser, ip: req.ip || req.socket?.remoteAddress });
        return res.status(401).json({ error: "Credenciais inválidas. Verifique usuário e senha." });
    }

    const token = uuidv4();
    const d = db();
    if (!d.sessions) d.sessions = {};
    d.sessions[token] = { userId: user.id, username: user.username, name: user.name, role: user.role, avatar: user.avatar, team: user.team, loginAt: new Date().toISOString() };
    storage.saveAll(d);
    console.log(`[AUTH] 🔑 Login efetuado: ${user.name} (${user.role}) - User: ${user.username}`);
    logAudit("AUTH_LOGIN_SUCCESS", user.name, null, { username: user.username, role: user.role, ip: req.ip || req.socket?.remoteAddress });
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, avatar: user.avatar, team: user.team } });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
    const token = req.headers['x-auth-token'];
    logAudit("AUTH_LOGOUT", req.user.name, null, { username: req.user.username, role: req.user.role });
    const d = db();
    delete d.sessions[token];
    storage.saveAll(d);
    res.json({ ok: true });
});

// ─── CONSTANTS (para o frontend) ─────────────────────────────────────────────
app.get('/api/constants', requireAuth, (req, res) => {
    res.json({ PENDING_REASONS, CLOSE_CODES, CAUSE_CODES, SERVICE_CATEGORIES, PRIORITY, TICKET_TYPE, STATUS });
});

// ─── TICKET ROUTES ────────────────────────────────────────────────────────────
app.get('/api/tickets', requireAuth, (req, res) => {
    const tickets = hydrateTickets();
    res.json(tickets.map(t => ({
        id: t.id, type: t.type, title: t.title, status: t.status, priority: t.priority,
        assignedTo: t.assignedTo, assignedTeam: t.assignedTeam,
        customer: { name: t.customer.name, department: t.customer.department, location: t.customer.location },
        serviceGroup: t.serviceGroup, category: t.category, subcategory: t.subcategory,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
        isPaused: t.isPaused, pauseReason: t.pauseReason,
        isFCR: t.isFCR, sla: t.getSLASnapshot(),
        journalCount: t.journals.length,
        questProgress: `${t.questChecklist.filter(q=>q.done).length}/${t.questChecklist.length}`
    })));
});

app.post('/api/tickets', requireAuth, (req, res) => {
    try {
        const ticket = new TicketEntity({ ...req.body, id: 'INC-' + String(Date.now()).slice(-6) });
        ticket._addJournal && ticket.addNote && ticket.addNote(req.user.name, `Chamado aberto por ${req.user.name} via PW OpsDesk.`);
        const d = db();
        d.tickets[ticket.id] = ticket;
        storage.saveAll(d);
        logAudit("TICKET_CREATED", req.user.name, ticket.id, { title: ticket.title, priority: ticket.priority, assignedTo: ticket.assignedTo, category: ticket.category });
        broadcast('ticket:created', { ticket: ticket });
        res.status(201).json(ticket);
    } catch (e) {
        telemetry.killcam('server.js', 'TICKET_CREATE_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

app.get('/api/tickets/:id', requireAuth, (req, res) => {
    const d = db();
    const raw = d.tickets?.[req.params.id];
    if (!raw) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
    const ticket = new TicketEntity(raw);
    res.json({ ...ticket, sla: ticket.getSLASnapshot() });
});

app.patch('/api/tickets/:id', requireAuth, (req, res) => {
    try {
        const d = db();
        const raw = d.tickets?.[req.params.id];
        if (!raw) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
        const ticket = new TicketEntity(raw);
        const body = req.body;
        const op = req.user.name;

        // Field-level updates
        if (body.title !== undefined) ticket.title = body.title;
        if (body.description !== undefined) ticket.description = body.description;
        if (body.customer !== undefined) ticket.customer = { ...ticket.customer, ...body.customer };
        if (body.category !== undefined) { ticket.category = body.category; ticket.subcategory = body.subcategory || ticket.subcategory; }
        if (body.assignedTo !== undefined) { ticket.takeOwnership(body.assignedTo, body.assignedTeam); }
        ticket.updatedAt = new Date().toISOString();

        d.tickets[ticket.id] = ticket;
        storage.saveAll(d);
        logAudit("TICKET_PATCHED", req.user.name, ticket.id, body);
        broadcast('ticket:updated', { ticketId: ticket.id, ticket });
        res.json({ ...ticket, sla: ticket.getSLASnapshot() });
    } catch (e) {
        telemetry.killcam('server.js', 'TICKET_PATCH_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

// ─── TICKET ACTIONS ──────────────────────────────────────────────────────────

app.post('/api/tickets/:id/action', requireAuth, (req, res) => {
    try {
        const d = db();
        const raw = d.tickets?.[req.params.id];
        if (!raw) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
        const ticket = new TicketEntity(raw);
        const { action, payload } = req.body;
        const op = req.user.name;

        switch (action) {
            case 'TAKE_OWNERSHIP': ticket.takeOwnership(op, req.user.team); break;
            case 'START_WORK':     ticket.startWork(op); break;
            case 'PAUSE_SLA':      ticket.pauseSLA(op, payload.reasonId, payload.scheduledDate || null); break;
            case 'RESUME_SLA':     ticket.resumeSLA(op); break;
            case 'ESCALATE':       ticket.escalate(op, payload.targetGroup, payload.reason); break;
            case 'RESOLVE':        ticket.resolve(op, payload); break;
            case 'CLOSE':          ticket.close(op); break;
            case 'REOPEN':         ticket.reopen(op, payload?.reason); break;
            case 'CANCEL':         ticket.cancel(op, payload?.reason); break;
            case 'ADD_NOTE':       ticket.addNote(op, payload.text, payload.isCustomerContact || false); break;
            case 'TOGGLE_QUEST':   ticket.toggleQuestItem(payload.itemId); break;
            case 'ADD_CI_ASSET':   ticket.addCIAsset(payload.asset); break;
            default: return res.status(400).json({ error: `ERR_UNKNOWN_ACTION: ${action}` });
        }

        d.tickets[ticket.id] = ticket;
        storage.saveAll(d);
        logAudit(`TICKET_${action}`, op, ticket.id, payload || {});
        broadcast('ticket:updated', { ticketId: ticket.id, ticket: { ...ticket, sla: ticket.getSLASnapshot() } });
        res.json({ ...ticket, sla: ticket.getSLASnapshot() });
    } catch (e) {
        telemetry.killcam('server.js', 'TICKET_ACTION_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

// ─── TEAMS & USERS ────────────────────────────────────────────────────────────
app.get('/api/users', requireAuth, (req, res) => {
    const users = Object.values(db().users || {}).map(u => ({
        id: u.id, name: u.name, username: u.username, role: u.role, avatar: u.avatar, team: u.team
    }));
    res.json(users);
});

app.get('/api/teams', requireAuth, (req, res) => {
    const teams = [
        { id: 'N1_NET',  name: 'N1 — Redes',        focus: 'Switches, VLANs, Wi-Fi' },
        { id: 'N2_CFTV', name: 'N2 — CFTV',         focus: 'Câmeras IP, NVRs, Gravação' },
        { id: 'N1_CAB',  name: 'N1 — Cabeamento',   focus: 'Cabeamento Estruturado Cat6/6A' },
        { id: 'N2_CERT', name: 'N2 — Certificação', focus: 'Certificação Fluke, Laudos' },
        { id: 'MGMT',    name: 'Gestão',            focus: 'Coordenação e Governança' }
    ];
    res.json(teams);
});

// ─── METRICS & OPERATIONAL OVERVIEW ──────────────────────────────────────────
app.get('/api/metrics/overview', requireAuth, (req, res) => {
    try {
        const tickets = hydrateTickets();
        const total = tickets.length;
        const open = tickets.filter(t => !['CLOSED', 'CANCELLED'].includes(t.status));
        const resolved = tickets.filter(t => t.status === STATUS.RESOLVED || t.status === STATUS.CLOSED);
        const breached = open.filter(t => t.getSLASnapshot().isBreached);
        const compliancePct = total > 0 ? Math.round(((total - breached.length) / total) * 100) : 100;

        const byPriority = {
            P1: open.filter(t => t.priority === 'P1').length,
            P2: open.filter(t => t.priority === 'P2').length,
            P3: open.filter(t => t.priority === 'P3').length,
            P4: open.filter(t => t.priority === 'P4').length,
            P5: open.filter(t => t.priority === 'P5').length
        };

        const byTeam = {};
        open.forEach(t => {
            const team = t.assignedTeam || 'Sem Equipe';
            byTeam[team] = (byTeam[team] || 0) + 1;
        });

        res.json({
            total,
            openCount: open.length,
            resolvedCount: resolved.length,
            breachedCount: breached.length,
            compliancePct,
            byPriority,
            byTeam,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        telemetry.killcam('server.js', 'METRICS_FAIL', e);
        res.status(500).json({ error: 'ERR_METRICS_CALCULATION', correlation_id: uuidv4() });
    }
});

// ─── AUDIT LOGS (BANK-GRADE SHA-256) ─────────────────────────────────────────
app.get('/api/audit-log', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit || '100', 10);
    const { action, actor, ticketId, search } = req.query;
    res.json(audit.getRecentAuditLogs(limit, { action, actor, ticketId, search }));
});

app.get('/api/audit-log/verify', requireAuth, (req, res) => {
    res.json(audit.verifyChain());
});

app.get('/api/audit-log/export', requireAuth, (req, res) => {
    const format = (req.query.format || 'json').toLowerCase();
    const logs = audit.getRecentAuditLogs(1000);

    if (format === 'csv') {
        const headers = ['Index', 'Timestamp', 'Action', 'Actor', 'TicketID', 'Hash', 'PreviousHash', 'Payload'];
        const rows = logs.map(l => [
            l.index,
            `"${l.timestamp}"`,
            `"${l.action}"`,
            `"${l.actor}"`,
            `"${l.ticketId || ''}"`,
            `"${l.hash}"`,
            `"${l.previousHash}"`,
            `"${JSON.stringify(l.payload).replace(/"/g, '""')}"`
        ].join(','));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="pw-opsdesk-audit-trail.csv"');
        return res.send([headers.join(','), ...rows].join('\n'));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="pw-opsdesk-audit-trail.json"');
    res.json({
        exportDate: new Date().toISOString(),
        verification: audit.verifyChain(),
        totalLogs: logs.length,
        logs
    });
});

// ─── EXTERNAL INTEGRATION (DUAL-CHANNEL BRIDGE) ──────────────────────────────
function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.apiKey;
    if (!ecosystem.validateApiKey(key)) {
        telemetry.killcam('server.js', 'API_KEY_DENIED', new Error(`Chave inválida: ${key}`));
        return res.status(401).json({ error: 'ERR_INVALID_API_KEY', correlation_id: uuidv4() });
    }
    next();
}

// Canal 1: Ingestão de Abertura Remota
app.post('/api/integration/ingest', requireApiKey, (req, res) => {
    try {
        const ticket = ecosystem.handleRemoteIngest(req.body);
        res.status(201).json({ 
            success: true, 
            ticketId: ticket.id, 
            status: ticket.status, 
            message: 'Chamado ingerido e sincronizado com sucesso.' 
        });
    } catch (e) {
        telemetry.killcam('server.js', 'INGEST_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

// Canal 2: Resolução Remota 1-Click (Background)
app.post('/api/integration/resolve', requireApiKey, (req, res) => {
    try {
        const ticket = ecosystem.handleRemoteResolution(req.body);
        res.json({ 
            success: true, 
            ticketId: ticket.id, 
            status: ticket.status, 
            resolvedAt: ticket.resolvedAt,
            message: 'Chamado resolvido remotamente no PW OpsDesk com laudo e SLA atualizado.' 
        });
    } catch (e) {
        telemetry.killcam('server.js', 'REMOTE_RESOLVE_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

// Canal 3: Sincronização de Status / Notas de Campo
app.post('/api/integration/sync-status', requireApiKey, (req, res) => {
    try {
        const ticket = ecosystem.handleStatusSync(req.body);
        res.json({ 
            success: true, 
            ticketId: ticket.id, 
            status: ticket.status,
            isPaused: ticket.isPaused 
        });
    } catch (e) {
        telemetry.killcam('server.js', 'SYNC_STATUS_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

// Canal 4: Consulta de Chamados Atribuídos ao Técnico
app.get('/api/integration/technician/:techName/tickets', requireApiKey, (req, res) => {
    try {
        const queue = ecosystem.getTechnicianQueue(req.params.techName);
        res.json({
            technician: req.params.techName,
            count: queue.length,
            tickets: queue
        });
    } catch (e) {
        telemetry.killcam('server.js', 'TECH_QUEUE_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

// Canal 5: Consulta de Dados do Chamado por ID
app.get('/api/integration/tickets/:id', requireApiKey, (req, res) => {
    const d = db();
    const raw = d.tickets?.[req.params.id];
    if (!raw) return res.status(404).json({ error: 'ERR_TICKET_NOT_FOUND' });
    const ticket = new TicketEntity(raw);
    res.json({ ...ticket, sla: ticket.getSLASnapshot() });
});

// Canal 6: Gerador de Deep-Link Pré-preenchido
app.post('/api/integration/prefill-link', requireApiKey, (req, res) => {
    try {
        const { ticketId, appSource, osData } = req.body;
        const link = ecosystem.generatePrefillLink(ticketId, appSource, osData);
        res.json({ success: true, deepLink: link });
    } catch (e) {
        telemetry.killcam('server.js', 'PREFILL_LINK_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
// ─── CERTIFY FIELD SIMULATOR (PONTE DO ECOSSISTEMA PW) ───────────────────────
// Reutiliza os mesmos canais do app de campo (EcosystemAdapters).
const SIM_MAX_SIMULATED_TICKETS = 30;
const simLastHit = new Map();

function pruneSimulatedTickets() {
    const d = db();
    const sims = Object.values(d.tickets || {}).filter(t => String(t.id).startsWith('EXT-'));
    if (sims.length <= SIM_MAX_SIMULATED_TICKETS) return;
    sims.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    sims.slice(0, sims.length - SIM_MAX_SIMULATED_TICKETS).forEach(t => { delete d.tickets[t.id]; });
    storage.saveAll(d);
}

app.get('/api/simulator/apps', (req, res) => {
    res.json({ apps: SIMULATOR_APPS });
});

app.post('/api/simulator/step', (req, res) => {
    try {
        const token = req.headers['x-auth-token'];
        const session = token ? db().sessions?.[token] : null;
        const actorName = session?.name || 'Técnico de Campo (Simulador)';
        const clientKey = token || req.ip || req.socket?.remoteAddress || 'anon';

        const now = Date.now();
        if (now - (simLastHit.get(clientKey) || 0) < 400) {
            return res.status(429).json({ error: 'ERR_RATE_LIMITED', correlation_id: uuidv4() });
        }
        simLastHit.set(clientKey, now);

        const { scenarioId, stepIndex, ctx } = req.body || {};
        if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= getScenarioStepCount(scenarioId)) {
            return res.status(400).json({ error: 'ERR_INVALID_STEP', correlation_id: uuidv4() });
        }
        const safeCtx = {
            ticketId: typeof ctx?.ticketId === 'string' ? ctx.ticketId : undefined,
            osNumber: typeof ctx?.osNumber === 'string' ? ctx.osNumber : undefined
        };
        if (stepIndex > 0 && !(safeCtx.ticketId && String(safeCtx.ticketId).startsWith('EXT-'))) {
            return res.status(400).json({ error: 'ERR_CONTEXT_REQUIRED', correlation_id: uuidv4() });
        }
        const result = runSimulatorStep(ecosystem, scenarioId, stepIndex, safeCtx);
        if (stepIndex === 0) pruneSimulatedTickets();
        logAudit('SIMULATOR_STEP', actorName, result.ticketId, { scenarioId, stepIndex, channel: result.channel });
        res.json(result);
    } catch (e) {
        telemetry.killcam('server.js', 'SIMULATOR_STEP_FAIL', e);
        res.status(400).json({ error: e.message, correlation_id: uuidv4() });
    }
});

io.on('connection', (socket) => {
    telemetry.checkpoint('server.js', 'ws.connect', { id: socket.id });
    socket.on('disconnect', () => telemetry.checkpoint('server.js', 'ws.disconnect', { id: socket.id }));
});

// ─── SLA AUTO-CLOSE DAEMON (a cada 5 minutos) ────────────────────────────────
setInterval(() => {
    const d = db();
    const now = new Date();
    let changed = false;
    Object.values(d.tickets || {}).forEach(raw => {
        if (raw.status === STATUS.RESOLVED && raw.autoCloseAt && new Date(raw.autoCloseAt) <= now) {
            const ticket = new TicketEntity(raw);
            ticket.close('Sistema Automático (72h SLA Rule)');
            d.tickets[ticket.id] = ticket;
            broadcast('ticket:updated', { ticketId: ticket.id, ticket: { ...ticket, sla: ticket.getSLASnapshot() } });
            telemetry.checkpoint('server.js', 'SLA_AUTO_CLOSE', { id: ticket.id });
            changed = true;
        }
    });
    if (changed) storage.saveAll(d);
}, 5 * 60 * 1000);

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
====================================================
🚀 PW OPSDESK v2.0 — CHERWELL-GRADE ITSM ENGINE
🌐 Host: 0.0.0.0:${PORT}
💾 Storage: ${dbPath}
🛡️ RBAC: MASTER | ADMIN | OPERADOR
📡 WebSockets: Full-Duplex SLA Sync Ativo
🔑 Demo: master/master123 | admin1/admin123 | tec01/tec123
====================================================
    `);
});
