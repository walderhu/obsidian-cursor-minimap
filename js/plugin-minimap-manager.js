const { setIcon } = require("obsidian");
const Minimap = require("./minimap");
const { sleep } = require("./utils");

module.exports = {
    injectMinimapIntoAllNotes() {
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of leaves) {
            if (this.settings.betterRendering) this.openHelperForLeaf(leaf);
            this.addToggleButtonToLeaf(leaf);
            this.updateElementMinimap(
                leaf.view.contentEl,
                this.helperLeafIds.get(leaf.id)
            );
        }
    },

    async updateElementMinimap(element, helperLeafId) {
        await sleep(100);
        const activeLeaf = this.app.workspace.activeLeaf;
        helperLeafId = activeLeaf
            ? this.helperLeafIds.get(activeLeaf.id)
            : helperLeafId;

        if (!element) {
            if (!this.activeNoteView) return;
            element = this.activeNoteView.contentEl;
        }

        if (
            !element.querySelector(".markdown-source-view") ||
            !element.querySelector(".markdown-preview-view")
        ) {
            return;
        }

        const existing = this.minimapInstances.get(element);
        const isReadMode =
            element.querySelector(".markdown-source-view")?.clientHeight === 0;

        if (!isReadMode) {
            if (existing) {
                existing.container.style.display = "none";
            }
            return;
        }

        if (element.classList.contains("minimap-disabled")) {
            if (existing) {
                existing.container.style.display = "none";
            }
            return;
        }

        if (this.minimapInstances.has(element)) {
            const noteInstance = this.minimapInstances.get(element);
            noteInstance.container.style.display = "";
            noteInstance.updateIframe();
        } else {
            const minimapInstance = new Minimap(
                this,
                element,
                this.settings,
                helperLeafId
            );
            this.minimapInstances.set(element, minimapInstance);
            this.resizeObserver.observe(element);
            this.modeObserver.observe(minimapInstance.sourceView, {
                attributes: true,
            });
        }
    },

    addToggleButtonToLeaf(leaf) {
        const viewActions = leaf.view.containerEl.querySelector(".view-actions");
        if (!viewActions) return;
        if (viewActions.querySelector(".minimap-toggle-button")) return;

        const button = document.createElement("button");
        button.className = "clickable-icon view-actions minimap-toggle-button";
        button.setAttribute("aria-label", "Toggle Minimap");
        setIcon(button, "star-list");

        const contentEl = leaf.view.contentEl;
        button.onclick = () => {
            contentEl.classList.toggle("minimap-disabled");
            this.updateElementMinimap(contentEl);
        };

        if (!this.settings.enabledByDefault) {
            contentEl.classList.add("minimap-disabled");
        }

        viewActions.prepend(button);
    },
};
