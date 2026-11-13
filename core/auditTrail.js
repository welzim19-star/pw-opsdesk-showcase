/**
 * PW OPSDESK — AUDIT TRAIL IMUTÁVEL & IDEMPOTÊNCIA (BANK-GRADE STANDARD)
 * - Hash chaining SHA-256 para prevenir adulteração de logs.
 * - Verificação de integridade ponta a ponta (Tamper-Evident Ledger).
 * - Cache de idempotência para evitar duplicação de comandos de campo em retentativas 3G/4G.
 * - Persistência atômica vinculada ao StorageEngine.
 */

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { telemetry } from "./telemetry.js";

export class AuditTrailEngine {
    constructor(storage = null) {
        this.storage = storage;
        this.logChain = [];
        this.idempotencyKeys = new Map(); // key -> cachedResponse
        this.maxIdempotencyLifetimeMs = 1000 * 60 * 60 * 24; // 24 horas
        this.genesisHash = "0000000000000000000000000000000000000000000000000000000000000000";
        this.lastHash = this.genesisHash;

        if (this.storage) {
            this.loadFromStorage();
        }
    }

    loadFromStorage() {
        try {
            const data = this.storage.getAll();
            if (Array.isArray(data.auditLog) && data.auditLog.length > 0) {
                this.logChain = data.auditLog;
                this.lastHash = this.logChain[this.logChain.length - 1].hash;
                telemetry.checkpoint("auditTrail.js", "loadFromStorage", { totalBlocks: this.logChain.length, lastHash: this.lastHash });
            } else {
                // Se a cadeia estiver vazia, inicializa o Genesis Block
                this.record("GENESIS_BLOCK", "SYSTEM_CORE", null, {
                    message: "PW OpsDesk Bank-Grade Audit Ledger Inicializado",
                    protocol: "SHA-256 Hash Chaining",
                    standard: "ITIL 4 / BACEN Compliance"
                });
            }
        } catch (err) {
            telemetry.killcam("auditTrail.js", "loadFromStorage", err);
        }
    }

    record(action, actor, ticketId, payload = {}) {
        telemetry.checkpoint("auditTrail.js", "AuditTrailEngine.record", { action, actor, ticketId });

        const timestamp = new Date().toISOString();
        const rawContent = JSON.stringify({
            previousHash: this.lastHash,
            action,
            actor: actor || "SYSTEM",
            ticketId: ticketId || null,
            timestamp,
            payload: payload || {}
        });

        const currentHash = crypto.createHash("sha256").update(rawContent).digest("hex");

        const entry = {
            index: this.logChain.length,
            id: uuidv4(),
            timestamp,
            action,
            actor: actor || "SYSTEM",
            ticketId: ticketId || null,
            payload: payload || {},
            previousHash: this.lastHash,
            hash: currentHash
        };

        this.logChain.push(entry);
        this.lastHash = currentHash;

        if (this.storage) {
            try {
                const data = this.storage.getAll();
                data.auditLog = this.logChain;
                this.storage.saveAll(data);
            } catch (err) {
                telemetry.killcam("auditTrail.js", "AuditTrailEngine.persist", err);
            }
        }

        return entry;
    }

    verifyChain() {
        telemetry.checkpoint("auditTrail.js", "verifyChain", { totalBlocks: this.logChain.length });

        let isValid = true;
        let tamperedIndex = -1;
        let reason = null;
        let expectedPrevHash = this.genesisHash;

        for (let i = 0; i < this.logChain.length; i++) {
            const entry = this.logChain[i];

            // 1. Valida encadeamento do hash anterior
            if (entry.previousHash !== expectedPrevHash) {
                isValid = false;
                tamperedIndex = i;
                reason = `Quebra de encadeamento no bloco #${i}: hash anterior esperado ${expectedPrevHash.slice(0, 16)}..., recebido ${entry.previousHash.slice(0, 16)}...`;
                break;
            }

            // 2. Recalcula o hash do bloco com base no conteúdo
            const rawContent = JSON.stringify({
                previousHash: entry.previousHash,
                action: entry.action,
                actor: entry.actor,
                ticketId: entry.ticketId,
                timestamp: entry.timestamp,
                payload: entry.payload
            });
            const computedHash = crypto.createHash("sha256").update(rawContent).digest("hex");

            if (computedHash !== entry.hash) {
                isValid = false;
                tamperedIndex = i;
                reason = `Adulteração de conteúdo no bloco #${i}: hash calculado ${computedHash.slice(0, 16)}..., hash registrado ${entry.hash.slice(0, 16)}...`;
                break;
            }

            expectedPrevHash = entry.hash;
        }

        return {
            isValid,
            totalBlocks: this.logChain.length,
            tamperedIndex: isValid ? null : tamperedIndex,
            reason: isValid ? "Cadeia de custódia 100% íntegra. Assinaturas SHA-256 validadas com sucesso." : reason,
            genesisHash: this.logChain.length > 0 ? this.logChain[0].hash : null,
            lastHash: this.lastHash,
            verifiedAt: new Date().toISOString()
        };
    }

    checkIdempotency(idempotencyKey) {
        if (!idempotencyKey) return null;
        
        telemetry.checkpoint("auditTrail.js", "checkIdempotency", { idempotencyKey });
        const cached = this.idempotencyKeys.get(idempotencyKey);
        if (cached) {
            const isExpired = (Date.now() - cached.createdAt) > this.maxIdempotencyLifetimeMs;
            if (isExpired) {
                this.idempotencyKeys.delete(idempotencyKey);
                return null;
            }
            return cached.response;
        }
        return null;
    }

    saveIdempotency(idempotencyKey, response) {
        if (!idempotencyKey) return;
        this.idempotencyKeys.set(idempotencyKey, {
            response,
            createdAt: Date.now()
        });
    }

    getTimelineForTicket(ticketId) {
        return this.logChain.filter(log => log.ticketId === ticketId);
    }

    getRecentAuditLogs(limit = 100, filters = {}) {
        let results = [...this.logChain];

        if (filters.action && filters.action !== "ALL") {
            results = results.filter(log => log.action.toUpperCase().includes(filters.action.toUpperCase()));
        }
        if (filters.actor && filters.actor.trim() !== "") {
            const act = filters.actor.trim().toLowerCase();
            results = results.filter(log => (log.actor || "").toLowerCase().includes(act));
        }
        if (filters.ticketId && filters.ticketId.trim() !== "") {
            const tid = filters.ticketId.trim().toUpperCase();
            results = results.filter(log => (log.ticketId || "").toUpperCase().includes(tid));
        }
        if (filters.search && filters.search.trim() !== "") {
            const q = filters.search.trim().toLowerCase();
            results = results.filter(log => 
                (log.action || "").toLowerCase().includes(q) ||
                (log.actor || "").toLowerCase().includes(q) ||
                (log.ticketId || "").toLowerCase().includes(q) ||
                JSON.stringify(log.payload || {}).toLowerCase().includes(q)
            );
        }

        return results.slice(-limit).reverse();
    }
}

export const auditTrail = new AuditTrailEngine();
