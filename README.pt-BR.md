<div align="right">
  <a href="README.md">English</a> | <strong>Português</strong>
</div>

# PW OpsDesk — Central Operacional & Arquitetura de Despacho ITSM 🏢📡

[![Plataforma](https://img.shields.io/badge/Plataforma-B2B%20Enterprise%20SaaS-blue.svg)](https://github.com/PW-SYSTEM)
[![Arquitetura](https://img.shields.io/badge/Arquitetura-Orientada%20a%20Eventos%20%2F%20Socket.io-orange.svg)](https://socket.io/)
[![Padrão](https://img.shields.io/badge/Padr%C3%A3o-Compat%C3%ADvel%20Cherwell%20ITSM-brightgreen.svg)](https://www.ivanti.com)
[![Organização](https://img.shields.io/badge/Organiza%C3%A7%C3%A3o-PW--SYSTEM-black.svg)](https://github.com/PW-SYSTEM)
[![Status](https://img.shields.io/badge/Propriet%C3%A1rio-Comercial%20B2B-red.svg)](https://github.com/PW-SYSTEM)

> **Vitrine Arquitetural & Especificação de Design de Sistemas.**  
> Central de comando para operações de missão crítica, inspeção técnica em campo e auditoria biométrica pericial desenvolvida para concessionárias, órgãos públicos e infraestrutura de telecomunicações/CFTV.  
> *Desenvolvido e mantido por [PW-SYSTEM](https://github.com/PW-SYSTEM).*

---

## 📌 Arquitetura de Alto Nível (Despacho Orientado a Eventos)

O PW OpsDesk atua como o sistema nervoso central conectando inspetores móveis em campo, supervisores operacionais e despachantes administrativos através de um canal híbrido REST + WebSockets.

```mermaid
flowchart TD
    subgraph FIELD_CLIENTS["Camada Operacional de Campo (Android / Mobile)"]
        Inspector["PW Certify Enterprise\n(Capacitor + Tauri Mobile)"]
        Biometrics["Biometria Facial & TOTP\n(Desafio-Resposta Offline)"]
        Inspector --- Biometrics
    end

    subgraph CORE_SERVER["Motor Central PW OpsDesk (Node.js ESM)"]
        Auth["Motor de Aplicação RBAC\n(Administrador / Supervisor / Operador)"]
        SocketHub["Central de Despacho em Tempo Real\n(Motor Socket.io)"]
        Storage["Armazenamento em Jornal Atômico\n(SQLite Modo WAL)"]
        PDF["Gerador de Laudos PDF Periciais\n(Motor de Assinatura Digital)"]
        
        Auth --> SocketHub
        SocketHub --> Storage
        Storage --> PDF
    end

    subgraph EXTERNAL["Integrações Corporativas"]
        HaloITSM["API de Service Desk HaloITSM\n(Sincronização Bidirecional)"]
        AuditStream["Transmissor de Trilha SHA-256"]
    end

    FIELD_CLIENTS -- "Sincronização Live WebSocket (Sub-50ms)" --> SocketHub
    FIELD_CLIENTS -- "HTTPS REST (Descarga Offline)" --> Auth
    CORE_SERVER --> HaloITSM
    CORE_SERVER --> AuditStream
```

---

## 🛡️ Matriz de Segurança & Governança Corporativa

### 1. Controle de Acesso Baseado em Papéis (RBAC Granular)
- **Operador de Campo:** Acesso restrito ao escopo do chamado atribuído, captura de fotos periciais e confirmação de presença via GPS.
- **Supervisor de Campo (Master):** Delegação de chamados, homologação biométrica de identidade e radar de rastreamento de equipes em tempo real.
- **Administrador do Sistema:** Acesso total à trilha de auditoria, provisionamento de instâncias corporativas e governança de conformidade.

### 2. Resiliência com Arquitetura Offline-First
- Inspeções técnicas frequentemente ocorrem em subsolos, estações remotas ou áreas com ausência de sinal de rede celular (4G/5G).
- Os dispositivos armazenam eventos em uma fila atômica SQLite WAL. Ao restabelecer conectividade, um protocolo de reconciliação idempotente descarrega os registros sem conflitos de dados.

### 3. Trilha de Auditoria Pericial & Biométrica
- Cada registro de campo é selado com triangulação de coordenadas geográficas, impressão digital do dispositivo (*hardware fingerprint*) e carimbo de tempo com hash criptográfico, impossibilitando adulterações retroativas.

---

## 📊 Especificações Técnicas & SLA de Vazão

| Parâmetro | Especificação / Benchmark |
| :--- | :--- |
| **Vazão de Eventos (Throughput)** | **> 12.000 mensagens/segundo** (Cluster Socket.io) |
| **Latência Média de Despacho** | **< 38 ms** (Rede móvel 4G LTE padrão) |
| **Persistência de Dados** | SQLite Modo WAL com transações atômicas ACID |
| **Geração de Laudos Técnicos** | PDFKit assíncrono em < 450ms por laudo com fotos periciais |
| **Integração ITSM** | HaloITSM REST API v2 (Webhooks bidirecionais) |

---

## 🔒 Aviso Comercial
*Este repositório atua como especificação pública de arquitetura e estudo de caso técnico. O código-fonte de produção, algoritmos proprietários e manifestos de implantação são ativos comerciais privados da [PW-SYSTEM](https://github.com/PW-SYSTEM).*
