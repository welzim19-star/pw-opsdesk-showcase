/**
 * PW OPSDESK — STORAGE ENGINE v2.0
 * Simple JSON persistence. Zero business logic.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { telemetry } from './telemetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class StorageEngine {
    constructor(dataFile) {
        this.dataFile = dataFile || path.join(__dirname, '../data/opsdesk_db.json');
        this._ensureDir();
        telemetry.checkpoint('storage.js', 'StorageEngine.init', { file: this.dataFile });
    }

    _ensureDir() {
        const dir = path.dirname(this.dataFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(this.dataFile)) fs.writeFileSync(this.dataFile, JSON.stringify({ tickets: {}, users: {}, sessions: {}, auditLog: [] }, null, 2));
    }

    getAll() {
        try {
            const raw = fs.readFileSync(this.dataFile, 'utf-8');
            return JSON.parse(raw);
        } catch(e) {
            telemetry.killcam('storage.js', 'getAll.FAIL', e);
            return { tickets: {}, users: {}, sessions: {}, auditLog: [] };
        }
    }

    saveAll(data) {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch(e) {
            telemetry.killcam('storage.js', 'saveAll.FAIL', e);
        }
    }
}
