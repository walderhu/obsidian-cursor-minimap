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
                "Use a hidden helper note to render the minimap, improving flickering and consistent loading. Changing this will trigger a plugin restart"
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
                        new Notice(
                            "Note Minimap: Restarted plugin for Better Rendering change.",
                            3000
                        );
                    });
            });

        this.addSliderSetting(
            "Scale",
            "Content zoom level. Higher = larger text, fewer lines visible. Does not affect column width (use Fixed Width for that)",
            "scale",
            0.05,
            0.3,
            0.01
        );
        this.addSliderSetting(
            "Fixed Width (px)",
            "Fixed minimap width in pixels. 0 = auto (uses Scale setting)",
            "minimapWidth",
            0,
            400,
            1
        );
        this.addSliderSetting(
            "Opacity",
            "Change the minimap's background opacity (0.05 - 1)",
            "minimapOpacity",
            0.05,
            1,
            0.01
        );
        this.addSliderSetting(
            "Slider Opacity",
            "Change the slider opacity (0.05 - 1)",
            "sliderOpacity",
            0.05,
            1,
            0.01
        );
        this.addSliderSetting(
            "Top Offset",
            "Offset the minimap from the top (pixels) - for special plugin toolbars",
            "topOffset",
            0,
            100,
            1
        );
    }

    addSliderSetting(name, description, key, min, max, step) {
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(description)
            .addSlider((slider) => {
                slider
                    .setLimits(min, max, step)
                    .setValue(this.plugin.settings[key])
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings[key] = value;
                        this.plugin.saveSettings();
                    });
            });
    }
}

module.exports = MinimapSettingTab;
