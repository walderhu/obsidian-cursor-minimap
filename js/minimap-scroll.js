module.exports = {
    getMinimapDragZoneRect() {
        return this.container?.getBoundingClientRect() || null;
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
        if (!this.scroller || !this.yScale || !this.fullHeight) return;
        const scrollTop = this.scroller.scrollTop;
        const topOffset = this.topOffset || 0;
        const effectiveHeight = this.effectiveIframeHeight || this.fullHeight;

        if (scrollTop !== this._lastScrollTop) {
            this._manualMinimapScroll = false;
            this._lastScrollTop = scrollTop;
        }

        const sliderHeight = Math.max(1, this.scroller.clientHeight * this.yScale);
        const editorMaxScroll = Math.max(1, this.scroller.scrollHeight - this.scroller.clientHeight);
        const scrollRatio = scrollTop / editorMaxScroll;

        const BOTTOM_PADDING = 8;
        const rawSliderAbsTop = scrollTop * this.yScale + topOffset;
        const scaledDocHeight = effectiveHeight * this.yScale;
        const maxMinimapScroll = Math.max(0, scaledDocHeight - this.visibleHeight + topOffset);

        if (this._manualMinimapScroll) {
            // independent minimap scroll — just clamp, don't override
            this.minimapScrollTop = Math.max(0, Math.min(this.minimapScrollTop || 0, maxMinimapScroll));
        } else {
            // VSCode auto-follow
            const sliderTargetTop = scrollRatio * (this.visibleHeight - sliderHeight - topOffset - BOTTOM_PADDING);
            this.minimapScrollTop = Math.max(0, Math.min(maxMinimapScroll, rawSliderAbsTop - sliderTargetTop));
        }

        const sliderTop = rawSliderAbsTop - this.minimapScrollTop;

        this.iframe.style.top = `${topOffset - this.minimapScrollTop}px`;
        this.slider.style.height = `${sliderHeight}px`;
        this.slider.style.top = `${sliderTop}px`;
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
        if (!this.yScale || !this.scroller) return;
        const rect = this.container.getBoundingClientRect();
        const minimapY = (clientY - rect.top) + (this.minimapScrollTop || 0) - (this.topOffset || 0);
        const documentY = minimapY / this.yScale;
        const maxScroll = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
        this.scroller.scrollTop = Math.max(0, Math.min(maxScroll, documentY - this.scroller.clientHeight / 2));
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
        event.preventDefault();
        event.stopPropagation();
        if (!this.yScale || !this.fullHeight) return;
        const delta = event.deltaMode === 1
            ? event.deltaY * 40
            : event.deltaMode === 2
              ? event.deltaY * this.visibleHeight
              : event.deltaY;
        const effectiveHeight = this.effectiveIframeHeight || this.fullHeight;
        const scaledDocHeight = effectiveHeight * this.yScale;
        const maxScroll = Math.max(0, scaledDocHeight - this.visibleHeight + (this.topOffset || 0));
        this.minimapScrollTop = Math.max(0, Math.min(maxScroll, (this.minimapScrollTop || 0) + delta));
        this._manualMinimapScroll = true;
        this.updateSliderScroll();
    },

    onSliderMouseMove(event) {
        if (!this.isDragging) return;
        if (!this.isPointerInsideMinimapDragColumn(event)) {
            this.onSliderMouseUp();
            return;
        }

        const rect = this.container.getBoundingClientRect();
        const sliderTopInContainer = event.clientY - rect.top - this.dragOffsetY;
        const newScrollTop = (sliderTopInContainer + this.minimapScrollTop - (this.topOffset || 0)) / this.yScale;
        const maxScroll = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
        this.scroller.scrollTop = Math.max(0, Math.min(maxScroll, newScrollTop));
        this.updateSliderScroll();
    },

    onSliderMouseUp() {
        this.isDragging = false;
        this.slider.classList.remove("dragging");
        document.removeEventListener("mousemove", this.onSliderMouseMove);
        document.removeEventListener("mouseup", this.onSliderMouseUp);
    },
};
