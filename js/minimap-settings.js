const { toRGBAAlpha } = require("./utils");

module.exports = {
    updateSettings(settings) {
        this.scale = settings.scale;
        this.minimapOpacity = settings.minimapOpacity;
        this.sliderOpacity = settings.sliderOpacity;
        this.topOffset = settings.topOffset;

        this.backgroundColor = toRGBAAlpha(
            document
                .querySelector(".view-content")
                .getCssPropertyValue("background-color"),
            this.minimapOpacity
        );

        if (this.iframe && this.slider) {
            this.updateSettingsInCSS();
            this.onResize();
            this.updateIframe();
            this.updateSliderScroll();
        }
    },

    updateSettingsInCSS() {
        if (this.container) {
            this.container.style.setProperty("--scale", this.scale);
            this.container.style.setProperty(
                "--y-scale",
                this.yScale || this.scale
            );
        }
        if (this.slider) this.slider.style.opacity = this.sliderOpacity;
        if (this.iframe) this.iframe.style.top = `${this.topOffset}px`;
        this.updateReservedWidth();
    },
};
