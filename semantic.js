const vscode = require('vscode');

function resolveStyle(rules, type, modifiers, language) {
    const properties = new Map();
    for (const [selector, setting] of Object.entries(rules)) {
        const [pattern, scope] = selector.split(':');
        const [tokenType, ...required] = pattern.split('.');
        if ((scope && scope !== language) || (tokenType !== '*' && tokenType !== type)
            || !required.every(modifier => modifiers.includes(modifier))) continue;
        if (!setting || (typeof setting !== 'string' && typeof setting !== 'object')) continue;
        const score = (scope ? 10 : 0) + (tokenType === '*' ? 0 : 100) + required.length;
        const style = typeof setting === 'string' ? { foreground: setting } : { ...setting };
        if (typeof style.fontStyle === 'string') {
            for (const property of ['bold', 'italic', 'underline', 'strikethrough']) {
                style[property] ??= style.fontStyle.split(/\s+/).includes(property);
            }
        }
        for (const property of ['foreground', 'bold', 'italic', 'underline', 'strikethrough']) {
            if (style[property] !== undefined && score >= (properties.get(property)?.score ?? -1)) {
                properties.set(property, { value: style[property], score });
            }
        }
    }
    const value = property => properties.get(property)?.value;
    const css = [];
    const color = value('foreground');
    if (typeof color === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) css.push(`color:${color}`);
    if (typeof value('bold') === 'boolean') css.push(`font-weight:${value('bold') ? 'bold' : 'normal'}`);
    if (typeof value('italic') === 'boolean') css.push(`font-style:${value('italic') ? 'italic' : 'normal'}`);
    if (typeof value('underline') === 'boolean' || typeof value('strikethrough') === 'boolean') {
        css.push(`text-decoration:${[value('underline') && 'underline', value('strikethrough') && 'line-through'].filter(Boolean).join(' ') || 'none'}`);
    }
    return css.join(';');
}

async function semanticLines(document, styles) {
    const lines = new Map();
    if (!document) return lines;
    const editor = vscode.workspace.getConfiguration('editor', document);
    const custom = editor.get('semanticTokenColorCustomizations', {});
    const theme = vscode.workspace.getConfiguration('workbench', document).get('colorTheme');
    const scoped = theme ? custom[`[${theme}]`] : undefined;
    const enabled = editor.get('semanticHighlighting.enabled');
    if (enabled === false || (enabled !== true && (scoped?.enabled ?? custom.enabled) === false)) return lines;
    const rules = { ...custom.rules, ...scoped?.rules };
    if (!Object.keys(rules).length) return lines;
    const version = document.version;
    const [legend, tokens] = await Promise.all([
        vscode.commands.executeCommand('vscode.provideDocumentSemanticTokensLegend', document.uri),
        vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', document.uri)
    ]).catch(() => []);
    if (!legend || !tokens?.data || version !== document.version) return lines;
    const cache = new Map();
    let line = 0;
    let start = 0;
    for (let index = 0; index + 4 < tokens.data.length; index += 5) {
        const delta = tokens.data[index];
        line += delta;
        start = (delta ? 0 : start) + tokens.data[index + 1];
        const length = tokens.data[index + 2];
        const typeIndex = tokens.data[index + 3];
        const mask = tokens.data[index + 4];
        const type = legend.tokenTypes[typeIndex];
        if (!type || !length || line >= document.lineCount) continue;
        const key = `${typeIndex}:${mask}`;
        if (!cache.has(key)) {
            const modifiers = legend.tokenModifiers.filter((_, bit) => bit < 32 && (mask & (1 << bit)) !== 0);
            const css = resolveStyle(rules, type, modifiers, document.languageId);
            if (css && !styles.has(css)) styles.set(css, `semantic-${styles.size}`);
            cache.set(key, styles.get(css));
        }
        const className = cache.get(key);
        if (!className) continue;
        if (!lines.has(line)) lines.set(line, []);
        lines.get(line).push({ start, end: start + length, className });
    }
    return lines;
}

module.exports = { semanticLines };
