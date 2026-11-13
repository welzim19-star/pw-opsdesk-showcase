import http from 'http';

const BASE = 'http://127.0.0.1:3000';

async function request(path, method = 'GET', body = null, headers = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: body ? JSON.stringify(body) : null
    });
    const json = await res.json();
    return { status: res.status, data: json };
}

async function runTests() {
    console.log('--- TEST 1: FAIL-SECURE RBAC (Operador tentando ver Killcam Master) ---');
    const rbacTest = await request('/api/telemetry/events', 'GET', null, { 'x-user-role': 'OPERADOR' });
    console.log(`Status: ${rbacTest.status} (Esperado 403)`);
    console.log(`Erro: ${rbacTest.data.error} | Correlation: ${rbacTest.data.correlation_id}`);
    if (rbacTest.status !== 403 || rbacTest.data.error !== 'ERR_FORBIDDEN') throw new Error('Falha no teste RBAC Fail-Secure');

    console.log('\n--- TEST 2: VALIDAÇÃO ESTRITA CHERWELL (Tentar fechar sem Close Code) ---');
    const closeValidation = await request('/api/tickets/TICK-10142/resolve', 'POST', { notes: 'Tentando fechar sem código' }, { 'x-user-role': 'OPERADOR' });
    console.log(`Status: ${closeValidation.status} (Esperado 400)`);
    console.log(`Mensagem: ${closeValidation.data.message}`);
    if (closeValidation.status !== 400 || closeValidation.data.error !== 'ERR_VALIDATION') throw new Error('Falha na validação Cherwell');

    console.log('\n--- TEST 3: ONE-STEP CHERWELL (Assumir Chamado) ---');
    const takeOwnership = await request('/api/tickets/TICK-10142/take-ownership', 'POST', { operatorName: 'Wellington Oliveira' }, { 'x-user-role': 'OPERADOR' });
    console.log(`Status: ${takeOwnership.status} | Novo Status: ${takeOwnership.data.ticket.status} | Dono: ${takeOwnership.data.ticket.assignedTo}`);
    if (takeOwnership.data.ticket.assignedTo !== 'Wellington Oliveira') throw new Error('Falha ao assumir chamado');

    console.log('\n--- TEST 4: SLA CLOCK STOP (Pausar SLA) ---');
    const pauseSLA = await request('/api/tickets/TICK-10142/pause-sla', 'POST', { reason: 'Aguardando liberação da promotoria' }, { 'x-user-role': 'OPERADOR' });
    console.log(`Status: ${pauseSLA.status} | Pausado: ${pauseSLA.data.ticket.isPaused} | Motivo: ${pauseSLA.data.ticket.pauseReason}`);
    if (!pauseSLA.data.ticket.isPaused) throw new Error('Falha no Clock Stop');

    console.log('\n--- TEST 5: RESOLUÇÃO VÁLIDA CHERWELL (Com Close Code & Causa) ---');
    const validResolve = await request('/api/tickets/TICK-10142/resolve', 'POST', {
        closeCode: 'RESOLVIDO_PRIMEIRO_CONTATO',
        causeCode: 'PORTA_SWITCH_DEFEITO',
        notes: 'Ponto remapeado para porta Gi1/0/18 funcional.',
        signature: 'data:image/png;base64,mockSignature'
    }, { 'x-user-role': 'OPERADOR' });
    console.log(`Status: ${validResolve.status} | Status Ticket: ${validResolve.data.ticket.status}`);
    if (validResolve.data.ticket.status !== 'RESOLVED') throw new Error('Falha na resolução válida');

    console.log('\n--- TEST 6: DUAL-CHANNEL BRIDGE (Ingestão remota via PW Resolve IT) ---');
    const remoteBridge = await request('/api/integration/close-ticket', 'POST', {
        ticketId: 'TICK-10143',
        appSource: 'PW_RESOLVE_IT',
        osNumber: 'OS-MPRJ-9941',
        technicianName: 'Wellington Oliveira',
        craai: 'CRAAI Nova Friburgo',
        comarca: 'Nova Friburgo',
        causeCode: 'CAMERA_CFTV_DESALINHADA',
        closeCode: 'RESOLVIDO_PRIMEIRO_CONTATO',
        workNotes: 'Câmera reposicionada e foco calibrado via PW Resolve IT.'
    });
    console.log(`Status: ${remoteBridge.status} | Mensagem: ${remoteBridge.data.message}`);
    if (remoteBridge.data.status !== 'SUCCESS') throw new Error('Falha na ponte de integração');

    console.log('\n🏆 TODOS OS 6 TESTES PASSARAM COM ZERO FALHAS (GG!)');
}

runTests().catch(err => {
    console.error('ERRO NO TEST SUITE:', err);
    process.exit(1);
});
