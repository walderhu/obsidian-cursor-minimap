const { Notice } = require("obsidian");
const { sleep } = require("./utils");

module.exports = {
    async openHelperForLeaf(leaf) {
        if (!leaf) return;
        if (this.helperLeafIds.has(leaf.id)) return;
        if ([...this.helperLeafIds.values()].includes(leaf.id)) return;

        const file = leaf.view.file;
        if (!file) return;

        const rightLeaf = this.app.workspace.getRightLeaf(false);
        this.helperLeafIds.set(leaf.id, rightLeaf.id);
        this.updateHelperForLeaf(leaf);
    },

    detachRedundantHelperLeavesAndRestoreMissing() {
        this.helperLeafIds.forEach((helperLeafId, originalLeafId) => {
            if (this.app.workspace.getLeafById(originalLeafId)) {
                if (!this.app.workspace.getLeafById(helperLeafId)) {
                    this.helperLeafIds.delete(originalLeafId);
                    const originalLeaf =
                        this.app.workspace.getLeafById(originalLeafId);
                    this.openHelperForLeaf(originalLeaf);
                    new Notice(
                        "Note Minimap: This is a helper note used for Better Rendering - avoid touching it!",
                        4000
                    );
                }
            } else {
                const helperLeaf = this.app.workspace.getLeafById(helperLeafId);
                if (helperLeaf) helperLeaf.detach();
                this.helperLeafIds.delete(originalLeafId);
            }
        });
    },

    checkAndDealWithUserOpeningHelperLeaves(newActiveLeaf) {
        if (
            newActiveLeaf?.id &&
            [...this.helperLeafIds.values()].includes(newActiveLeaf.id)
        ) {
            newActiveLeaf.detach();
        }
    },

    detachAllHelperLeaves() {
        this.helperLeafIds.forEach((helperLeafId) => {
            this.app.workspace.getLeafById(helperLeafId)?.detach();
        });
    },

    async updateHelperForLeaf(leaf) {
        const helperLeaf = this.app.workspace.getLeafById(
            this.helperLeafIds.get(leaf?.id)
        );
        if (!helperLeaf) return;

        const oldState = helperLeaf.view.getState();
        const newState = leaf.view.getState();
        await helperLeaf.setViewState({
            type: "markdown",
            state: newState,
        });
        if (oldState.file !== newState.file) {
            await this.initialForceloadContentInMarkdownView(helperLeaf.view);
        }
    },

    async initialForceloadContentInMarkdownView(view) {
        if (view?.getViewType() !== "markdown") return;
        view.contentEl
            .querySelectorAll(".markdown-preview-sizer, .cm-sizer")
            .forEach((el) => {
                el.style = "transform-origin: top right; scale: .1;";
            });
        const data = await view.getViewData();
        await view.clear();
        await sleep(100);
        await view.setViewData(data);
    },
};
