# Agent Notes

## Cursor Minimap Build Rule

This Obsidian plugin is edited as small semantic source files, but Obsidian loads the generated root files.

- Edit JavaScript source in `js/*.js`, not the generated root `main.js`.
- Edit CSS source in `styles/*.css`, not the generated root `styles.css`.
- After changing anything under `js/` or `styles/`, run `node build.js`.
- `build.js` regenerates `main.js` and `styles.css` so Obsidian can load the plugin without local runtime `require("./js/...")` or CSS `@import` issues.
- Before handing off changes, check at least `node --check main.js` and `node --check build.js`; for JS source edits, also run `for f in js/*.js; do node --check "$f" || exit 1; done`.
- Do not push to git remotes unless the user explicitly asks for or approves that push in the current conversation.
