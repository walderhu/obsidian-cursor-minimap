module.exports = {
    async openHelperForLeaf(leaf) {
        if (!leaf) return;
        if (this.helperLeafIds.has(leaf.id)) return;
        if ([...this.helperLeafIds.values()].includes(leaf.id)) return;

        const file = leaf.view.file;
        if (!file) return;

        const rightLeaf = this.app.workspace.getRightLeaf(false);
        this.helperLeafIds.set(leaf.id, rightLeaf.id);

        if (rightLeaf.tabHeaderEl) {
            rightLeaf.tabHeaderEl.style.setProperty("display", "none", "important");
        }

        this.updateHelperForLeaf(leaf);
    },

    detachRedundantHelperLeavesAndRestoreMissing() {
        if (this._updatingHelperLeaves) return;
        this._updatingHelperLeaves = true;
        try {
            this.helperLeafIds.forEach((helperLeafId, originalLeafId) => {
                if (this.app.workspace.getLeafById(originalLeafId)) {
                    if (!this.app.workspace.getLeafById(helperLeafId)) {
                        this.helperLeafIds.delete(originalLeafId);
                        const originalLeaf =
                            this.app.workspace.getLeafById(originalLeafId);
                        this.openHelperForLeaf(originalLeaf);
                    }
                } else {
                    const helperLeaf = this.app.workspace.getLeafById(helperLeafId);
                    if (helperLeaf) helperLeaf.detach();
                    this.helperLeafIds.delete(originalLeafId);
                }
            });
        } finally {
            this._updatingHelperLeaves = false;
        }
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

        const newState = leaf.view.getState();
        await helperLeaf.setViewState({
            type: "markdown",
            state: newState,
        });
    },
};
