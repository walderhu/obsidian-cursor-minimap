const { renderEditMode, renderReadMode } = require("./renderers");

module.exports = {
    getCurrentFile() {
        const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
        const view = leaves.map(l => l.view).find(v => v.contentEl === this.element);
        return view?.file || null;
    },

    getCurrentView() {
        const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
        return leaves.map(l => l.view).find(v => v.contentEl === this.element) || null;
    },

    async getMarkdownText() {
        const view = this.getCurrentView();
        const file = view?.file || this.plugin.app.workspace.getActiveFile();
        if (typeof view?.getViewData === "function") {
            return await view.getViewData();
        }
        return file ? await this.plugin.app.vault.read(file) : "";
    },

    getSnapshotStats(markdown) {
        const text = markdown || "";
        return {
            length: text.length,
            lineCount: text.length ? text.split("\n").length : 0,
            lengthBucket: Math.floor(text.length / 50),
        };
    },

    getStatsSignature(stats) {
        return `${stats.lineCount}:${stats.lengthBucket}`;
    },

    shouldRefreshForStats(stats, mode = this.getMode()) {
        const currentFile = this.getCurrentFile();
        const filePath = currentFile?.path || null;
        const previous = this.plugin.getSnapshotIdentity?.(filePath, mode)?.stats;
        if (!previous) return true;
        return (
            previous.lineCount !== stats.lineCount ||
            previous.lengthBucket !== stats.lengthBucket
        );
    },

    async refreshAfterEditorChange() {
        const markdown = await this.getMarkdownText();
        const stats = this.getSnapshotStats(markdown);
        if (!this.shouldRefreshForStats(stats, "edit")) {
            this.updateSliderScroll();
            return;
        }

        await this.refreshSnapshotsForModes(["edit", "read"], stats);
    },

    async refreshSnapshotsForModes(modes, stats = null) {
        const activeMode = this.getMode();
        for (const mode of modes) {
            const noteContent = await this.renderSnapshotContent(mode);
            if (!noteContent) continue;
            const html = this.buildSnapshotHTML(noteContent);
            this.commitSnapshotHTML(mode, html, stats);
            if (mode === activeMode) {
                this.applyIframeHTML(html);
            }
        }
    },

    async renderSnapshotContent(mode = this.getMode()) {
        if (mode === "edit") {
            return await renderEditMode(
                this.plugin,
                this.element,
                this.helperElement,
                this.scroller
            );
        }
        return await renderReadMode(this.plugin, this.element);
    },

    async updateIframe(noteContent) {
        if (this.isUpdatingIframe) {
            this.needsIframeUpdate = true;
            return;
        }

        this.isUpdatingIframe = true;

        let snapshotStats = null;
        try {
            if (!noteContent) {
                const currentFile = this.getCurrentFile();
                const mtime = currentFile?.stat?.mtime;
                const mode = this.getMode();
                const markdown = await this.getMarkdownText();
                const stats = this.getSnapshotStats(markdown);
                snapshotStats = stats;
                const identity = {
                    mtime,
                    signature: mode === "edit" ? this.getStatsSignature(stats) : null,
                    stats,
                };
                const cache = this.plugin.getSnapshotCache(currentFile?.path, mode);

                // 1. memory cache hit
                if (cache?.html && currentFile && this.plugin.isSnapshotCacheFresh(cache, identity)) {
                    this.applyIframeHTML(cache.html);
                    return;
                }

                // 2. disk cache hit
                if (currentFile) {
                    const diskCache = await this.plugin.loadFromDiskCache(currentFile.path, mode, identity);
                    if (diskCache) {
                        this.plugin.setSnapshotCache(currentFile.path, mode, {
                            ...diskCache.meta,
                            html: diskCache.html,
                        });
                        this.applyIframeHTML(diskCache.html);
                        return;
                    }
                }

                noteContent = await this.renderSnapshotContent(mode);
            }
            if (!noteContent) return;

            const html = this.buildSnapshotHTML(noteContent);
            this.applyIframeHTML(html);
            this.commitSnapshotHTML(this.getMode(), html, snapshotStats);
        } finally {
            this.isUpdatingIframe = false;
            if (this.needsIframeUpdate) {
                this.needsIframeUpdate = false;
                window.setTimeout(() => this.updateIframe(), 0);
            }
        }
    },

    buildSnapshotHTML(noteContent) {
        noteContent
            .querySelectorAll(".minimap-frame, .minimap-slider")
            .forEach((el) => el.remove());
        this.syncTaskKanbanCollapse(noteContent);

        const stylesHTML = this.plugin.getStylesHTML();
        const themeClass = document.body.classList.contains("theme-dark")
            ? "theme-dark"
            : "theme-light";
        const cssVars = this.plugin.getCssVars();
        const sizerHeight =
            this.scroller?.firstChild?.getBoundingClientRect().height || 0;
        const scrollHeight = this.scroller?.scrollHeight || 0;
        const bottomOverscrollHeight = Math.max(
            0,
            this.bottomOverscrollHeight || scrollHeight - sizerHeight
        );
        this.bottomOverscrollHeight = bottomOverscrollHeight;

        return `
		<!DOCTYPE html>
		<html>
		<head>${stylesHTML}<style>${cssVars}
        body { display: flex; flex-direction: column; min-height: 100%; }
        .cursor-minimap-bottom-overscroll {
            flex: 1 0 auto;
            min-height: ${bottomOverscrollHeight}px;
            background: #161616;
        }
        .markdown-reading-view,
        .markdown-preview-view,
        .markdown-preview-sizer,
        .markdown-preview-section {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
        }
        </style></head>
		<body style="background-color:${this.backgroundColor}" class="${themeClass} show-inline-title">${noteContent.innerHTML}<div class="cursor-minimap-bottom-overscroll"></div></body>
		</html>
	`;
    },

    applyIframeHTML(html) {
        if (this.iframe && html !== this.lastIframeHTML) {
            this.lastIframeHTML = html;
            this.hasMeasuredIframeHeight = false;
            this.iframe.srcdoc = html;
        }
    },

    commitSnapshotHTML(mode, html, stats = null) {
        const cacheFile = this.getCurrentFile();
        const cacheMtime = cacheFile?.stat?.mtime || null;
        const identityStats = stats || { length: 0, lineCount: 0, lengthBucket: 0 };
        const identity = {
            mtime: cacheMtime,
            signature: mode === "edit" ? this.getStatsSignature(identityStats) : null,
            stats: identityStats,
        };
        this.plugin.setSnapshotCache(cacheFile?.path, mode, {
            filePath: cacheFile?.path || null,
            mode,
            ...identity,
            html,
        });
        this.plugin.saveToDiskCache(cacheFile?.path, mode, identity, html);
    },

    async prerenderForCache() {
        if (this.isUpdatingIframe) return;
        const currentFile = this.getCurrentFile();
        if (!currentFile) return;

        const markdown = await this.getMarkdownText();
        const stats = this.getSnapshotStats(markdown);
        await this.refreshSnapshotsForModes(["read", "edit"], stats);
    },

    onIframeLoad() {
        const body = this.iframe?.contentDocument?.body;
        if (!body || !this.visibleHeight) return;
        const sizer = body.querySelector(".markdown-preview-sizer");
        const contentElement = sizer || body;
        const contentRect = contentElement.getBoundingClientRect();
        const overscroll = body.querySelector(".cursor-minimap-bottom-overscroll");
        const overscrollHeight = overscroll?.getBoundingClientRect().height || 0;
        const iframeContentHeight =
            Math.max(contentElement.scrollHeight || 0, contentRect.height || 0) +
            overscrollHeight;

        if (Math.abs(iframeContentHeight - (this.fullHeight || 0)) > 2) {
            this.documentHeight = iframeContentHeight;
            this.hasMeasuredIframeHeight = true;
            this.resize(iframeContentHeight, this.visibleHeight);
        } else {
            this.hasMeasuredIframeHeight = true;
        }
    },

    syncTaskKanbanCollapse(noteContent) {
        const collapsed = this.isTaskKanbanCollapsedInSource();
        const kanbanCallouts = Array.from(
            noteContent.querySelectorAll(".callout")
        ).filter((callout) => {
            const dataCallout = callout.getAttribute("data-callout") || "";
            return (
                dataCallout === "todo" ||
                dataCallout === "task-kanban" ||
                !!callout.querySelector(
                    ".task-kanban-inline-marker, .task-kanban-inline-card"
                ) ||
                /Task Kanban/i.test(callout.textContent || "")
            );
        });

        for (const callout of kanbanCallouts) {
            callout.classList.toggle("is-collapsed", collapsed);
            callout.setAttribute("data-callout-fold", collapsed ? "-" : "+");
            const content = callout.querySelector(".callout-content");
            if (content) {
                content.style.display = collapsed ? "none" : "";
                content.toggleAttribute("hidden", collapsed);
            }
        }
    },

    isTaskKanbanCollapsedInSource() {
        return !!this.element.querySelector(
            ".callout.is-collapsed:has(.task-kanban-inline-marker), .callout[data-callout-fold='-']:has(.task-kanban-inline-marker), .callout.is-collapsed[data-callout='todo'], .callout[data-callout-fold='-'][data-callout='todo'], .callout.is-collapsed[data-callout='task-kanban'], .callout[data-callout-fold='-'][data-callout='task-kanban']"
        );
    },

    async getFullHTML() {
        return await this.renderSnapshotContent(this.getMode());
    },
};
