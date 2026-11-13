/**
 * PW OPSDESK — ECOSYSTEM ADAPTERS v2.1 (DUAL-CHANNEL INTEGRATION BRIDGE)
 * Galvanic Isolation: Ports & Adapters Architecture
 * 
 * Conecta e sincroniza em tempo real com o ecossistema PW:
 * 1. PW Resolve IT (OS Campo MPRJ / Assinaturas / Fotos / Laudos)
 * 2. PW Certify Enterprise (Switches / CFTV Câmeras / Racks / Fluke)
 * 3. Certify PW System (Centauro Seguradora / Getel Telecom)
 */

import { v4 as uuidv4 } from "uuid";
import { telemetry } from "./telemetry.js";
import { 
    TicketEntity, 
    STATUS, 
    PRIORITY, 
    TICKET_TYPE, 
    CLOSE_CODES, 
    CAUSE_CODES, 
    JOURNAL_TYPE 
} from "./domain.js";

export const API_KEY_DEFAULT = "PW-INTEGRATION-KEY-2025";

export const SUPPORTED_APPS = {
    PW_RESOLVE_IT: {
        name: "PW Resolve IT",
        serviceGroup: "FIELD_SERVICE_MPRJ",
        defaultCategory: "Suporte de Campo MPRJ"
    },
    PW_CERTIFY_ENTERPRISE: {
        name: "PW Certify Enterprise",
        serviceGroup: "CERTIFICATION",
        defaultCategory: "Certificação de Redes / CFTV"
    },
    CERTIFY_PW_SYSTEM: {
        name: "Certify PW System (Centauro / Getel)",
        serviceGroup: "TELECOM_AUDIT",
        defaultCategory: "Auditoria de Telecom & Infraestrutura"
    }
};

export class EcosystemAdapters {
    constructor(storage, auditTrail, io) {
        this.storage = storage;
        this.auditTrail = auditTrail;
        this.io = io;
    }

    validateApiKey(providedKey) {
        return providedKey && (providedKey === API_KEY_DEFAULT || providedKey === process.env.PW_INTEGRATION_KEY);
    }

    /**
     * CANAL 1: Ingestão de Abertura Remota
     * Cria um novo chamado no PW OpsDesk disparado por um dos aplicativos PW.
     */
    handleRemoteIngest(payload) {
        telemetry.checkpoint("ecosystemAdapters.js", "handleRemoteIngest", { 
            appSource: payload.appSource,
            title: payload.title 
        });

        const appMeta = SUPPORTED_APPS[payload.appSource] || {
            name: payload.appSource || "App Externo PW",
            serviceGroup: "GENERAL",
            defaultCategory: "Geral"
        };

        const id = "EXT-" + String(Date.now()).slice(-6);
        const ticket = new TicketEntity({
            id,
            title: payload.title || `[${appMeta.name}] OS #${payload.osNumber || "S/N"}`,
            description: payload.description || payload.workNotes || "Chamado integrado via aplicativo de campo PW.",
            type: payload.type || TICKET_TYPE.INCIDENT,
            serviceGroup: payload.serviceGroup || appMeta.serviceGroup,
            category: payload.category || appMeta.defaultCategory,
            subcategory: payload.subcategory || "Atendimento Externo",
            priority: payload.priority || PRIORITY.P3,
            impact: payload.impact || 2,
            urgency: payload.urgency || 2,
            customer: payload.customer || {
                name: payload.customerName || "Servidor Responsável",
                email: payload.customerEmail || "",
                phone: payload.customerPhone || "",
                department: payload.department || "Operações",
                location: payload.location || payload.comarca || "Campo",
                company: payload.company || "MPRJ",
                comarca: payload.comarca || "",
                craai: payload.craai || ""
            },
            assignedTo: payload.assignedTo || payload.technicianName || null,
            assignedTeam: payload.assignedTeam || "N2 — Campo",
            ciAssets: payload.ciAssets || []
        });

        ticket.addNote(
            payload.technicianName || appMeta.name,
            `[Ingestão Automática via ${appMeta.name}] OS #${payload.osNumber || "N/A"}`
        );

        const d = this.storage.getAll();
        if (!d.tickets) d.tickets = {};
        d.tickets[ticket.id] = ticket;
        this.storage.saveAll(d);

        if (this.auditTrail) {
            const entry = this.auditTrail.record("REMOTE_INGEST", payload.technicianName || appMeta.name, ticket.id, {
                appSource: payload.appSource,
                osNumber: payload.osNumber
            });
            if (this.io) this.io.emit("audit:entry", entry);
        }

        if (this.io) {
            this.io.emit("ticket:created", { ticket, source: payload.appSource });
        }

        return ticket;
    }

