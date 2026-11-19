const vscode = require('vscode');
const highlighter = require('highlight.js/lib/core');
const viewId = 'referenceTabs.results';
let resultsView;
let currentResults;
highlighter.registerLanguage('go', require('highlight.js/lib/languages/go'));
highlighter.registerLanguage('csharp', require('highlight.js/lib/languages/csharp'));

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function highlight(text, language) {
    return language && highlighter.getLanguage(language)
        ? highlighter.highlight(text, { language, ignoreIllegals: true }).value
        : escapeHtml(text);
}

async function showReferences() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const { document, selection } = editor;
    const position = selection.active;
    const word = document.getWordRangeAtPosition(position);
    const symbol = word ? document.getText(word) : 'Symbol';
    const locations = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window, title: `Finding references: ${symbol}`
    }, () => vscode.commands.executeCommand('vscode.executeReferenceProvider', document.uri, position));
    if (!locations?.length) {
        vscode.window.showInformationMessage(`No references found for ${symbol}.`);
        return;
    }

    const groups = new Map();
    const targets = [];
    for (const location of locations) {
        const key = location.uri.toString();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(location);
    }
    const sections = await Promise.all([...groups.values()].map(async group => {
        const uri = group[0].uri;
        const source = await vscode.workspace.openTextDocument(uri).then(doc => doc, () => undefined);
        const hits = new Map();
        for (const location of group.sort((left, right) => left.range.start.compareTo(right.range.start))) {
            const { line, character } = location.range.start;
            const index = targets.push(location) - 1;
            if (!hits.has(line)) hits.set(line, []);
            hits.get(line).push({ index, character, end: location.range.end });
        }
        const preview = () => {
            const rows = [];
            const lines = source ? new Set([...Array(source.lineCount).keys(), ...hits.keys()]) : hits.keys();
            for (const line of lines) {
                const text = source && line < source.lineCount ? source.lineAt(line).text : '';
                const matches = hits.get(line) ?? [];
                let offset = 0;
                let content = '';
                for (const { index, character, end } of matches) {
                    const start = Math.max(offset, Math.min(text.length, character));
                    const stop = end.line === line ? Math.max(start, Math.min(end.character, text.length)) : text.length;
                    content += highlight(text.slice(offset, start), source?.languageId);
                    content += `<button class="match" data-index="${index}" aria-label="Go to line ${line + 1}, column ${character + 1}">${escapeHtml(text.slice(start, stop)) || '↗'}</button>`;
                    offset = stop;
                }
                content += highlight(text.slice(offset), source?.languageId);
                rows.push(`<div class="row${matches.length ? ' hit' : ''}"><span class="line" aria-hidden="true">${line + 1}</span><code>${content || ' '}</code></div>`);
            }
            return `<div class="excerpt">${rows.join('')}</div>`;
        };
        const path = vscode.workspace.asRelativePath(uri, true);
        const separator = path.lastIndexOf('/');
        const languageClass = source?.languageId === 'go' ? 'go' : source?.languageId === 'csharp' ? 'csharp' : '';
        return `<section class="${languageClass}"><h2><strong>${escapeHtml(path.slice(separator + 1))}</strong><span class="path">${escapeHtml(path.slice(0, separator + 1))}</span><span class="count">${group.length}</span></h2>${preview()}</section>`;
    }));

    const nonce = require('node:crypto').randomBytes(18).toString('base64');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'">
