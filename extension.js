// Status bar item in VS Code: context fill of the Claude Code session in this folder, plus account limits.
'use strict';

const vscode = require('vscode');
const path = require('node:path');
const { sessionFor, configuredWindow, rateLimits } = require('./context.js');
const { messages } = require('./strings.js');

const POLL_MS = 2000;

function kilo(n) {
    return n >= 1000000 ? (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M' : Math.round(n / 1000) + 'k';
}

function when(t, ms) {
    return new Date(ms).toLocaleString(t.locale, { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ago(t, ms) {
    const min = Math.round(ms / 60000);
    return min < 1 ? t('justNow') : min < 60 ? t('minutesAgo', min) : t('hoursAgo', Math.round(min / 60));
}

/**
 * Account limits for the text and the tooltip. After a reset the old percentage no longer holds (`–`),
 * a value older than staleMinutes gets a question mark.
 */
function limitParts(t, limits, now, staleMinutes) {
    if (!limits) return null;
    const stale = now - limits.at > staleMinutes * 60000;
    const part = (label, longLabel, l) => {
        if (!l) return null;
        const reset = l.resetsAt && now >= l.resetsAt;
        const pct = t('percent', Math.round(l.pct));
        const value = reset ? '–' : pct + (stale ? '?' : '');
        const tip = reset
            ? t('afterReset', longLabel, when(t, l.resetsAt))
            : t('limitLine', longLabel, pct) + (l.resetsAt ? t('resetsAt', when(t, l.resetsAt)) : '');
        return { text: `${label} ${value}`, tip, pct: reset ? 0 : l.pct, key: value };
    };
    const parts = [ part('5h', t('fiveHour'), limits.fiveHour), part('7d', t('sevenDay'), limits.sevenDay) ].filter(Boolean);
    return parts.length ? { parts, stale, age: ago(t, now - limits.at) } : null;
}

function activate(context) {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    item.name = 'Claude Context';
    item.command = 'claudeContext.refresh';
    context.subscriptions.push(item);

    let last = '';
    const update = () => {
        const cfg = vscode.workspace.getConfiguration('claudeContext');
        const t = messages(cfg.get('language'), vscode.env.language);
        const prefer = cfg.get('preferVsCodeSession') ? 'claude-vscode' : null;
        const folders = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
        let s = null;
        // Window without a folder: the newest session across all projects.
        for (const f of folders.length ? folders : [ null ]) {
            s = sessionFor(f, prefer);
            if (s) break;
        }
        if (!s) {
            if (last !== 'none') {
                last = 'none';
                item.text = '$(hubot) –';
                item.backgroundColor = undefined;
                item.tooltip = t('noSession');
                item.show();
            }
            return;
        }
        const overrides = cfg.get('windows') || {};
        const fromSettings = configuredWindow(s.model);
        const window = overrides[s.model] || fromSettings || (s.model.includes('[1m]') ? 1000000 : cfg.get('defaultWindow'));
        const source = overrides[s.model] ? t('srcExtension') : fromSettings ? t('srcSettings') : t('srcDefault');
        const pct = Math.round(s.tokens / window * 100);
        const now = Date.now();
        const lim = cfg.get('showLimits') ? limitParts(t, rateLimits(), now, cfg.get('limitsStaleMinutes')) : null;
        const key = [ t.locale, s.file, s.tokens, window, s.compacted, s.title,
            lim ? lim.parts.map(p => p.key).join(',') + lim.age : '' ].join('|');
        if (key === last) return;
        last = key;

        item.text = `$(hubot) ${kilo(s.tokens)}/${kilo(window)} ${t('percent', pct)}` + (s.compacted ? ' $(fold)' : '') +
            (lim ? ' · ' + lim.parts.map(p => p.text).join(' · ') : '');
        // Colour by the worst of the context and the limits.
        const worst = Math.max(pct, ...(lim ? lim.parts.map(p => p.pct) : []));
        item.backgroundColor = worst >= cfg.get('errorPercent')
            ? new vscode.ThemeColor('statusBarItem.errorBackground')
            : worst >= cfg.get('warningPercent') ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
        const tip = new vscode.MarkdownString();
        tip.appendMarkdown(t('title', s.tokens.toLocaleString(t.locale), window.toLocaleString(t.locale), t('percent', pct)) + '\n\n');
        if (s.title) tip.appendMarkdown(t('session', s.title) + '\n\n');
        if (!folders.length) tip.appendMarkdown(t('noFolder', path.basename(path.dirname(s.file))) + '\n\n');
        tip.appendMarkdown(t('model', s.model, source) + '\n\n');
        if (s.compacted) tip.appendMarkdown(t('compacted') + '\n\n');
        tip.appendMarkdown(t('compactNote') + '\n\n');
        if (lim) {
            tip.appendMarkdown(t('limits', lim.age) + (lim.stale ? t('limitsStale') : '') + '\n\n');
            for (const p of lim.parts) tip.appendMarkdown(p.tip + '\n\n');
        }
        tip.appendMarkdown(`\`${path.basename(s.file)}\` (${s.entrypoint || '?'})`);
        item.tooltip = tip;
        item.show();
    };

    const safeUpdate = () => {
        try {
            update();
        }
        catch (err) {
            console.error('claude-context', err);
        }
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeContext.refresh', () => {
            last = '';
            safeUpdate();
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('claudeContext')) {
                last = '';
                safeUpdate();
            }
        })
    );
    const timer = setInterval(safeUpdate, POLL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
    safeUpdate();
}

function deactivate() {}

module.exports = { activate, deactivate };
