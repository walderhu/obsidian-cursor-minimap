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

    updateSliderScroll() {
        if (!this.scroller) return;
        const scrollTop = this.scroller.scrollTop;
        if (scrollTop !== this._lastScrollTop) {
            this.minimapScrollOffset = 0;
            this._lastScrollTop = scrollTop;
        }

        const yScale = this.yScale || this.scale || 1;
        const maxScroll = Math.max(
            0,
            this.scroller.scrollHeight - this.scroller.clientHeight
        );
        const sliderHeight = Math.max(1, this.scroller.clientHeight * yScale);
        const maxTop = (this.topOffset || 0) + maxScroll * yScale;
        const boxTop = Math.max(
            this.topOffset || 0,
            Math.min(maxTop, (this.topOffset || 0) + scrollTop * yScale)
        );
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
        const yScale = this.yScale || this.scale || 1;
        const maxScroll = Math.max(
            0,
            this.scroller.scrollHeight - this.scroller.clientHeight
        );
        const rect = this.getMinimapDragZoneRect();
        const y = clientY - rect.top - this.scroller.clientHeight * yScale / 2;
        this.scroller.scrollTop = Math.max(
            0,
            Math.min(maxScroll, y / yScale)
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
        if (!this.isPointerInsideMinimapDragZone(event)) {
            this.onSliderMouseUp();
            return;
        }

        const yScale = this.yScale || this.scale || 1;
        const containerRect = this.container.getBoundingClientRect();
        let offsetY =
            event.clientY -
            containerRect.top -
            this.dragOffsetY -
            (this.topOffset || 0);

        const maxScroll = Math.max(
            0,
            this.scroller.scrollHeight - this.scroller.clientHeight
        );
        const maxOffset = maxScroll * yScale;

        offsetY = Math.max(0, Math.min(offsetY, maxOffset));
        this.scroller.scrollTop = yScale ? offsetY / yScale : 0;

        this.updateSliderScroll();
    },

    onSliderMouseUp() {
        this.isDragging = false;
        this.slider.classList.remove("dragging");
        document.removeEventListener("mousemove", this.onSliderMouseMove);
        document.removeEventListener("mouseup", this.onSliderMouseUp);
    },
};
