const vscode = require('vscode');

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
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
        const rows = group.sort((left, right) => left.range.start.compareTo(right.range.start)).map(location => {
            const { line, character } = location.range.start;
            const text = source && line < source.lineCount ? source.lineAt(line).text.trim() : '';
            const index = targets.push(location) - 1;
            return `<li><button data-index="${index}"><code>${line + 1}:${character + 1}  ${escapeHtml(text)}</code></button></li>`;
        });
        return `<section><h2>${escapeHtml(vscode.workspace.asRelativePath(uri, true))}</h2><ul>${rows.join('')}</ul></section>`;
    }));

    const panel = vscode.window.createWebviewPanel('referenceTabs', `References: ${symbol}`,
        editor.viewColumn ?? vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [] });
    const nonce = require('node:crypto').randomBytes(18).toString('base64');
    panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'">
<style nonce="${nonce}">
body{padding:16px 24px} h2{font-size:1em} ul{list-style:none;padding:0}
button{display:block;width:100%;text-align:left;padding:5px 8px;border:0;background:transparent;color:inherit;cursor:pointer}
button:hover,button:focus-visible{background:var(--vscode-list-hoverBackground)} code{white-space:pre-wrap;overflow-wrap:anywhere}
</style></head><body><h1>${escapeHtml(symbol)}</h1><p>${locations.length} references in ${groups.size} files</p>
${sections.join('')}
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.addEventListener('click', event => {
    const button = event.target.closest('button[data-index]');
    if (button) vscode.postMessage(Number(button.dataset.index));
});
</script></body></html>`;
    const subscription = panel.webview.onDidReceiveMessage(async index => {
        if (!Number.isInteger(index) || !targets[index]) return;
        const { uri, range } = targets[index];
        try {
            await vscode.window.showTextDocument(uri, { viewColumn: panel.viewColumn, selection: range, preview: true });
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open reference: ${error.message}`);
        }
    });
    panel.onDidDispose(() => subscription.dispose());
}

exports.activate = context => {
    context.subscriptions.push(vscode.commands.registerCommand('referenceTabs.show', async () => {
        try {
            await showReferences();
        } catch (error) {
            vscode.window.showErrorMessage(`Could not find references: ${error.message}`);
        }
    }));
};
