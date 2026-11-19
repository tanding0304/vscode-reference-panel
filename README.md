# Reference Panel

Find semantic references without leaving your editor. Reference Panel opens in the VS Code bottom panel, with a collapsible directory tree on the left and a scrollable full-file preview on the right.

## Install

Install [Reference Panel from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=tanding0304.vscode-reference-panel), or run `code --install-extension tanding0304.vscode-reference-panel`.

## Use

1. Place the cursor on a symbol and run **Find All References in Panel** from the Command Palette or the editor context menu.
2. Expand directories and files to browse references. Click a result to preview it, or double-click to jump to the original source.

References come from your language extension, not a text search. The preview applies matching VS Code semantic color customizations when the language extension supplies semantic tokens. Go and C# also have built-in syntax highlighting as a fallback. The preview does not reproduce all native editor theme colors.

## Develop locally

From a checkout, run `npm ci`, then `code --extensionDevelopmentPath="$(pwd)"`. Open a project in the Extension Development Host to try the command.

Licensed under [MIT](LICENSE).
