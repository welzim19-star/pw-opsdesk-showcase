/**
 * PW OPSDESK CLIENT SDK v1.0
 * Biblioteca de integração para os aplicativos do ecossistema:
 * - PW Resolve IT
 * - PW Certify Enterprise
 * - Certify PW System (Centauro / Getel)
 */

export class PwOpsDeskClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || "http://192.168.1.100:3000";
        this.apiKey = options.apiKey || "PW-INTEGRATION-KEY-2025";
        this.appSource = options.appSource || "PW_RESOLVE_IT";
        this.technicianName = options.technicianName || "Técnico PW";
    }

    async _request(path, method = "GET", body = null) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey
        };

        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);

        try {
            const res = await fetch(url, opts);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status} em ${path}`);
            }
            return data;
        } catch (err) {
            console.error(`[PW OPSDESK CLIENT] Falha na requisição para ${path}:`, err);
            throw err;
        }
    }

    /**
     * Consulta a fila de chamados atribuídos a um técnico
     */
    async getMinhaFila(technicianName = this.technicianName) {
        return this._request(`/api/integration/technician/${encodeURIComponent(technicianName)}/tickets`);
    }

    /**
     * Consulta os detalhes de um chamado específico
     */
    async obterChamado(ticketId) {
        return this._request(`/api/integration/tickets/${encodeURIComponent(ticketId)}`);
    }

    /**
     * Abre um novo chamado vindo do app de campo
     */
    async abrirChamado(dadosChamado) {
        return this._request("/api/integration/ingest", "POST", {
            appSource: this.appSource,
            technicianName: this.technicianName,
            ...dadosChamado
        });
    }

    /**
     * Fecha remotamente um chamado (1-Click Background) com laudo, fotos e assinatura
     */
    async fecharChamado(dadosFechamento) {
        return this._request("/api/integration/resolve", "POST", {
            appSource: this.appSource,
            technicianName: this.technicianName,
            ...dadosFechamento
        });
    }

    /**
     * Sincroniza status em andamento ou notas de campo
     */
    async sincronizarStatus(ticketId, statusAction, notes = "", reasonId = null) {
        return this._request("/api/integration/sync-status", "POST", {
            ticketId,
            appSource: this.appSource,
            technicianName: this.technicianName,
            statusAction,
            notes,
            reasonId
        });
    }

    /**
     * Gera o link para redirecionar o técnico para o OpsDesk com formulário pré-preenchido
     */
    gerarLinkFechamento(ticketId, dadosOS = {}) {
        const payload = {
            ticketId,
            appSource: this.appSource,
            osNumber: dadosOS.osNumber || dadosOS.os || "",
            technicianName: dadosOS.technicianName || this.technicianName,
            comarca: dadosOS.comarca || "",
            craai: dadosOS.craai || "",
            workNotes: dadosOS.workNotes || dadosOS.solucao || dadosOS.descricao || "",
            causeCode: dadosOS.causeCode || "HW_FAILURE",
            closeCode: dadosOS.closeCode || "FCR",
            photos: dadosOS.photos || dadosOS.fotos || [],
            signature: dadosOS.signature || dadosOS.assinaturaServidor || null
        };
        const encoded = encodeURIComponent(JSON.stringify(payload));
        return `${this.baseUrl}/#ticket=${ticketId}&action=resolve&prefill=${encoded}`;
    }

    /**
     * Redireciona a janela do navegador para o link de fechamento
     */
    redirecionarParaFechamento(ticketId, dadosOS = {}) {
        const link = this.gerarLinkFechamento(ticketId, dadosOS);
        if (typeof window !== "undefined") {
            window.location.href = link;
        }
        return link;
    }
}

// Export para CommonJS e Browser global
if (typeof window !== "undefined") {
    window.PwOpsDeskClient = PwOpsDeskClient;
}
