const { sleep } = require("./utils");

module.exports = {
    isReadModeActive() {
        return this.sourceView.clientHeight === 0;
    },

    modeChange() {
        this.changeScroller(
            this.element.querySelector(
                this.isReadModeActive()
                    ? ".markdown-preview-view"
                    : ".cm-scroller"
            )
        );
    },

    changeScroller(newScroller) {
        if (this.scroller) {
            this.scroller.removeEventListener(
                "scroll",
                this.updateSliderScroll
            );
        }
        this.scroller = newScroller;
        if (this.scroller) {
            this.scroller.addEventListener("scroll", this.updateSliderScroll);
            this.onResize();
        }
    },

    async onResize() {
        await sleep(300);

        const visibleHeight = this.scroller.getBoundingClientRect().height;
        const sizerHeight =
            this.scroller.firstChild?.getBoundingClientRect().height || 0;
        const scrollHeight = this.scroller.scrollHeight || 0;
        this.bottomOverscrollHeight = Math.max(0, scrollHeight - sizerHeight);

        if (!this.hasMeasuredIframeHeight) {
            this.documentHeight = sizerHeight || scrollHeight;
        }
        const fullHeight = this.hasMeasuredIframeHeight
            ? this.documentHeight
            : this.documentHeight + this.bottomOverscrollHeight;
        this.resize(fullHeight, visibleHeight);
    },

    resize(fullHeight, visibleHeight) {
        this.fullHeight = Math.max(1, fullHeight || 1);
        this.visibleHeight = Math.max(1, visibleHeight || 1);
        const availableHeight = Math.max(
            1,
            this.visibleHeight - (this.topOffset || 0)
        );
        this.yScale = Math.min(this.scale, availableHeight / this.fullHeight);
        if (this.container) {
            this.container.style.setProperty("--y-scale", this.yScale);
        }
        this.iframe.style.height = `${fullHeight}px`;
        this.slider.style.height = `${this.visibleHeight * this.yScale}px`;
        this.updateSliderScroll();
    },

    setupElements() {
        this.element
            .querySelectorAll(
                ".minimap-container, .minimap-frame, .minimap-slider"
            )
            .forEach((element) => element.remove());

        this.container = document.createElement("div");
        this.container.className = "minimap-container";
        this.element.prepend(this.container);

        this.iframe = document.createElement("iframe");
        this.iframe.className = "minimap-frame";
        this.iframe.addEventListener("load", this.onIframeLoad);
        this.container.appendChild(this.iframe);

        this.overlay = document.createElement("div");
        this.overlay.className = "minimap-click-overlay";
        this.container.appendChild(this.overlay);

        this.slider = document.createElement("div");
        this.slider.className = "minimap-slider";
        this.container.appendChild(this.slider);
        this.updateReservedWidth();
    },

    updateReservedWidth() {
        if (!this.element || !this.scale) return;
        const width = Math.ceil(this.element.clientWidth * this.scale + 12);
        this.element.style.setProperty("--cursor-minimap-reserved", `${width}px`);
    },
};