<style nonce="${nonce}">
body{padding:0;margin:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}
header,h2{display:flex;gap:12px;align-items:baseline;padding:8px 16px;margin:0;font-size:12px;border-bottom:1px solid var(--vscode-panel-border)}
header{position:sticky;top:0;background:var(--vscode-editor-background);z-index:1}
h1{font-size:inherit;margin:0} h2{background:var(--vscode-sideBarSectionHeader-background);font-weight:normal}
.path,header span,.count{color:var(--vscode-descriptionForeground)} .path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .count{margin-left:auto}
.excerpt{overflow-x:auto;border-bottom:1px solid var(--vscode-panel-border);padding:4px 0}
.row{display:flex;min-width:max-content;font:var(--vscode-editor-font-size,13px)/1.55 var(--vscode-editor-font-family,monospace)}
.line{color:var(--vscode-editorLineNumber-foreground);text-align:right;min-width:6ch;padding-right:2ch;user-select:none}
code{font:inherit;white-space:pre;tab-size:4;padding:0 16px 0 0;background:transparent;border-radius:0} .hit{background:var(--vscode-editor-lineHighlightBackground)}
.match{font:inherit;white-space:pre;padding:0;border:0;border-radius:2px;color:inherit;background:var(--vscode-editor-findMatchHighlightBackground);cursor:pointer}
.match:hover,.match:focus-visible{outline:1px solid var(--vscode-focusBorder)}
.hljs-comment{color:#8B949E} .hljs-string{color:#6AAB73}
.go .hljs-keyword,.go .hljs-literal{color:#CF8E6D} .go .hljs-built_in,.go .hljs-type{color:#CC7832}
.go .hljs-title{color:#56A8F5} .go .hljs-number{color:#2AACB8}
.csharp .hljs-keyword,.csharp .hljs-built_in,.csharp .hljs-literal{color:#7698E8}
.csharp .hljs-type,.csharp .hljs-title.class_{color:#BE95F3} .csharp .hljs-title.function_{color:#59C5A2}
.csharp .hljs-number{color:#E695BC}
body{height:100vh;display:flex;flex-direction:column;overflow:hidden}
.layout{display:grid;grid-template-columns:minmax(0,42%) minmax(0,58%);flex:1;min-height:0}
main h2{position:sticky;top:0;z-index:1}
nav,main{overflow:auto} nav{border-right:1px solid var(--vscode-panel-border)}
summary{cursor:pointer;padding:6px 12px;background:var(--vscode-sideBarSectionHeader-background)}
nav details details{margin-left:12px}
.reference{display:block;width:100%;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:0;background:transparent;color:inherit;padding:4px 12px 4px 24px;cursor:pointer}
.reference:hover{background:var(--vscode-list-hoverBackground)} .reference[aria-pressed=true]{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
</style></head><body><header><h1>${escapeHtml(symbol)}</h1><span>${locations.length} references · ${groups.size} files</span></header>
<div class="layout"><nav aria-label="References"></nav><main aria-label="Code preview">${sections.join('')}</main></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const navigation = document.querySelector('nav');
let selected;
function select(reference, match) {
    selected?.setAttribute('aria-pressed', 'false');
    reference.setAttribute('aria-pressed', 'true');
    selected = reference;
    document.querySelectorAll('main section').forEach(element => { element.hidden = true; });
    match.closest('section').hidden = false;
    match.closest('.row').scrollIntoView({block:'center',inline:'nearest'});
}
const folders = new Map();
for (const section of [...document.querySelectorAll('main section')].sort((left,right) => (left.querySelector('.path').textContent + left.querySelector('strong').textContent).localeCompare(right.querySelector('.path').textContent + right.querySelector('strong').textContent))) {
    let parent = navigation;
    for (const name of section.querySelector('.path').textContent.split('/').filter(Boolean)) {
        if (!folders.has(parent)) folders.set(parent, new Map());
        const children = folders.get(parent);
        if (!children.has(name)) {
            const folder = document.createElement('details');
            folder.open = true;
            const label = document.createElement('summary');
            label.textContent = name;
            folder.append(label);
            parent.append(folder);
            children.set(name, folder);
        }
        parent = children.get(name);
    }
    const group = document.createElement('details');
    group.open = true;
    const summary = document.createElement('summary');
    summary.textContent = section.querySelector('strong').textContent + ' · ' + section.querySelector('.count').textContent;
    summary.title = section.querySelector('.path').textContent + section.querySelector('strong').textContent;
    group.append(summary);
    for (const match of section.querySelectorAll('.match')) {
        const row = match.closest('.row');
        const reference = document.createElement('button');
        reference.className = 'reference';
        reference.textContent = row.querySelector('.line').textContent + ':  ' + row.querySelector('code').textContent.trim();
        reference.addEventListener('click', () => select(reference, match));
        reference.addEventListener('dblclick', () => vscode.postMessage(Number(match.dataset.index)));
        reference.addEventListener('keydown', event => { if (event.key === 'Enter') vscode.postMessage(Number(match.dataset.index)); });
        group.append(reference);
    }
    parent.append(group);
}
navigation.querySelector('.reference')?.click();
document.addEventListener('click', event => {
    const button = event.target.closest('button[data-index]');
    if (button) vscode.postMessage(Number(button.dataset.index));
});
</script></body></html>`;
    currentResults = { html, targets, viewColumn: editor.viewColumn };
    if (resultsView) resultsView.webview.html = html;
    await vscode.commands.executeCommand(viewId + '.focus');
}

exports.activate = context => {
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(viewId, {
        resolveWebviewView(view) {
            resultsView = view;
            view.webview.options = { enableScripts: true, localResourceRoots: [] };
            view.webview.html = currentResults?.html ?? '<p>Run Find All References in Panel to get started.</p>';
            const subscription = view.webview.onDidReceiveMessage(async index => {
                if (!Number.isInteger(index)) return;
                const location = currentResults?.targets[index];
                if (!location) return;
                try {
                    await vscode.window.showTextDocument(location.uri, {
                        viewColumn: currentResults.viewColumn, selection: location.range, preview: true
                    });
                } catch (error) {
                    vscode.window.showErrorMessage(`Could not open reference: ${error.message}`);
                }
            });
            view.onDidDispose(() => {
                subscription.dispose();
                if (resultsView === view) resultsView = undefined;
            });
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('referenceTabs.show', async () => {
        try {
            await showReferences();
        } catch (error) {
            vscode.window.showErrorMessage(`Could not find references: ${error.message}`);
        }
    }));
};