    /**
     * CANAL 2: Resolução Remota 1-Click (Background / Direto)
     * O app de campo finaliza a OS e fecha o chamado correspondente no PW OpsDesk
     * com laudo, fotos de evidência, assinatura e atualização de SLA.
     */
    handleRemoteResolution(payload) {
        telemetry.checkpoint("ecosystemAdapters.js", "handleRemoteResolution", { 
            ticketId: payload.ticketId,
            appSource: payload.appSource 
        });

        const {
            ticketId,
            appSource,
            osNumber,
            technicianName,
            craai,
            comarca,
            causeCode,
            closeCode,
            workNotes,
            photos,
            signature,
            ciAssets,
            pdfReportUrl
        } = payload;

        const d = this.storage.getAll();
        if (!d.tickets) d.tickets = {};

        let ticket = null;

        if (ticketId && d.tickets[ticketId]) {
            ticket = new TicketEntity(d.tickets[ticketId]);
        } else {
            // Se o chamado ainda não existia no OpsDesk, spawna e resolve atomicamente
            const autoId = ticketId || ("EXT-" + String(Date.now()).slice(-6));
            ticket = new TicketEntity({
                id: autoId,
                title: `[${appSource || "PW Field"}] OS #${osNumber || "S/N"} - ${comarca || "Campo"}`,
                description: workNotes || "Atendimento realizado e finalizado via aplicativo de campo.",
                type: TICKET_TYPE.INCIDENT,
                serviceGroup: "FIELD_SERVICE",
                category: "Suporte em Campo",
                subcategory: "Atendimento Concluído",
                priority: PRIORITY.P3,
                customer: {
                    name: "Servidor Responsável",
                    location: comarca || "Campo",
                    comarca: comarca || "",
                    craai: craai || ""
                },
                assignedTo: technicianName || "Técnico de Campo",
                assignedTeam: "N2 — Campo",
                ciAssets: ciAssets || []
            });
        }

        const validCloseCode = CLOSE_CODES.some(c => c.id === closeCode) ? closeCode : "FCR";
        const validCauseCode = CAUSE_CODES.some(c => c.id === causeCode) ? causeCode : "HW_FAILURE";

        // Vincula CI Assets se houver
        if (Array.isArray(ciAssets)) {
            ciAssets.forEach(asset => ticket.addCIAsset(asset));
        }

        // Executa a resolução estrita padrão Cherwell
        const notesFinal = `[Fechado via ${appSource || "PW App"}] OS #${osNumber || "N/A"}\n${workNotes || "Serviço finalizado com sucesso."}${pdfReportUrl ? `\n📄 Laudo PDF: ${pdfReportUrl}` : ""}`;

        ticket.resolve(technicianName || "Técnico de Campo", {
            closeCode: validCloseCode,
            causeCode: validCauseCode,
            notes: notesFinal,
            evidencePhotos: photos || [],
            signature: signature || null
        });

        d.tickets[ticket.id] = ticket;
        this.storage.saveAll(d);

        if (this.auditTrail) {
            const entry = this.auditTrail.record("REMOTE_RESOLVE", technicianName || appSource, ticket.id, {
                appSource,
                osNumber,
                closeCode: validCloseCode,
                causeCode: validCauseCode,
                evidenceCount: (photos || []).length,
                hasSignature: !!signature
            });
            if (this.io) this.io.emit("audit:entry", entry);
        }

        // Notificação em tempo real para o Master e Admins via WebSockets
        if (this.io) {
            this.io.emit("ticket:remote_resolved", {
                ticketId: ticket.id,
                title: ticket.title,
                appSource: appSource || "PW App",
                osNumber: osNumber || "N/A",
                technicianName: technicianName || "Técnico de Campo",
                solvedAt: ticket.resolvedAt,
                timestamp: new Date().toISOString()
            });
            this.io.emit("ticket:updated", { 
                ticketId: ticket.id, 
                ticket: { ...ticket, sla: ticket.getSLASnapshot() } 
            });
        }

        return ticket;
    }

