module.exports = {
    getMinimapDragZoneRect() {
        const rect = this.iframe?.getBoundingClientRect();
        if (rect?.width && rect?.height) return rect;
        return this.container?.getBoundingClientRect();
    },

    isPointerInsideMinimapDragZone(event) {
        const rect = this.getMinimapDragZoneRect();
        if (!rect) return false;

        return (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
        );
    },

    isPointerInsideMinimapDragColumn(event) {
        const rect = this.getMinimapDragZoneRect();
        if (!rect) return false;

        return event.clientX >= rect.left && event.clientX <= rect.right;
    },

    getSliderVisualHeight() {
        const yScale = this.yScale || this.scale || 1;
        const exactHeight = this.scroller.clientHeight * yScale;
        const zoneWidth = this.getMinimapDragZoneRect()?.width || 0;
        const minHeight = this.yScale < this.scale ? zoneWidth / 2 : 1;
        return Math.max(minHeight, exactHeight, 1);
    },

    getSliderTravelMetrics() {
        const zoneRect = this.getMinimapDragZoneRect();
        const containerRect = this.container.getBoundingClientRect();
        const sliderHeight = this.getSliderVisualHeight();
        const maxScroll = Math.max(
            0,
            this.scroller.scrollHeight - this.scroller.clientHeight
        );
        const topBase = zoneRect.top - containerRect.top;
        const travelHeight = Math.max(0, zoneRect.height - sliderHeight / 2);

        return {
            maxScroll,
            sliderHeight,
            topBase,
            travelHeight,
        };
    },

    updateSliderScroll() {
        if (!this.scroller) return;
        const scrollTop = this.scroller.scrollTop;
        if (scrollTop !== this._lastScrollTop) {
            this.minimapScrollOffset = 0;
            this._lastScrollTop = scrollTop;
        }

        const { maxScroll, sliderHeight, topBase, travelHeight } =
            this.getSliderTravelMetrics();
        const scrollRatio = maxScroll ? scrollTop / maxScroll : 0;
        const boxTop = topBase + scrollRatio * travelHeight;
        this.iframe.style.top = `${this.topOffset || 0}px`;
        this.slider.style.height = `${sliderHeight}px`;
        this.slider.style.top = `${boxTop}px`;
    },

    onSliderMouseDown(event) {
        event.preventDefault();
        this.isDragging = true;
        this.slider.classList.add("dragging");

        const sliderRect = this.slider.getBoundingClientRect();
        this.dragOffsetY = event.clientY - sliderRect.top;

        document.addEventListener("mousemove", this.onSliderMouseMove);
        document.addEventListener("mouseup", this.onSliderMouseUp);
    },

    minimapScrollToY(clientY) {
        const rect = this.getMinimapDragZoneRect();
        const { maxScroll, sliderHeight, travelHeight } =
            this.getSliderTravelMetrics();
        const y = clientY - rect.top - sliderHeight / 2;
        const scrollRatio = travelHeight ? y / travelHeight : 0;
        this.scroller.scrollTop = Math.max(
            0,
            Math.min(maxScroll, scrollRatio * maxScroll)
        );
        this.minimapScrollOffset = 0;
        this.updateSliderScroll();
    },

    onMinimapMouseDown(event) {
        if (event.button !== 0 || !this.scroller) return;
        if (
            event.target instanceof Element &&
            event.target.closest(".minimap-slider")
        ) {
            return;
        }
        if (!this.isPointerInsideMinimapDragZone(event)) return;
        event.preventDefault();
        event.stopPropagation();
        this.minimapScrollToY(event.clientY);
        this.isMinimapDragging = true;
        document.addEventListener("mousemove", this.onMinimapDragMove);
        document.addEventListener("mouseup", this.onMinimapDragUp);
    },

    onMinimapDragMove(event) {
        if (!this.isMinimapDragging) return;
        if (!this.isPointerInsideMinimapDragZone(event)) {
            this.onMinimapDragUp();
            return;
        }
        this.minimapScrollToY(event.clientY);
    },

    onMinimapDragUp() {
        this.isMinimapDragging = false;
        document.removeEventListener("mousemove", this.onMinimapDragMove);
        document.removeEventListener("mouseup", this.onMinimapDragUp);
    },

    onMinimapWheel(event) {
        if (!this.scroller) return;
        event.preventDefault();
        event.stopPropagation();
        const delta =
            event.deltaMode === 1
                ? event.deltaY * 40
                : event.deltaMode === 2
                  ? event.deltaY * this.scroller.clientHeight
                  : event.deltaY;
        this.scroller.scrollTop += delta;
        this.minimapScrollOffset = 0;
        this.updateSliderScroll();
    },

    onSliderMouseMove(event) {
        if (!this.isDragging) return;
        if (!this.isPointerInsideMinimapDragColumn(event)) {
            this.onSliderMouseUp();
            return;
        }

        const zoneRect = this.getMinimapDragZoneRect();
        let offsetY =
            event.clientY -
            zoneRect.top -
            this.dragOffsetY;

        const { maxScroll, travelHeight } = this.getSliderTravelMetrics();

        offsetY = Math.max(0, Math.min(offsetY, travelHeight));
        this.scroller.scrollTop = travelHeight
            ? (offsetY / travelHeight) * maxScroll
            : 0;

        this.updateSliderScroll();
    },

    onSliderMouseUp() {
        this.isDragging = false;
        this.slider.classList.remove("dragging");
        document.removeEventListener("mousemove", this.onSliderMouseMove);
        document.removeEventListener("mouseup", this.onSliderMouseUp);
    },
};
