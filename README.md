# Reference Tabs

Browse semantic references in the VS Code bottom panel. The left pane groups references in a collapsible directory tree. The right pane shows a scrollable source preview with Go and C# syntax highlighting.

Put the cursor on a symbol, then run **Find All References in Panel** from the Command Palette or editor context menu. Click a reference to preview it, or double-click to open the source editor. The active language extension supplies the references; this is not a text search. For Go and C#, install their respective language extensions and open the relevant workspace.

To try the extension from a local checkout, open the folder with `code --extensionDevelopmentPath="$(pwd)"` and then open a workspace in the development window.

Licensed under [MIT](LICENSE).
