module.exports = {
    async loadSettings() {
        this.settings = Object.assign(
            {
                enabledByDefault: true,
                betterRendering: true,
                scale: 0.12,
                minimapWidth: 0,
                minimapOpacity: 0.3,
                sliderOpacity: 0.3,
                topOffset: 0,
            },
            await this.loadData()
        );

        if (!Number.isFinite(this.settings.scale)) {
            this.settings.scale = 0.12;
        }
    },

    async saveSettings() {
        await this.saveData(this.settings);

        for (const note of this.minimapInstances.values()) {
            note.updateSettings(this.settings);
        }
    },

    getStylesHTML() {
        if (this.stylesHTMLCache) return this.stylesHTMLCache;

        const styleElements = Array.from(
            document.head.querySelectorAll('style, link[rel="stylesheet"]')
        );
        this.stylesHTMLCache = styleElements.map((el) => el.outerHTML).join("\n");
        return this.stylesHTMLCache;
    },

    getCssVars() {
        if (this.cssVarsCache) return this.cssVarsCache;

        const rootStyles = getComputedStyle(document.body);
        let cssVars = ":root {\n";
        for (let i = 0; i < rootStyles.length; i++) {
            const prop = rootStyles[i];
            if (prop.startsWith("--")) {
                cssVars += `  ${prop}: ${rootStyles.getPropertyValue(prop)};\n`;
            }
        }
        cssVars += "}\n::-webkit-scrollbar { display: none; }";
        this.cssVarsCache = cssVars;
        return cssVars;
    },
};
