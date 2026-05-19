const CACHE_SUBDIR = "temp";

module.exports = {
    async initDiskCache() {
        this._cacheDir = `${this.manifest.dir}/${CACHE_SUBDIR}`;
        if (!await this.app.vault.adapter.exists(this._cacheDir)) {
            await this.app.vault.adapter.mkdir(this._cacheDir);
        }
        this.cleanupDiskCache().catch(() => {});
    },

    _getCacheKey(filePath) {
        return encodeURIComponent(filePath);
    },

    async loadFromDiskCache(filePath, mtime) {
        if (!this._cacheDir || !filePath || !mtime) return null;
        try {
            const key = this._getCacheKey(filePath);
            const metaPath = `${this._cacheDir}/${key}.json`;
            if (!await this.app.vault.adapter.exists(metaPath)) return null;
            const meta = JSON.parse(await this.app.vault.adapter.read(metaPath));
            if (meta.mtime !== mtime) return null;
            const htmlPath = `${this._cacheDir}/${key}.html`;
            if (!await this.app.vault.adapter.exists(htmlPath)) return null;
            return await this.app.vault.adapter.read(htmlPath);
        } catch {
            return null;
        }
    },

    saveToDiskCache(filePath, mtime, html) {
        if (!this._cacheDir || !filePath || !mtime || !html) return;
        const key = this._getCacheKey(filePath);
        this.app.vault.adapter
            .write(`${this._cacheDir}/${key}.json`, JSON.stringify({ filePath, mtime }))
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
