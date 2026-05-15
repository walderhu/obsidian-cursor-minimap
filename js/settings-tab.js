const { Notice, PluginSettingTab, Setting } = require("obsidian");

class MinimapSettingTab extends PluginSettingTab {
    constructor(plugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Enable by default")
            .setDesc("Already opened notes will not be affected by changing this")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.enabledByDefault)
                    .onChange((value) => {
                        this.plugin.settings.enabledByDefault = value;
                        this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Better Rendering (in development)")
            .setDesc(
                "Use a hidden helper note to render the minimap, improving flickering. Changing this restarts the plugin"
            )
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.betterRendering)
                    .onChange(async (value) => {
                        this.plugin.settings.betterRendering = value;
                        await this.plugin.saveSettings();
                        await this.app.plugins.disablePlugin("cursor-minimap");
                        await this.app.plugins.enablePlugin("cursor-minimap");
                        this.app.setting.openTabById("cursor-minimap");
                        new Notice("Note Minimap: Restarted plugin for Better Rendering change.", 3000);
                    });
            });

        this.addSliderWithInput(
            "Scale",
            "Content zoom level — controls column width and text size in the minimap",
            "scale", 0.05, 0.3, 0.01,
            (v) => `${Math.round(v * 100)}%`,
            (s) => { const n = parseFloat(s); return n > 1 ? n / 100 : n; }
        );
        this.addSliderWithInput(
            "Opacity",
            "Background opacity of the minimap",
            "minimapOpacity", 0.05, 1, 0.01,
            (v) => `${Math.round(v * 100)}%`,
            (s) => { const n = parseFloat(s); return n > 1 ? n / 100 : n; }
        );
        this.addSliderWithInput(
            "Slider Opacity",
            "Opacity of the viewport indicator rectangle",
            "sliderOpacity", 0.05, 1, 0.01,
            (v) => `${Math.round(v * 100)}%`,
            (s) => { const n = parseFloat(s); return n > 1 ? n / 100 : n; }
        );
        this.addSliderWithInput(
            "Top Offset",
            "Push minimap down from the top edge (px) — for plugin toolbars",
            "topOffset", 0, 100, 1,
            (v) => `${v}px`,
            (s) => parseInt(s)
        );

    }

    addSliderWithInput(name, description, key, min, max, step, format, parse) {
        let sliderComp, textComp;
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(description)
            .addSlider((slider) => {
                sliderComp = slider;
                slider
                    .setLimits(min, max, step)
                    .setValue(this.plugin.settings[key])
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings[key] = value;
                        textComp?.setValue(format(value));
                        this.plugin.saveSettings();
                    });
            })
            .addText((text) => {
                textComp = text;
                text.setValue(format(this.plugin.settings[key]));
                text.inputEl.style.width = "58px";
                text.inputEl.style.textAlign = "right";

                const applyText = () => {
                    const parsed = parse(text.getValue());
                    if (!isFinite(parsed)) return;
                    const val = +Math.max(min, Math.min(max, parsed)).toFixed(4);
                    this.plugin.settings[key] = val;
                    sliderComp?.setValue(val);
                    text.setValue(format(val));
                    this.plugin.saveSettings();
                };
                text.inputEl.addEventListener("blur", applyText);
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") applyText();
                });
            });
    }
}

module.exports = MinimapSettingTab;
