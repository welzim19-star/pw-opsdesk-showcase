/**
 * PW OPSDESK — FAIL-SECURE RBAC ENGINE (SECURITY BY DESIGN)
 * Validação determinística de papéis (MASTER, ADMIN, OPERADOR)
 * Rejeição instantânea de requisições ilegítimas com payload mascarado.
 */

import { v4 as uuidv4 } from 'uuid';
import { telemetry } from './telemetry.js';

export const ROLES = {
    MASTER: 'MASTER',       // Controle total, Overlord Wallboard, Telemetria & Overrides
    ADMIN: 'ADMIN',         // Despacho de filas, métricas de técnicos, catálogos e aprovação
    OPERADOR: 'OPERADOR'    // Técnico de campo, checklist interativo, resolução de chamado
};

// Permissões por Ação
const PERMISSIONS = {
    // Chamados Gerais
    'TICKET_VIEW_ALL': [ROLES.MASTER, ROLES.ADMIN],
    'TICKET_VIEW_ASSIGNED': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR],
    'TICKET_CREATE': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR],
    'TICKET_TAKE_OWNERSHIP': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR],
    'TICKET_REASSIGN': [ROLES.MASTER, ROLES.ADMIN],
    'TICKET_START_WORK': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR],
    'TICKET_PAUSE_SLA': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR],
    'TICKET_RESUME_SLA': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR],
    'TICKET_RESOLVE': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR],
    'TICKET_FORCE_CLOSE': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR],
    'TICKET_REOPEN': [ROLES.MASTER, ROLES.ADMIN],
    'TICKET_DELETE': [ROLES.MASTER],

    // Módulos de Gestão & Telemetria
    'WALLBOARD_ACCESS': [ROLES.MASTER],
    'KILLCAM_VIEW': [ROLES.MASTER],
    'WORKLOAD_MANAGEMENT': [ROLES.MASTER, ROLES.ADMIN],
    'INTEGRATION_SYNC': [ROLES.MASTER, ROLES.ADMIN, ROLES.OPERADOR]
};

export class RBACEngine {
    constructor() {
        this.roles = ROLES;
    }

    check(role, action) {
        telemetry.checkpoint('rbac.js', 'RBACEngine.check', { role, action });

        const allowedRoles = PERMISSIONS[action];
        if (!allowedRoles) {
            telemetry.killcam('RBAC_UNDEFINED_ACTION', new Error(`Ação não catalogada: ${action}`));
            return false;
        }

        const isAllowed = allowedRoles.includes(role);
        if (!isAllowed) {
            telemetry.checkpoint('rbac.js', 'RBAC_ACCESS_DENIED', { role, action });
        }
        return isAllowed;
    }

    enforce(role, action, res) {
        if (!this.check(role, action)) {
            const correlationId = uuidv4();
            telemetry.killcam('FAIL_SECURE_INTERCEPTION', new Error(`Papel [${role}] tentou executar [${action}] sem autorização.`), { correlationId });
            res.status(403).json({
                error: 'ERR_FORBIDDEN',
                message: 'Acesso negado pela política RBAC do PW OpsDesk.',
                correlation_id: correlationId
            });
            return false;
        }
        return true;
    }
}

export const rbac = new RBACEngine();
