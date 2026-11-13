/**
 * PW OPSDESK — CERTIFY FIELD SIMULATOR v1.0
 * Galvanic Isolation: cenários declarativos que reutilizam os MESMOS canais
 * de integração que os apps de campo reais (PW Resolve IT, Certify Legado,
 * Certify Enterprise) usam em produção. Nada de mock paralelo: cada passo
 * passa por EcosystemAdapters (ingest / sync-status / resolve).
 */

const TECH = 'Ricardo Santos';

// ─── EVIDÊNCIAS VISUAIS (SVG inline → data URL, zero arquivos externos) ──────
function svgDataUrl(svg) {
    return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

function evidencePhoto({ title, subtitle, accent, glyph }) {
    return svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="640" height="480" fill="url(#g)"/>
  <g stroke="${accent}" stroke-opacity="0.12">
    ${Array.from({ length: 16 }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="480"/>`).join('')}
    ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 40}" x2="640" y2="${i * 40}"/>`).join('')}
  </g>
  <circle cx="320" cy="200" r="86" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-width="3"/>
  <text x="320" y="228" font-size="84" text-anchor="middle">${glyph}</text>
  <text x="320" y="352" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#f8fafc" text-anchor="middle">${title}</text>
  <text x="320" y="388" font-family="Arial,sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle">${subtitle}</text>
  <rect x="18" y="18" width="190" height="30" rx="6" fill="#000" fill-opacity="0.55"/>
  <text x="30" y="39" font-family="monospace" font-size="15" fill="${accent}">● REC · PW CERTIFY</text>
</svg>`);
}

function signatureDataUrl() {
    return svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="140" viewBox="0 0 400 140">
  <rect width="400" height="140" fill="#ffffff"/>
  <path d="M30 95 C 60 20, 90 20, 100 80 S 140 120, 160 60 S 200 20, 215 85 S 270 110, 300 55 S 340 40, 370 80"
        fill="none" stroke="#0b3b66" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="24" y1="112" x2="376" y2="112" stroke="#cbd5e1" stroke-width="1.5"/>
</svg>`);
}

// ─── CATÁLOGO DE APLICATIVOS & CENÁRIOS ──────────────────────────────────────
export const SIMULATOR_APPS = [
    {
        id: 'RESOLVE_IT',
        appSource: 'PW_RESOLVE_IT',
        name: 'PW Resolve IT',
        vertical: 'TI Corporativa',
        icon: '💻',
        color: '#0ea5e9',
        description: 'App do técnico de TI: ordens de serviço de campo, suporte ao usuário, assinatura do servidor e laudo.',
        scenarios: [
            {
                id: 'RESOLVE_IT_NETWORK_POINT',
                title: 'OS de campo — Estação sem rede',
                summary: 'Abre a OS, inicia o atendimento, registra diagnóstico e fecha com fotos + assinatura do servidor.',
                priorityHint: 'P3',
                stepCount: 4
            }
        ]
    },
    {
        id: 'CERTIFY_LEGACY',
        appSource: 'CERTIFY_PW_SYSTEM',
        name: 'Certify Legado',
        vertical: 'Redes & Telecom',
        icon: '🌐',
        color: '#8b5cf6',
        description: 'Certificação de infraestrutura de rede (fibra, UTP, backbone) para clientes de telecom e seguros.',
        scenarios: [
            {
                id: 'CERTIFY_LEGACY_FIBER_LINK',
                title: 'Enlace de fibra — Atenuação alta',
                summary: 'Fluxo completo com pausa de SLA por acesso físico negado, retomada e fechamento com laudo.',
                priorityHint: 'P2',
                stepCount: 5
            }
        ]
    },
    {
        id: 'CERTIFY_ENTERPRISE',
        appSource: 'PW_CERTIFY_ENTERPRISE',
        name: 'Certify Enterprise',
        vertical: 'CFTV & Segurança Eletrônica',
        icon: '📹',
        color: '#ef4444',
        description: 'Certificação de câmeras, NVR, racks e medições Fluke para infraestrutura crítica de CFTV.',
        scenarios: [
            {
                id: 'CERTIFY_ENTERPRISE_CCTV_P1',
                title: 'Câmera PTZ sem imagem — Alerta P1',
                summary: 'Dispara um incidente CRÍTICO (P1) que aciona o alarme da central, e fecha com medição Fluke.',
                priorityHint: 'P1',
                stepCount: 4
            }
        ]
    }
];

