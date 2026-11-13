/**
 * PW OPSDESK — OBSERVABILIDADE AGRESSIVA & TELEMETRIA GALVÂNICA
 * Implementa a diretiva "Wallhack / Killcam":
 * - Rastreamento contínuo de último arquivo e último comando.
 * - Emissão de Killcam detalhada com traceback em caso de falha.
 * - Isolamento galvânico: zero contato direto com frameworks de transporte.
 */

import { v4 as uuidv4 } from 'uuid';

class GalvanicTelemetry {
    constructor() {
        this.lastFileAccessed = 'telemetry.js';
        this.lastCommand = 'initialize';
        this.eventHistory = [];
        this.maxHistory = 1000;
        this.listeners = new Set();
    }

    checkpoint(file, command, metadata = {}) {
        this.lastFileAccessed = file;
        this.lastCommand = command;
        const entry = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            file,
            command,
            metadata
        };
        this.eventHistory.push(entry);
        if (this.eventHistory.length > this.maxHistory) {
            this.eventHistory.shift();
        }
        this._notify(entry);
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    _notify(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (err) {
                console.error('[TELEMETRY LISTENER ERROR]', err);
            }
        }
    }

    killcam(context, error, extra = {}) {
        const correlationId = uuidv4();
        const killcamPayload = {
            alert: 'KILLCAM_TRIGGERED',
            correlation_id: correlationId,
            context,
            lastFileAccessed: this.lastFileAccessed,
            lastCommand: this.lastCommand,
            errorMessage: error?.message || String(error),
            stack: error?.stack || 'N/A',
            timestamp: new Date().toISOString(),
            extra
        };

        console.error('\n======================================================');
        console.error('🚨 [GALVANIC KILLCAM REPORT] FALHA DETECTADA!');
        console.error(`📍 Contexto: ${context}`);
        console.error(`📁 Último Arquivo: ${this.lastFileAccessed}`);
        console.error(`⚡ Último Comando: ${this.lastCommand}`);
        console.error(`🆔 Correlation ID: ${correlationId}`);
        console.error(`💥 Erro: ${killcamPayload.errorMessage}`);
        console.error(`📜 Traceback:\n${killcamPayload.stack}`);
        console.error('======================================================\n');

        return killcamPayload;
    }

    getRecentEvents(limit = 50) {
        return this.eventHistory.slice(-limit);
    }
}

export const telemetry = new GalvanicTelemetry();
