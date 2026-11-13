<div align="right">
  <strong>English</strong> | <a href="README.pt-BR.md">Português</a>
</div>

# PW OpsDesk — Enterprise Operations & ITSM Dispatch Architecture 🏢📡

[![Platform](https://img.shields.io/badge/Platform-B2B%20Enterprise%20SaaS-blue.svg)](https://github.com/PW-SYSTEM)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven%20%2F%20Socket.io-orange.svg)](https://socket.io/)
[![Standard](https://img.shields.io/badge/Standard-Cherwell%20ITSM%20Compliant-brightgreen.svg)](https://www.ivanti.com)
[![Organization](https://img.shields.io/badge/Organization-PW--SYSTEM-black.svg)](https://github.com/PW-SYSTEM)
[![Status](https://img.shields.io/badge/Proprietary-Commercial%20B2B-red.svg)](https://github.com/PW-SYSTEM)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/welzim19-star/pw-opsdesk-showcase)

> **Architectural Showcase & System Design Specification.**  
> Central command desk for mission-critical operations, field service inspection, and biometric auditing developed for public agencies and enterprise telecom/CCTV infrastructure.  
> *Developed and maintained by [PW-SYSTEM](https://github.com/PW-SYSTEM).*

---

## 📌 High-Level Architecture (Event-Driven Dispatch)

PW OpsDesk operates as the nervous system connecting mobile field inspectors, supervisors, and administrative dispatchers via a dual-channel REST + WebSockets backbone.

```mermaid
flowchart TD
    subgraph FIELD_CLIENTS["Field Operational Tier"]
        Inspector["PW Certify Enterprise"]
        Biometrics["Face Biometrics & TOTP"]
        Inspector --- Biometrics
    end

    subgraph CORE_SERVER["PW OpsDesk Central Engine"]
        Auth["RBAC Enforcement"]
        SocketHub["Real-Time Dispatch Hub"]
        Storage["Atomic Journal Storage"]
        PDF["Forensic PDF Engine"]
        
        Auth --> SocketHub
        SocketHub --> Storage
        Storage --> PDF
    end

    subgraph EXTERNAL["Enterprise Integrations"]
        HaloITSM["HaloITSM Service Desk API"]
        AuditStream["SHA-256 Audit Streamer"]
    end

    FIELD_CLIENTS -- "WebSocket Live Sync" --> SocketHub
    FIELD_CLIENTS -- "HTTPS REST Flush" --> Auth
    CORE_SERVER --> HaloITSM
    CORE_SERVER --> AuditStream
```

---

## 📸 Production Operational Showcase

Field captures from enterprise deployments demonstrating dispatcher controls, mobile inspection workflows, and cryptographic evidence sealing:

<table width="100%">
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/assets/app_hub_view.jpg" alt="Operational Dispatch Hub" width="100%" />
      <p><strong>Operational Dispatch Hub:</strong> Real-time ticket routing, live supervisor radar, and queue governance.</p>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/assets/app_redes_mapping.png" alt="Network & Topology Inspection" width="100%" />
      <p><strong>Network Infrastructure Mapping:</strong> Switch port auditing, topology discovery, and telecom rack verification.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/assets/app_cftv_checklist.png" alt="CCTV Inspection Checklist" width="100%" />
      <p><strong>CCTV Camera Compliance Checklist:</strong> Point-to-point stream validation, optic alignment, and physical hardening.</p>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/assets/app_pdf_dossier.png" alt="Forensic PDF Dossier" width="100%" />
      <p><strong>Forensic PDF Audit Dossier:</strong> Digitally signed, tamper-evident inspection reports generated in real time.</p>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center" valign="top">
      <img src="docs/assets/app_signature_modal.jpg" alt="Biometric & Digital Signature" width="60%" />
      <p><strong>Biometric & Digital Signature Modal:</strong> Field client seal with GPS coordinate locking and SHA-256 integrity hash.</p>
    </td>
  </tr>
</table>

---

## 🎮 Interactive Live Playground — PW Ecosystem Bridge

OpsDesk includes an interactive **Certify Bridge Simulator** accessible directly from the sidebar (`📡 Ponte Certify (LIVE)`), allowing real-time testing of the 3 flagship mobile field applications without needing physical Android devices:

| Mobile Client | Operational Domain | Real-World Customer Reference | Simulated Scenario |
| :--- | :--- | :--- | :--- |
| **PW Resolve IT** | Corporate IT & Field OS | Ministério Público (MPRJ) | Network wall-jack repair, patch cord replacement, photo evidence & customer signature. |
| **Certify Legado** | Telecom & Fiber Infrastructure | Getel / Centauro Seguradora | Fiber link break, SLA pause during site access clearance (`AGUARDANDO_ACESSO`), and OTDR fusion splicing report. |
| **Certify Enterprise** | CCTV, Physical Security & Fluke | High-Density Enterprise Surveillance | P1 critical NVR/PoE switch breakdown, Fluke DSX cable diagnostic note, and power reconfiguration resolution. |

Every simulated step executes through the **real integration transport layer** (`EcosystemAdapters.handleRemoteIngest`, `handleStatusSync`, `handleRemoteResolution`), triggering live WebSocket broadcasts (`ticket:created`, `ticket:updated`, `ticket:remote_resolved`), real-time notification chimes, and cryptographic audit log entries.

---

## 🛡️ Enterprise Governance & Security Matrix

### 1. Granular Role-Based Access Control (RBAC)
- **Field Operator:** Restricted to assigned ticket scope, camera/photo capture, and geolocation check-in.
- **Field Supervisor (Master):** Ticket delegation, biometric identity approval, and real-time inspector radar tracking.
- **System Administrator:** Full audit trail inspection, tenant provisioning, and global compliance configuration.

### 2. Offline-First Resilience
- Field inspections often occur in basements, underground hubs, or areas with zero 4G/5G connectivity.
- Inspecting devices store operations in an atomic SQLite WAL queue. Upon signal recovery, an idempotent reconciliation protocol flushes queued events with zero data collision.

### 3. Biometric & Forensic Audit Trail
- Each field action is sealed with GPS coordinate triangulation, device hardware fingerprint, and cryptographic hash timestamp preventing retroactive report tampering.

---

## 📊 Technical Specifications & Throughput SLA

| Parameter | Specification / Benchmark |
| :--- | :--- |
| **Event Throughput** | **> 12,000 messages/sec** (Socket.io Cluster) |
| **Average Dispatch Latency** | **< 38 ms** (Standard 4G LTE Network) |
| **Data Persistence** | SQLite WAL Mode with ACID Atomic Transactions |
| **Technical Report Generation** | Async PDFKit in < 450ms per report with forensic photos |
| **ITSM Integration** | HaloITSM REST API v2 (Bidirectional Webhooks) |

---

## 🔒 Commercial Notice
*This repository serves as the public architectural specification and case study. The underlying production codebase, proprietary algorithms, and deployment manifests are private commercial assets of [PW-SYSTEM](https://github.com/PW-SYSTEM).*
