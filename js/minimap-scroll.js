module.exports = {
    updateSliderScroll() {
        if (!this.scroller) return;
        const scrollTop = this.scroller.scrollTop;
        if (scrollTop !== this._lastScrollTop) {
            this.minimapScrollOffset = 0;
            this._lastScrollTop = scrollTop;
        }

        const maxScroll = Math.max(
            1,
            this.scroller.scrollHeight - this.scroller.clientHeight
        );
        const containerHeight = Math.max(
            1,
            this.container?.getBoundingClientRect().height ||
                this.scroller.clientHeight
        );
        const sliderHeight = Math.max(
            12,
            this.slider.getBoundingClientRect().height ||
                this.scroller.clientHeight * (this.yScale || this.scale)
        );
        const maxTop = Math.max(0, containerHeight - sliderHeight);
        const boxTop = Math.max(
            0,
            Math.min(maxTop, (this.scroller.scrollTop / maxScroll) * maxTop)
        );
        this.iframe.style.top = `${this.topOffset || 0}px`;
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
        const maxScroll = this.scroller.scrollHeight - this.scroller.clientHeight;
        const containerRect = this.container.getBoundingClientRect();
        const containerHeight = containerRect.height;
        const sliderHeight = Math.max(
            12,
            this.slider.getBoundingClientRect().height ||
                this.scroller.clientHeight * (this.yScale || this.scale)
        );
        const maxTop = Math.max(1, containerHeight - sliderHeight);
        const y = clientY - containerRect.top - sliderHeight / 2;
        this.scroller.scrollTop = Math.max(
            0,
            Math.min(maxScroll, (y / maxTop) * maxScroll)
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
        event.preventDefault();
        event.stopPropagation();
        this.minimapScrollToY(event.clientY);
        this.isMinimapDragging = true;
        document.addEventListener("mousemove", this.onMinimapDragMove);
        document.addEventListener("mouseup", this.onMinimapDragUp);
    },

    onMinimapDragMove(event) {
        if (!this.isMinimapDragging) return;
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

        const editorRect = this.element.getBoundingClientRect();
        let offsetY =
            event.clientY - editorRect.top - this.dragOffsetY - this.topOffset;

        const maxScroll =
            this.scroller.scrollHeight - this.scroller.clientHeight;
        const containerHeight = Math.max(
            1,
            this.container.getBoundingClientRect().height
        );
        const sliderHeight = Math.max(
            12,
            this.slider.getBoundingClientRect().height ||
                this.scroller.clientHeight * (this.yScale || this.scale)
        );
        const maxOffset = Math.max(1, containerHeight - sliderHeight);

        offsetY = Math.max(0, Math.min(offsetY, maxOffset));
        this.scroller.scrollTop = (offsetY / maxOffset) * maxScroll;

        this.updateSliderScroll();
    },

    onSliderMouseUp() {
        this.isDragging = false;
        this.slider.classList.remove("dragging");
        document.removeEventListener("mousemove", this.onSliderMouseMove);
        document.removeEventListener("mouseup", this.onSliderMouseUp);
    },
};