// ─── DEFINIÇÃO DOS PASSOS (cada um = 1 chamada real ao canal de integração) ───
const SCENARIO_STEPS = {
    RESOLVE_IT_NETWORK_POINT: [
        {
            label: 'App abre a OS e envia ao OpsDesk',
            channel: 'ingest',
            http: { method: 'POST', path: '/api/integration/ingest' },
            build: () => ({
                appSource: 'PW_RESOLVE_IT',
                osNumber: 'RIT-' + String(Date.now()).slice(-5),
                title: '[Resolve IT] Estação de trabalho sem acesso à rede — 3ª Promotoria',
                description: 'Servidor relata que a estação perdeu conexão após mudança de layout da sala. Ponto de rede sem link.',
                type: 'INCIDENT',
                priority: 'P3',
                impact: 2,
                urgency: 2,
                technicianName: TECH,
                assignedTo: TECH,
                category: 'Cabeamento Estruturado',
                subcategory: 'Ponto de rede sem sinal',
                comarca: 'Niterói',
                craai: 'CRAAI Niterói',
                company: 'MPRJ',
                department: '3ª Promotoria de Justiça',
                ciAssets: [{ type: 'WORKSTATION', name: 'PC-PJ03-014', location: 'Sala 302' }]
            })
        },
        {
            label: 'Técnico inicia o atendimento em campo',
            channel: 'sync-status',
            http: { method: 'POST', path: '/api/integration/sync-status' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'PW Resolve IT',
                technicianName: TECH,
                statusAction: 'START_WORK'
            })
        },
        {
            label: 'Diagnóstico registrado no campo',
            channel: 'sync-status',
            http: { method: 'POST', path: '/api/integration/sync-status' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'PW Resolve IT',
                technicianName: TECH,
                statusAction: 'ADD_NOTE',
                notes: 'Teste com certificador: patch cord com rompimento no conector RJ45. Ponto do patch panel íntegro.'
            })
        },
        {
            label: 'Fechamento 1-Click com fotos e assinatura',
            channel: 'resolve',
            http: { method: 'POST', path: '/api/integration/resolve' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'PW Resolve IT',
                osNumber: ctx.osNumber || 'RIT-00001',
                technicianName: TECH,
                comarca: 'Niterói',
                craai: 'CRAAI Niterói',
                causeCode: 'CABLE_UTP',
                closeCode: 'HW_REPLACEMENT',
                workNotes: 'Substituído patch cord CAT6 de 2m. Link negociado a 1 Gbps. Usuário validou navegação e acesso aos sistemas.',
                photos: [
                    evidencePhoto({ title: 'Patch cord rompido', subtitle: 'Antes — conector RJ45 danificado', accent: '#ef4444', glyph: '🔌' }),
                    evidencePhoto({ title: 'Link restabelecido', subtitle: 'Depois — 1 Gbps full duplex', accent: '#22c55e', glyph: '✅' })
                ],
                signature: signatureDataUrl()
            })
        }
    ],

    CERTIFY_LEGACY_FIBER_LINK: [
        {
            label: 'Certify abre OS de certificação de enlace',
            channel: 'ingest',
            http: { method: 'POST', path: '/api/integration/ingest' },
            build: () => ({
                appSource: 'CERTIFY_PW_SYSTEM',
                osNumber: 'CTF-' + String(Date.now()).slice(-5),
                title: '[Certify] Enlace de fibra com atenuação acima do limite — Backbone Sala Técnica',
                description: 'Teste OTDR indicou perda de inserção de 4.8 dB (limite 3.0 dB) no enlace entre rack A e rack B.',
                type: 'INCIDENT',
                priority: 'P2',
                impact: 1,
                urgency: 2,
                technicianName: TECH,
                assignedTo: TECH,
                category: 'Fibra Óptica',
                subcategory: 'Atenuação alta',
                company: 'Centauro Seguradora',
                location: 'Datacenter — Sala Técnica 2',
                ciAssets: [{ type: 'FIBER_LINK', name: 'BB-RACK-A→RACK-B', location: 'Sala Técnica 2' }]
            })
        },
        {
            label: 'Técnico inicia a certificação',
            channel: 'sync-status',
            http: { method: 'POST', path: '/api/integration/sync-status' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'Certify Legado',
                technicianName: TECH,
                statusAction: 'START_WORK'
            })
        },
        {
            label: 'Acesso à sala negado — SLA pausado',
            channel: 'sync-status',
            http: { method: 'POST', path: '/api/integration/sync-status' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'Certify Legado',
                technicianName: TECH,
                statusAction: 'PAUSE_SLA',
                reasonId: 'AGUARDANDO_ACESSO',
                notes: 'Sala técnica trancada. Aguardando liberação de acesso pela segurança patrimonial.'
            })
        },
        {
            label: 'Acesso liberado — SLA retomado',
            channel: 'sync-status',
            http: { method: 'POST', path: '/api/integration/sync-status' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'Certify Legado',
                technicianName: TECH,
                statusAction: 'RESUME_SLA'
            })
        },
        {
            label: 'Laudo final com evidências de fusão',
            channel: 'resolve',
            http: { method: 'POST', path: '/api/integration/resolve' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'Certify Legado',
                osNumber: ctx.osNumber || 'CTF-00001',
                technicianName: TECH,
                causeCode: 'FIBER_OPTIC',
                closeCode: 'HW_REPLACEMENT',
                workNotes: 'Emenda por fusão refeita e conector SC/APC limpo. Nova medição: 0.9 dB de perda total — dentro da norma ISO/IEC 14763-3.',
                photos: [
                    evidencePhoto({ title: 'OTDR — antes', subtitle: 'Perda 4.8 dB · FALHA', accent: '#ef4444', glyph: '📉' }),
                    evidencePhoto({ title: 'OTDR — depois', subtitle: 'Perda 0.9 dB · APROVADO', accent: '#22c55e', glyph: '📈' })
                ],
                signature: signatureDataUrl()
            })
        }
    ],

    CERTIFY_ENTERPRISE_CCTV_P1: [
        {
            label: 'Certify Enterprise dispara incidente CRÍTICO',
            channel: 'ingest',
            http: { method: 'POST', path: '/api/integration/ingest' },
            build: () => ({
                appSource: 'PW_CERTIFY_ENTERPRISE',
                osNumber: 'CFT-' + String(Date.now()).slice(-5),
                title: '[CFTV] Câmera PTZ sem imagem — Acesso principal / Ponto 12',
                description: 'Câmera PTZ do acesso principal fora do ar. Área sem cobertura de vídeo. Risco operacional imediato.',
                type: 'INCIDENT',
                priority: 'P1',
                impact: 1,
                urgency: 1,
                technicianName: TECH,
                assignedTo: TECH,
                category: 'Câmeras CFTV',
                subcategory: 'Câmera sem imagem',
                company: 'Condomínio Corporativo Atlântico',
                location: 'Portaria — Ponto 12',
                ciAssets: [{ type: 'CCTV_CAMERA', name: 'PTZ-ACESSO-12', location: 'Portaria' }]
            })
        },
        {
            label: 'Técnico chega ao local e assume o chamado',
            channel: 'sync-status',
            http: { method: 'POST', path: '/api/integration/sync-status' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'Certify Enterprise',
                technicianName: TECH,
                statusAction: 'START_WORK'
            })
        },
        {
            label: 'Medição Fluke registrada',
            channel: 'sync-status',
            http: { method: 'POST', path: '/api/integration/sync-status' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'Certify Enterprise',
                technicianName: TECH,
                statusAction: 'ADD_NOTE',
                notes: 'Fluke DSX: cabo UTP do ponto 12 aprovado (NEXT 41 dB). Tensão PoE no switch: 0 V — porta com falha de alimentação.'
            })
        },
        {
            label: 'Fechamento 1-Click com laudo e fotos',
            channel: 'resolve',
            http: { method: 'POST', path: '/api/integration/resolve' },
            build: (ctx) => ({
                ticketId: ctx.ticketId,
                appSource: 'Certify Enterprise',
                osNumber: ctx.osNumber || 'CFT-00001',
                technicianName: TECH,
                causeCode: 'POWER_SUPPLY',
                closeCode: 'RECONFIGURATION',
                workNotes: 'Porta PoE do switch migrada para a porta 18 (PoE+ 30W). Câmera reinicializada, imagem restabelecida e gravação confirmada no NVR.',
                photos: [
                    evidencePhoto({ title: 'Câmera PTZ sem sinal', subtitle: 'Antes — tela preta no NVR', accent: '#ef4444', glyph: '📹' }),
                    evidencePhoto({ title: 'Imagem restabelecida', subtitle: 'Depois — gravação ativa', accent: '#22c55e', glyph: '🟢' })
                ],
                signature: signatureDataUrl()
            })
        }
    ]
};

