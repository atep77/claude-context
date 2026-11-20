// Texts shown in the status bar and the tooltip, per language. Placeholders are {0}, {1}, ...
'use strict';

const MESSAGES = {
    en: {
        locale: 'en-GB',
        percent: '{0}%',
        noSession: 'Claude Context: no Claude Code session with a reply for this folder yet.',
        title: '**Claude Code context** – {0} / {1} tokens ({2})',
        session: 'Session: {0}',
        noFolder: 'Window without a folder, newest session: `{0}`',
        model: 'Model: `{0}` · limit: {1}',
        srcExtension: 'extension setting',
        srcSettings: 'autoCompactWindow in ~/.claude/settings.json',
        srcDefault: 'default window',
        compacted: 'Compacted, waiting for the next reply.',
        compactNote: 'Auto-compact starts a little before 100% (observed: around 93% of a 400k limit).',
        limits: '**Account limits** – updated by the CLI {0}',
        limitsStale: ', may be stale (?)',
        fiveHour: '5 h',
        sevenDay: '7 days',
        limitLine: '{0}: {1}',
        resetsAt: ' · resets {0}',
        afterReset: '{0}: reset at {1}, the new value comes from the CLI',
        justNow: 'just now',
        minutesAgo: '{0} min ago',
        hoursAgo: '{0} h ago',
    },
    cs: {
        locale: 'cs-CZ',
        percent: '{0} %',
        noSession: 'Claude Context: pro tuto složku zatím žádná relace Claude Code s odpovědí.',
        title: '**Kontext Claude Code** – {0} / {1} tokenů ({2})',
        session: 'Relace: {0}',
        noFolder: 'Okno bez složky, nejnovější relace: `{0}`',
        model: 'Model: `{0}` · limit: {1}',
        srcExtension: 'nastavení rozšíření',
        srcSettings: 'autoCompactWindow v ~/.claude/settings.json',
        srcDefault: 'výchozí okno',
        compacted: 'Po compactu, čeká se na další odpověď.',
        compactNote: 'Automatický compact přijde dřív než na 100 % (naměřeno: u limitu 400k kolem 93 %).',
        limits: '**Limity účtu** – údaj z CLI {0}',
        limitsStale: ', může být zastaralý (?)',
        fiveHour: '5 h',
        sevenDay: '7 dní',
        limitLine: '{0}: {1}',
        resetsAt: ' · reset {0}',
        afterReset: '{0}: po resetu ({1}), nové číslo přijde z CLI',
        justNow: 'právě teď',
        minutesAgo: 'před {0} min',
        hoursAgo: 'před {0} h',
    },
};

/** Messages for a setting value ('auto', 'en', 'cs') and the VS Code display language. */
function messages(setting, vscodeLanguage) {
    const lang = setting && setting !== 'auto' ? setting : (vscodeLanguage || 'en').slice(0, 2);
    const m = MESSAGES[lang] || MESSAGES.en;
    const t = (key, ...args) => m[key].replace(/\{(\d+)\}/g, (_, i) => String(args[i]));
    t.locale = m.locale;
    return t;
}

module.exports = { messages, MESSAGES };
