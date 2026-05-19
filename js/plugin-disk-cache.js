const CACHE_SUBDIR = "temp";

module.exports = {
    async initDiskCache() {
        this._cacheDir = `${this.manifest.dir}/${CACHE_SUBDIR}`;
        if (!await this.app.vault.adapter.exists(this._cacheDir)) {
            await this.app.vault.adapter.mkdir(this._cacheDir);
        }
        this.cleanupDiskCache().catch(() => {});
    },

    _getCacheKey(filePath, mode = "read") {
        return `${encodeURIComponent(filePath)}.${mode}`;
    },

    async loadFromDiskCache(filePath, mode, identity = {}) {
        if (!this._cacheDir || !filePath) return null;
        try {
            const key = this._getCacheKey(filePath, mode);
            const metaPath = `${this._cacheDir}/${key}.json`;
            if (!await this.app.vault.adapter.exists(metaPath)) return null;
            const meta = JSON.parse(await this.app.vault.adapter.read(metaPath));
            if (identity.mtime && meta.mtime !== identity.mtime) return null;
            if (identity.signature && meta.signature !== identity.signature) return null;
            const htmlPath = `${this._cacheDir}/${key}.html`;
            if (!await this.app.vault.adapter.exists(htmlPath)) return null;
            return {
                html: await this.app.vault.adapter.read(htmlPath),
                meta,
            };
        } catch {
            return null;
        }
    },

    saveToDiskCache(filePath, mode, identity, html) {
        if (!this._cacheDir || !filePath || !html) return;
        const key = this._getCacheKey(filePath, mode);
        const meta = {
            filePath,
            mode,
            mtime: identity?.mtime || null,
            signature: identity?.signature || null,
            stats: identity?.stats || null,
        };
        this.app.vault.adapter
            .write(`${this._cacheDir}/${key}.json`, JSON.stringify(meta))
            .catch(() => {});
        this.app.vault.adapter
            .write(`${this._cacheDir}/${key}.html`, html)
            .catch(() => {});
    },

    async cleanupDiskCache() {
        if (!this._cacheDir) return;
        try {
            if (!await this.app.vault.adapter.exists(this._cacheDir)) return;
            const listing = await this.app.vault.adapter.list(this._cacheDir);
            for (const filePath of listing.files) {
                if (!filePath.endsWith(".json")) continue;
                try {
                    const meta = JSON.parse(await this.app.vault.adapter.read(filePath));
                    if (!this.app.vault.getAbstractFileByPath(meta.filePath)) {
                        await this.app.vault.adapter.remove(filePath);
                        const htmlPath = filePath.replace(/\.json$/, ".html");
                        if (await this.app.vault.adapter.exists(htmlPath)) {
                            await this.app.vault.adapter.remove(htmlPath);
                        }
                    }
                } catch { /* skip corrupted entries */ }
            }
        } catch { /* ignore cleanup errors */ }
    },
};