// Expõe os rótulos dos passos no catálogo (a UI monta a linha do tempo antes de executar)
SIMULATOR_APPS.forEach(app => app.scenarios.forEach(sc => {
    sc.steps = (SCENARIO_STEPS[sc.id] || []).map(s => ({ label: s.label, channel: s.channel }));
    sc.stepCount = sc.steps.length;
}));

// ─── EXECUTOR ────────────────────────────────────────────────────────────────
/**
 * Executa UM passo do cenário e devolve o resultado + a "requisição HTTP"
 * equivalente (para o painel didático exibir o que o app de campo enviaria).
 */
export function runSimulatorStep(ecosystem, scenarioId, stepIndex, ctx = {}) {
    const steps = SCENARIO_STEPS[scenarioId];
    if (!steps) throw new Error('Cenário desconhecido: ' + scenarioId);
    const step = steps[stepIndex];
    if (!step) throw new Error('Passo inválido: ' + stepIndex);

    const payload = step.build(ctx);
    let ticket;

    if (step.channel === 'ingest') {
        ticket = ecosystem.handleRemoteIngest(payload);
        ctx.ticketId = ticket.id;
        ctx.osNumber = payload.osNumber;
    } else if (step.channel === 'sync-status') {
        ticket = ecosystem.handleStatusSync(payload);
    } else if (step.channel === 'resolve') {
        ticket = ecosystem.handleRemoteResolution(payload);
    } else {
        throw new Error('Canal não suportado: ' + step.channel);
    }

    // Payload "limpo" para exibição: evidências viram contadores (evita despejar base64)
    const display = { ...payload };
    if (Array.isArray(display.photos)) display.photos = `[${display.photos.length} fotos de evidência]`;
    if (display.signature) display.signature = '[assinatura digital do servidor]';

    return {
        ok: true,
        scenarioId,
        stepIndex,
        totalSteps: steps.length,
        label: step.label,
        channel: step.channel,
        ticketId: ticket.id,
        osNumber: ctx.osNumber,
        status: ticket.status,
        priority: ticket.priority,
        http: { ...step.http, headers: { 'x-api-key': '••••••••' }, body: display }
    };
}

export function getScenarioStepCount(scenarioId) {
    return (SCENARIO_STEPS[scenarioId] || []).length;
}
