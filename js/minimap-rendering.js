const { renderEditMode, renderReadMode } = require("./renderers");

module.exports = {
    async updateIframe(noteContent) {
        if (this.isUpdatingIframe) {
            this.needsIframeUpdate = true;
            return;
        }

        this.isUpdatingIframe = true;

        try {
            if (!noteContent) noteContent = await this.getFullHTML();
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
        .cursor-minimap-bottom-overscroll {
            height: ${bottomOverscrollHeight}px;
            background: #161616;
            flex: 0 0 auto;
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
            }
        } finally {
            this.isUpdatingIframe = false;
            if (this.needsIframeUpdate) {
                this.needsIframeUpdate = false;
                window.setTimeout(() => this.updateIframe(), 0);
            }
        }
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
        if (this.isReadModeActive()) {
            return await renderReadMode(this.plugin, this.element);
        }
        return await renderEditMode(
            this.plugin,
            this.element,
            this.helperElement,
            this.scroller
        );
    },
};
