const { renderEditMode, renderReadMode } = require("./renderers");

module.exports = {
    getCurrentFile() {
        const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
        const view = leaves.map(l => l.view).find(v => v.contentEl === this.element);
        return view?.file || null;
    },

    async updateIframe(noteContent) {
        if (this.isUpdatingIframe) {
            this.needsIframeUpdate = true;
            return;
        }

        this.isUpdatingIframe = true;

        try {
            if (!noteContent) {
                const currentFile = this.getCurrentFile();
                const mtime = currentFile?.stat?.mtime;
                const cache = this.plugin.snapshotCache;

                // 1. memory cache hit
                if (cache.html && currentFile && cache.filePath === currentFile.path && cache.mtime === mtime) {
                    if (this.iframe && cache.html !== this.lastIframeHTML) {
                        this.lastIframeHTML = cache.html;
                        this.hasMeasuredIframeHeight = false;
                        this.iframe.srcdoc = cache.html;
                    }
                    return;
                }

                // 2. disk cache hit
                if (currentFile && mtime) {
                    const diskHtml = await this.plugin.loadFromDiskCache(currentFile.path, mtime);
                    if (diskHtml) {
                        this.plugin.snapshotCache = { filePath: currentFile.path, mtime, html: diskHtml };
                        if (this.iframe && diskHtml !== this.lastIframeHTML) {
                            this.lastIframeHTML = diskHtml;
                            this.hasMeasuredIframeHeight = false;
                            this.iframe.srcdoc = diskHtml;
                        }
                        return;
                    }
                }

                noteContent = await this.getFullHTML();
            }
            if (!noteContent) return;

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

            const html = `
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

            if (this.iframe && html !== this.lastIframeHTML) {
                this.lastIframeHTML = html;
                this.hasMeasuredIframeHeight = false;
                this.iframe.srcdoc = html;
                const cacheFile = this.getCurrentFile();
                const cacheMtime = cacheFile?.stat?.mtime || null;
                this.plugin.snapshotCache = {
                    filePath: cacheFile?.path || null,
                    mtime: cacheMtime,
                    html,
                };
                this.plugin.saveToDiskCache(cacheFile?.path, cacheMtime, html);
            }
        } finally {
            this.isUpdatingIframe = false;
            if (this.needsIframeUpdate) {
                this.needsIframeUpdate = false;
                window.setTimeout(() => this.updateIframe(), 0);
            }
        }
    },

    async prerenderForCache() {
        if (this.isUpdatingIframe) return;
        const currentFile = this.getCurrentFile();
        if (!currentFile) return;

        const noteContent = await renderReadMode(this.plugin, this.element);
        if (!noteContent) return;

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

        const html = `
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

        const cacheMtime = currentFile.stat?.mtime || null;
        this.plugin.snapshotCache = {
            filePath: currentFile.path,
            mtime: cacheMtime,
            html,
        };
        this.plugin.saveToDiskCache(currentFile.path, cacheMtime, html);
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
        if (!this.isReadModeActive()) return null;
        return await renderReadMode(this.plugin, this.element);
    },
};
