const { MarkdownView, debounce } = require("obsidian");
const MinimapSettingTab = require("./settings-tab");
const { throttle } = require("./utils");

module.exports = {
    async onload() {
        console.log("NoteMinimap Loaded");
        this.snapshotCache = { filePath: null, mtime: null, html: null };

        const resized = new Set();
        const resize = throttle(() => {
            for (const el of resized) {
                for (const [element, note] of this.minimapInstances.entries()) {
                    if (element === el) {
                        note.onResize();
                        break;
                    }
                }
            }
            resized.clear();
        }, 1000);

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) resized.add(entry.target);
            resize();
        });

        this.modeObserver = new MutationObserver((entries) => {
            const entry = entries[0];
            const noteInstance = this.minimapInstances.get(
                entry.target.parentElement
            );
            if (entry.attributeName === "style") noteInstance?.modeChange();
            this.updateElementMinimap();
        });

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (newActiveLeaf) => {
                if (!newActiveLeaf?.view) return;
                this.checkAndDealWithUserOpeningHelperLeaves(newActiveLeaf);
                this.updateElementMinimap();
                this.activeNoteView = newActiveLeaf.view;
                this.updateElementMinimap();

                if (newActiveLeaf?.view?.getViewType() === "markdown") {
                    if (this.settings.betterRendering) this.openHelperForLeaf(newActiveLeaf);
                    this.addToggleButtonToLeaf(newActiveLeaf);
                }
            })
        );

        this.debouncedUpdateMinimap = debounce(
            () => this.updateElementMinimap(),
            700,
            false
        );
        this.registerEvent(
            this.app.workspace.on("editor-change", this.debouncedUpdateMinimap)
        );
        this.registerEvent(
            this.app.vault.on("modify", async (file) => {
                const leaf = this.app.workspace.getLeavesOfType("markdown")
                    .find(l => l.view.file?.path === file.path);
                if (!leaf) return;
                const minimap = this.minimapInstances.get(leaf.view.contentEl);
                if (minimap) await minimap.prerenderForCache();
            })
        );
        this.registerDomEvent(document, "click", (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (
                target.closest(
                    ".callout-title, .collapse-indicator, .task-kanban-inline-action, .heading-collapse-indicator"
                )
            ) {
                window.setTimeout(() => {
                    this.snapshotCache = { filePath: null, mtime: null, html: null };
                    const activeEl = this.activeNoteView?.contentEl;
                    if (activeEl) {
                        const minimap = this.minimapInstances.get(activeEl);
                        if (minimap) {
                            minimap.lastIframeHTML = "";
                            minimap.onResize();
                        }
                    }
                    this.updateElementMinimap();
                }, 250);
            }
        }, true);

        const updateHelpers = throttle(() => {
            this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
                this.updateHelperForLeaf(leaf);
            });
            this.updateElementMinimap();
        }, 500);

        this.registerLayoutChangeHandler(updateHelpers);

        await this.loadSettings();
        this.addSettingTab(new MinimapSettingTab(this));
        this.app.workspace.onLayoutReady(() => {
            this.activeNoteView =
                this.app.workspace.getActiveViewOfType(MarkdownView);
            this.injectMinimapIntoAllNotes();
        });
    },

    registerLayoutChangeHandler(updateHelpers) {
        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                if (this.settings.betterRendering) {
                    this.detachRedundantHelperLeavesAndRestoreMissing();
                    updateHelpers();
                }

                this.minimapInstances
                    .get(this.activeNoteView?.contentEl)
                    ?.onResize();

                const openEls = new Set(
                    this.app.workspace
                        .getLeavesOfType("markdown")
                        .map((leaf) => leaf.view.contentEl)
                );
                for (const [el, note] of this.minimapInstances.entries()) {
                    if (!openEls.has(el)) {
                        note.destroy();
                        this.minimapInstances.delete(el);
                        this.resizeObserver.unobserve(el);
                    }
                }
            })
        );
    },

    onunload() {
        if (this.debouncedUpdateMinimap?.cancel) {
            this.debouncedUpdateMinimap.cancel();
        }

        this.minimapInstances.forEach((noteInstance) => noteInstance.destroy());
        this.resizeObserver.disconnect();
        this.modeObserver.disconnect();

        document
            .querySelectorAll(".minimap-toggle-button")
            .forEach((button) => button.remove());
        this.detachAllHelperLeaves();

        console.log("NoteMinimap Unloaded");
    },
};
