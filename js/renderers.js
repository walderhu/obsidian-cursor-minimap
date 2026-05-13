const { MarkdownRenderer, MarkdownView } = require("obsidian");
const { sleep } = require("./utils");

function getMarkdownViewForElement(plugin, sourceElement) {
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    return (
        plugin.app.workspace
            .getLeavesOfType("markdown")
            .map((leaf) => leaf.view)
            .find((view) => view.contentEl === sourceElement) || activeView
    );
}

async function renderMarkdownDocument(plugin, sourceElement) {
    const matchingView = getMarkdownViewForElement(plugin, sourceElement);
    const file = matchingView?.file || plugin.app.workspace.getActiveFile();
    if (!file) return null;

    const noteContent = document.createElement("div");
    noteContent.className = "markdown-reading-view";
    const preview = document.createElement("div");
    preview.className = "markdown-preview-view markdown-rendered";
    const destination = document.createElement("div");
    destination.className = "markdown-preview-sizer markdown-preview-section";
    preview.appendChild(destination);
    noteContent.appendChild(preview);

    const markdown =
        typeof matchingView?.getViewData === "function"
            ? await matchingView.getViewData()
            : await plugin.app.vault.read(file);
    await MarkdownRenderer.render(
        plugin.app,
        markdown,
        destination,
        file.path,
        plugin
    );
    return noteContent;
}

async function renderReadMode(plugin, sourceElement) {
    return await renderMarkdownDocument(plugin, sourceElement);
}

async function renderEditMode(plugin, sourceElement, helperElement, scroller) {
    const renderedDocument = await renderMarkdownDocument(plugin, sourceElement);
    if (renderedDocument) return renderedDocument;

    let noteContent;
    if (helperElement) {
        noteContent = helperElement.cloneNode(true);
    } else {
        const sizer = scroller.firstChild;
        const element = scroller.parentElement.parentElement.parentElement;
        sizer.style = "transform-origin: top right; scale: .1;";
        element.offsetWidth;
        await sleep(10);

        noteContent = element.cloneNode(true);
        sizer.style = "";
    }

    noteContent.querySelectorAll(".cm-sizer").forEach((el) => {
        el.style = "";
    });
    noteContent
        .querySelectorAll(".markdown-source-view > :not(.cm-editor)")
        .forEach((el) => el.remove());

    return noteContent;
}

module.exports = {
    renderEditMode,
    renderReadMode,
};
