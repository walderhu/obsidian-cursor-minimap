const minimapSettingsMethods = require("./minimap-settings");
const minimapLayoutMethods = require("./minimap-layout");
const minimapRenderingMethods = require("./minimap-rendering");
const minimapScrollMethods = require("./minimap-scroll");

class Minimap {
    minimapScrollOffset = 0;

    constructor(plugin, element, settings, helperLeafId) {
        this.plugin = plugin;
        this.element = element;
        this.helperLeafId = helperLeafId;
        this.helperElement =
            plugin.app.workspace.getLeafById(helperLeafId)?.view?.contentEl;
        this.lastIframeHTML = "";
        this.sourceView = element.querySelector(".markdown-source-view");

        this.updateSliderScroll = this.updateSliderScroll.bind(this);
        this.onSliderMouseDown = this.onSliderMouseDown.bind(this);
        this.onSliderMouseMove = this.onSliderMouseMove.bind(this);
        this.onSliderMouseUp = this.onSliderMouseUp.bind(this);
        this.onMinimapMouseDown = this.onMinimapMouseDown.bind(this);
        this.onMinimapDragMove = this.onMinimapDragMove.bind(this);
        this.onMinimapDragUp = this.onMinimapDragUp.bind(this);
        this.onMinimapWheel = this.onMinimapWheel.bind(this);
        this.onIframeLoad = this.onIframeLoad.bind(this);

        this.modeChange();
        this.setupElements();
        this.updateSettings(settings);

        this.scroller.addEventListener("scroll", this.updateSliderScroll);
        this.slider.addEventListener("mousedown", this.onSliderMouseDown);
        this.container.addEventListener("mousedown", this.onMinimapMouseDown);
        this.container.addEventListener("wheel", this.onMinimapWheel, {
            passive: false,
        });
    }

    destroy() {
        this.scroller.removeEventListener("scroll", this.updateSliderScroll);
        this.slider.removeEventListener("mousedown", this.onSliderMouseDown);
        this.iframe?.removeEventListener("load", this.onIframeLoad);
        this.container.removeEventListener("mousedown", this.onMinimapMouseDown);
        this.container.removeEventListener("wheel", this.onMinimapWheel);
        document.removeEventListener("mousemove", this.onSliderMouseMove);
        document.removeEventListener("mouseup", this.onSliderMouseUp);
        document.removeEventListener("mousemove", this.onMinimapDragMove);
        document.removeEventListener("mouseup", this.onMinimapDragUp);

        this.container.remove();
        this.iframe = null;
        this.slider = null;
        this.container = null;
        this.element.style.removeProperty("--cursor-minimap-reserved");
    }
}

Object.assign(
    Minimap.prototype,
    minimapSettingsMethods,
    minimapLayoutMethods,
    minimapRenderingMethods,
    minimapScrollMethods
);

module.exports = Minimap;
