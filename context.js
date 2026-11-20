// Pure core without vscode: finds the Claude Code session of a folder and computes its context fill.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const FIRST_CHUNK = 256 * 1024;
const MAX_CHUNK = 16 * 1024 * 1024;

/** Project folder in ~/.claude/projects: every char outside [A-Za-z0-9-] becomes a dash. */
function projectDir(folder) {
    return path.join(CLAUDE_DIR, 'projects', folder.replace(/[^A-Za-z0-9-]/g, '-'));
}

function listJsonl(dir) {
    try {
        return fs.readdirSync(dir).filter(n => n.endsWith('.jsonl')).map(n => path.join(dir, n));
    }
    catch {
        return [];
    }
}

/**
 * Newest *.jsonl directly in the project folder (subagents live in subfolders).
 * Without a folder (window without a workspace) across all projects.
 */
function newestTranscripts(folder, count = 3) {
    let files;
    if (folder) {
        files = listJsonl(projectDir(folder));
    }
    else {
        const root = path.join(CLAUDE_DIR, 'projects');
        let dirs = [];
        try {
            dirs = fs.readdirSync(root);
        }
        catch { /* no projects */ }
        files = dirs.flatMap(d => listJsonl(path.join(root, d)));
    }
    return files
        .map(file => {
            try {
                return { file, mtime: fs.statSync(file).mtimeMs };
            }
            catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, count);
}

/** Reads the end of a file and returns its parsed lines, newest first. */
function tailEntries(file, bytes) {
    const fd = fs.openSync(file, 'r');
    try {
        const size = fs.fstatSync(fd).size;
        const start = Math.max(0, size - bytes);
        const buf = Buffer.alloc(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        const lines = buf.toString('utf8').split('\n');
        if (start > 0) lines.shift(); // the first line is cut
        const out = [];
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (!line) continue;
            try {
                out.push(JSON.parse(line));
            }
            catch { /* cut or broken line */ }
        }
        return { entries: out, whole: start === 0 };
    }
    finally {
        fs.closeSync(fd);
    }
}

/** Context from usage: the last iteration of type message (with advisor calls the top-level usage is a sum). */
function usageTokens(usage) {
    if (!usage) return 0;
    const iterations = (usage.iterations || []).filter(i => i.type === 'message');
    const u = iterations.length ? iterations[iterations.length - 1] : usage;
    return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
}

const cache = new Map();

/**
 * Session state from one transcript: the last reply of the main thread, or a compaction after it.
 * Returns null when the file holds no reply.
 */
function readSession(file) {
    let stat;
    try {
        stat = fs.statSync(file);
    }
    catch {
        return null;
    }
    const stamp = stat.mtimeMs + ':' + stat.size;
    const hit = cache.get(file);
    if (hit && hit.stamp === stamp) return hit.result;
    let bytes = FIRST_CHUNK;
    let result;
    for (;;) {
        const { entries, whole } = tailEntries(file, bytes);
        const found = scan(entries);
        if (found || whole || bytes >= MAX_CHUNK) {
            result = found ? { ...found, file } : null;
            break;
        }
        bytes *= 4;
    }
    cache.set(file, { stamp, result });
    return result;
}

function scan(entries) {
    const titled = entries.find(e => e.type === 'ai-title');
    const title = titled ? titled.aiTitle || titled.title || null : null;
    let entrypoint = null;
    let compact = null;
    for (const e of entries) {
        if (!entrypoint && e.entrypoint) entrypoint = e.entrypoint;
        if (e.isSidechain) continue;
        if (e.type === 'system' && e.subtype === 'compact_boundary' && !compact) {
            compact = e;
            continue;
        }
        if (e.type !== 'assistant') continue;
        const msg = e.message || {};
        if (!msg.model || msg.model === '<synthetic>') continue;
        const tokens = usageTokens(msg.usage);
        if (!tokens) continue;
        if (compact) {
            // The compaction is newer than the last reply: its postTokens apply.
            const meta = compact.compactMetadata || {};
            return { model: msg.model, tokens: meta.postTokens || 0, compacted: true, title, entrypoint, time: compact.timestamp };
        }
        return { model: msg.model, tokens, compacted: false, title, entrypoint, time: e.timestamp };
    }
    return null;
}

/** Session of a folder: the newest transcript, preferring one from the VS Code panel. */
function sessionFor(folder, preferEntrypoint = 'claude-vscode') {
    const files = newestTranscripts(folder);
    let fallback = null;
    for (const { file } of files) {
        const s = readSession(file);
        if (!s) continue;
        if (!preferEntrypoint || s.entrypoint === preferEntrypoint) return s;
        if (!fallback) fallback = s;
    }
    return fallback;
}

/** autoCompactWindow from ~/.claude/settings.json for a model, or null. */
function configuredWindow(model) {
    try {
        const settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
        const ms = settings.modelSettings || {};
        const base = model.replace(/\[.*\]$/, '');
        const entry = ms[model] || ms[base];
        return entry && entry.autoCompactWindow ? entry.autoCompactWindow : null;
    }
    catch {
        return null;
    }
}

let limitsCache = null;

/**
 * Account limits (5 h, 7 days) from the last status line input, which claude-hud saves.
 * Refreshed only while the CLI runs; the VS Code panel does not run the status line.
 * Returns { at, fiveHour, sevenDay } (each { pct, resetsAt } in ms, or null), or null.
 */
function rateLimits() {
    const file = path.join(CLAUDE_DIR, 'plugins', 'claude-hud', 'heartbeat.json');
    let stat;
    try {
        stat = fs.statSync(file);
    }
    catch {
        return null;
    }
    if (limitsCache && limitsCache.mtime === stat.mtimeMs) return limitsCache.result;
    let result = null;
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const rl = data.stdin && data.stdin.rate_limits;
        const one = x => x && typeof x.used_percentage === 'number'
            ? { pct: x.used_percentage, resetsAt: x.resets_at ? x.resets_at * 1000 : null }
            : null;
        if (rl) result = { at: data.at || stat.mtimeMs, fiveHour: one(rl.five_hour), sevenDay: one(rl.seven_day) };
    }
    catch { /* file being written or broken: try again next time */ }
    limitsCache = { mtime: stat.mtimeMs, result };
    return result;
}

module.exports = { projectDir, newestTranscripts, readSession, sessionFor, configuredWindow, usageTokens, rateLimits };