    /**
     * CANAL 3: Sincronização Intermediária de Status / Notas de Campo
     */
    handleStatusSync(payload) {
        const { ticketId, technicianName, statusAction, notes, appSource, reasonId } = payload;
        const d = this.storage.getAll();
        const raw = d.tickets?.[ticketId];
        if (!raw) throw new Error(`Chamado ${ticketId} não encontrado para sincronização.`);

        const ticket = new TicketEntity(raw);
        const op = technicianName || "Técnico de Campo";

        switch (statusAction) {
            case "START_WORK":
                ticket.startWork(op);
                break;
            case "PAUSE_SLA":
                ticket.pauseSLA(op, reasonId || "AGUARDANDO_CLIENTE", null);
                break;
            case "RESUME_SLA":
                ticket.resumeSLA(op);
                break;
            case "ADD_NOTE":
            default:
                if (notes) ticket.addNote(op, `[${appSource || "Campo"}] ${notes}`);
                break;
        }

        d.tickets[ticket.id] = ticket;
        this.storage.saveAll(d);

        if (this.io) {
            this.io.emit("ticket:updated", { 
                ticketId: ticket.id, 
                ticket: { ...ticket, sla: ticket.getSLASnapshot() } 
            });
        }

        return ticket;
    }

    /**
     * CANAL 4: Consulta de Fila Ativa do Técnico para o App Mobile
     */
    getTechnicianQueue(technicianName) {
        const d = this.storage.getAll();
        const tickets = Object.values(d.tickets || {}).map(t => new TicketEntity(t));
        
        const myTickets = tickets.filter(t => 
            t.assignedTo && 
            t.assignedTo.toLowerCase() === technicianName.toLowerCase() &&
            !["CLOSED", "CANCELLED"].includes(t.status)
        );

        return myTickets.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            customer: t.customer,
            category: t.category,
            subcategory: t.subcategory,
            isPaused: t.isPaused,
            pauseReason: t.pauseReason,
            createdAt: t.createdAt,
            sla: t.getSLASnapshot()
        }));
    }

    /**
     * CANAL 5: Gerador de Deep-Link / Redirecionamento com Pré-preenchimento
     */
    generatePrefillLink(ticketId, appSource, osData = {}) {
        const payload = {
            ticketId,
            appSource,
            osNumber: osData.osNumber || osData.os || "",
            technicianName: osData.technicianName || osData.tecnicoNome || "",
            comarca: osData.comarca || "",
            craai: osData.craai || "",
            workNotes: osData.workNotes || osData.solucao || osData.descricao || "",
            causeCode: osData.causeCode || "HW_FAILURE",
            closeCode: osData.closeCode || "FCR",
            photos: osData.photos || osData.fotos || [],
            signature: osData.signature || osData.assinaturaServidor || null
        };

        const encoded = encodeURIComponent(JSON.stringify(payload));
        return `http://192.168.1.100:3000/#ticket=${ticketId}&action=resolve&prefill=${encoded}`;
    }
}
