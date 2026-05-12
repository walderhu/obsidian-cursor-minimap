const { Plugin, MarkdownView, Notice } = require("obsidian");

const VIEW_TYPE_MARKDOWN = "markdown";
const MIN_VIEWPORT_HEIGHT = 24;

class MinimapLayout {
  constructor(scrollTop, scrollHeight, viewportHeight, minimapHeight) {
    this.scrollTop = Math.max(0, scrollTop || 0);
    this.scrollHeight = Math.max(1, scrollHeight || 1);
    this.viewportHeight = Math.max(1, viewportHeight || 1);
    this.minimapHeight = Math.max(1, minimapHeight || 1);
    this.maxScroll = Math.max(0, this.scrollHeight - this.viewportHeight);
    this.sliderHeight = Math.max(
      MIN_VIEWPORT_HEIGHT,
      Math.min(this.minimapHeight, Math.floor(this.viewportHeight * this.minimapHeight / this.scrollHeight))
    );
    this.maxSliderTop = Math.max(0, this.minimapHeight - this.sliderHeight);
    this.sliderRatio = this.maxScroll > 0 ? this.maxSliderTop / this.maxScroll : 0;
    this.sliderTop = this.sliderRatio > 0 ? this.scrollTop * this.sliderRatio : 0;
  }

  getDesiredScrollTopFromDelta(delta) {
    if (!this.sliderRatio) return this.scrollTop;
    return Math.round(this.scrollTop + delta / this.sliderRatio);
  }

  getDesiredScrollTopFromTouchLocation(y) {
    if (!this.sliderRatio) return 0;
    return Math.round((y - this.sliderHeight / 2) / this.sliderRatio);
  }
}

class MinimapController {
  constructor(plugin, view) {
    this.plugin = plugin;
    this.view = view;
    this.editor = view.editor;
    this.lines = [];
    this.lineWeights = [];
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.viewport = null;
    this.scroller = null;
    this.host = null;
    this.layout = null;
    this.raf = 0;
    this.dragging = false;
    this.dragStartY = 0;
    this.dragStartLayout = null;
    this.taskKanbanCollapsed = false;
    this.observer = null;
    this.resizeObserver = null;
    this.boundScroll = () => this.scheduleRefresh();
    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = (event) => this.onPointerUp(event);
    this.boundWheel = (event) => this.onWheel(event);
  }

  mount() {
    if (!this.view?.containerEl || this.root) return;
    this.setScroller(this.getScroller());
    const content = this.view.containerEl.querySelector(".view-content");
    if (!content || !this.scroller) return;

    this.host = content;
    this.host.addClass("cursor-minimap-host");
    this.root = this.host.createDiv({ cls: "cursor-minimap" });
    this.canvas = this.root.createEl("canvas", { cls: "cursor-minimap-canvas" });
    this.viewport = this.root.createDiv({ cls: "cursor-minimap-viewport" });
    this.ctx = this.canvas.getContext("2d");

    this.root.addEventListener("pointerdown", this.boundPointerDown);
    window.addEventListener("pointermove", this.boundPointerMove, true);
    window.addEventListener("pointerup", this.boundPointerUp, true);
    window.addEventListener("wheel", this.boundWheel, { capture: true, passive: false });
    this.root.addEventListener("wheel", this.boundWheel, { capture: true, passive: false });
    this.observer = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => this.root?.contains(mutation.target))) return;
      this.scheduleRefresh();
    });
    this.observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-callout-fold"]
    });
    this.resizeObserver = new ResizeObserver(() => this.scheduleRefresh());
    this.resizeObserver.observe(content);
    this.resizeObserver.observe(this.scroller);
    this.scheduleRefresh();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.scroller?.removeEventListener("scroll", this.boundScroll);
    this.root?.removeEventListener("pointerdown", this.boundPointerDown);
    this.root?.removeEventListener("wheel", this.boundWheel, true);
    window.removeEventListener("pointermove", this.boundPointerMove, true);
    window.removeEventListener("pointerup", this.boundPointerUp, true);
    window.removeEventListener("wheel", this.boundWheel, true);
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.viewport = null;
    this.scroller = null;
    this.host = null;
    this.layout = null;
    this.observer = null;
    this.resizeObserver = null;
  }

  getScroller() {
    const candidates = [
      this.view.containerEl.querySelector(".cm-scroller"),
      this.view.containerEl.querySelector(".markdown-preview-view"),
      this.view.containerEl.querySelector(".markdown-reading-view"),
      this.view.containerEl.querySelector(".view-content")
    ].filter(Boolean);
    return candidates.find((el) => el.scrollHeight > el.clientHeight + 1) || candidates[0] || null;
  }

  setScroller(scroller) {
    if (this.scroller === scroller) return;
    this.scroller?.removeEventListener("scroll", this.boundScroll);
    if (this.resizeObserver && this.scroller) this.resizeObserver.unobserve(this.scroller);
    this.scroller = scroller;
    this.scroller?.addEventListener("scroll", this.boundScroll, { passive: true });
    if (this.resizeObserver && this.scroller) this.resizeObserver.observe(this.scroller);
  }

  scheduleRefresh() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.refresh();
    });
  }

  refresh() {
    if (!this.root || !this.canvas || !this.ctx) return;
    if (!this.view.containerEl.isConnected) {
      this.plugin.removeController(this.view);
      return;
    }
    this.editor = this.view.editor;
    this.setScroller(this.getScroller());
    this.lines = this.readLines();
    this.lineWeights = this.measureLineWeights(this.lines);
    this.fitLineWeightsToScroller();
    if (!this.scroller || !this.lines.length) return;
    this.syncGeometry();

    const rect = this.root.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.floor(width * dpr) || this.canvas.height !== Math.floor(height * dpr)) {
      this.canvas.width = Math.floor(width * dpr);
      this.canvas.height = Math.floor(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.palette = this.readPalette();

    const metrics = this.buildLineMetrics(height);
    const lastLine = metrics.lastLine;
    const lineCount = metrics.lineCount;
    const weightHeight = metrics.weightHeight;
    const averageRowHeight = Math.min(height, metrics.totalWeight * weightHeight) / lineCount;
    const minPaintHeight = lineCount > height * 1.5 ? 0.55 : Math.max(0.75, Math.min(2, averageRowHeight));
    const charWidth = lineCount > 1800 ? 1.05 : lineCount > 900 ? 1.25 : 1.55;
    const maxColumns = Math.max(30, Math.floor((width - 12) / charWidth));

    let y = metrics.topPadding;
    for (let lineNo = 0; lineNo <= lastLine; lineNo++) {
      const line = this.getLine(lineNo);
      const rowHeight = Math.max(0.25, (this.lineWeights[lineNo] || 1) * weightHeight);
      if (y > height) break;
      this.renderMinimapLine(ctx, line, y, rowHeight, minPaintHeight, charWidth, maxColumns);
      y += rowHeight;
    }

    this.renderCursorMarker(ctx, metrics, width, height);
    this.refreshViewport(height);
  }

  syncGeometry() {
    if (!this.root || !this.host || !this.scroller) return;
    const hostRect = this.host.getBoundingClientRect();
    const scrollerRect = this.scroller.getBoundingClientRect();
    const top = Math.max(0, scrollerRect.top - hostRect.top);
    const bottom = Math.max(0, hostRect.bottom - scrollerRect.bottom);
    const height = Math.max(1, scrollerRect.height);
    this.root.style.top = `${top}px`;
    this.root.style.bottom = "auto";
    this.root.style.height = `${height}px`;
    this.root.style.maxHeight = `calc(100% - ${top + bottom}px)`;
  }

  buildLineMetrics(height) {
    const lastLine = this.safeLastLine();
    const lineCount = Math.max(1, lastLine + 1);
    const totalWeight = Math.max(1, this.lineWeights.reduce((sum, weight) => sum + Math.max(0, weight || 0), 0));
    const scrollHeight = Math.max(this.scroller?.scrollHeight || 0, this.scroller?.clientHeight || 0, 1);
    const topPadding = this.getScrollableTopPadding();
    const drawableHeight = Math.max(1, height - topPadding);
    const weightHeight = drawableHeight / scrollHeight;
    return { lastLine, lineCount, totalWeight, scrollHeight, topPadding, weightHeight };
  }

  fitLineWeightsToScroller() {
    if (!this.scroller || !this.lineWeights?.length) return;
    const scrollHeight = Math.max(1, this.scroller.scrollHeight || 0);
    const totalWeight = this.lineWeights.reduce((sum, weight) => sum + Math.max(0, weight || 0), 0);
    const overflow = totalWeight - scrollHeight;
    if (overflow <= 0) return;
    const kanbanIndexes = [];
    for (let i = 0; i < this.lines.length; i++) {
      if (/task-kanban-inline-marker|task-kanban-inline-card/.test(String(this.lines[i] || ""))) {
        kanbanIndexes.push(i);
      }
    }
    if (!kanbanIndexes.length) return;
    const baseLineHeight = this.getBaseLineHeight();
    const reducible = kanbanIndexes.reduce((sum, index) => {
      return sum + Math.max(0, (this.lineWeights[index] || 0) - baseLineHeight * 2);
    }, 0);
    if (reducible <= 0) return;
    const reduction = Math.min(overflow, reducible);
    for (const index of kanbanIndexes) {
      const available = Math.max(0, (this.lineWeights[index] || 0) - baseLineHeight * 2);
      this.lineWeights[index] -= reduction * available / reducible;
    }
  }

  renderMinimapLine(ctx, line, y, rowHeight, minPaintHeight, charWidth, maxColumns) {
    const visible = line.slice(0, maxColumns).replace(/\t/g, "  ");
    if (!visible.trim()) return;
    const lineType = this.getLineType(line);
    if (lineType === "image") {
      this.renderImageBlock(ctx, line, y, rowHeight, minPaintHeight);
      return;
    }
    if (lineType === "kanban") {
      if (rowHeight < 0.6) return;
      this.renderKanbanBlock(ctx, y, rowHeight, minPaintHeight);
      return;
    }
    const h = Math.max(minPaintHeight, Math.min(2, rowHeight));
    const baseAlpha = rowHeight < 0.8 ? 0.34 : rowHeight < 1.4 ? 0.42 : 0.58;
    let xPad = 5;
    if (/^\s+/.test(visible)) {
      xPad += Math.min(20, Math.floor((visible.match(/^\s+/)?.[0].length || 0) * 0.72));
    }
    const headingLevel = (line.match(/^\s{0,3}(#{1,6})\s+/)?.[1].length || 0);
    const color = this.colorForLine(lineType, headingLevel, baseAlpha);

    let runStart = -1;
    let runColor = null;
    const flushRun = (endIndex) => {
      if (runStart < 0 || !runColor) return;
      const x = xPad + runStart * charWidth;
      const w = Math.max(1, Math.ceil((endIndex - runStart) * charWidth - 0.35));
      ctx.fillStyle = runColor;
      ctx.fillRect(x, Math.floor(y), w, h);
      runStart = -1;
      runColor = null;
    };

    for (let i = 0; i < visible.length; i++) {
      const ch = visible[i];
      const x = xPad + i * charWidth;
      if (x > 116) break;
      if (ch === " ") {
        flushRun(i);
        continue;
      }
      const chColor = this.colorForChar(ch, lineType, color);
      if (runColor !== chColor) {
        flushRun(i);
        runStart = i;
        runColor = chColor;
      } else if (runStart < 0) {
        runStart = i;
      }
    }
    flushRun(visible.length);
  }

  renderImageBlock(ctx, line, y, rowHeight, minPaintHeight) {
    const p = this.palette || this.readPalette();
    const h = Math.max(minPaintHeight, Math.max(rowHeight - 1, minPaintHeight));
    const top = Math.floor(y);
    const left = 7;
    const width = 104;
    ctx.fillStyle = p.imageBg;
    ctx.fillRect(left, top, width, h);
    ctx.fillStyle = p.imageShade;
    ctx.fillRect(left + 3, top + 2, Math.max(12, width * 0.34), Math.max(2, h - 4));
    ctx.fillStyle = p.imageLine;
    for (let i = 0; i < 4; i++) {
      const lineWidth = Math.max(10, width * (0.18 + i * 0.12));
      ctx.fillRect(left + 42, top + 2 + i * 2, lineWidth, 1);
    }
    if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)(\)|\]|\s|$)/i.test(line)) {
      ctx.fillStyle = p.accentStrong;
      ctx.fillRect(left, top, 2, h);
    }
  }

  renderKanbanBlock(ctx, y, rowHeight, minPaintHeight) {
    const p = this.palette || this.readPalette();
    const top = Math.floor(y);
    const h = Math.max(minPaintHeight, rowHeight - 1);
    const left = 6;
    const width = 106;
    ctx.fillStyle = p.imageBg;
    ctx.fillRect(left, top, width, h);
    ctx.fillStyle = p.accent(0.36);
    ctx.fillRect(left, top, 3, h);
    ctx.fillStyle = p.normal(0.34);
    const rows = Math.max(2, Math.min(12, Math.floor(h / 7)));
    for (let row = 0; row < rows; row++) {
      const yRow = top + 4 + row * 7;
      if (yRow > top + h - 2) break;
      ctx.fillRect(left + 8, yRow, 24, 2);
      ctx.fillRect(left + 38, yRow, 24, 2);
      ctx.fillRect(left + 68, yRow, 24, 2);
    }
  }

  getLineType(line) {
    if (/task-kanban-inline-marker|task-kanban-inline-card/.test(line)) return "kanban";
    if (/!\[\[.+?\]\]|!\[.*?\]\(.+?\)|\[\[.+?\.(png|jpe?g|gif|webp|svg|bmp|avif).*?\]\]/i.test(line)) return "image";
    if (/^\s{0,3}#{1,6}\s+/.test(line)) return "heading";
    if (/^\s*[-*]\s+\[[ xX-]\]/.test(line)) return "task";
    if (/^\s*```/.test(line)) return "fence";
    if (/^\s*>/.test(line)) return "quote";
    if (/\[\[.+?\]\]|\[.+?\]\(.+?\)/.test(line)) return "link";
    return "text";
  }

  colorForLine(type, headingLevel, alpha) {
    const p = this.palette || this.readPalette();
    if (type === "heading") {
      const a = headingLevel <= 2 ? 0.76 : 0.64;
      return headingLevel <= 2 ? p.accent(a) : p.normal(a);
    }
    if (type === "task") return p.success(Math.max(0.5, alpha));
    if (type === "fence") return p.muted(Math.max(0.52, alpha));
    if (type === "quote") return p.faint(Math.max(0.45, alpha));
    if (type === "link") return p.accent(Math.max(0.54, alpha));
    return p.normal(alpha);
  }

  colorForChar(ch, type, fallback) {
    const p = this.palette || this.readPalette();
    if (type === "heading" && ch === "#") return p.accentStrong;
    if (type === "task" && /[xX]/.test(ch)) return p.success(0.82);
    if (ch === "[" || ch === "]" || ch === "(" || ch === ")") return p.accent(0.68);
    if (ch === "`") return p.muted(0.76);
    return fallback;
  }

  readPalette() {
    const styles = getComputedStyle(document.body);
    const normal = this.colorToRgb(styles.getPropertyValue("--text-normal") || "#c0c0c0");
    const muted = this.colorToRgb(styles.getPropertyValue("--text-muted") || "#8a8a8a");
    const faint = this.colorToRgb(styles.getPropertyValue("--text-faint") || "#6f6f6f");
    const accent = this.colorToRgb(styles.getPropertyValue("--text-accent") || styles.getPropertyValue("--interactive-accent") || "#6aa6ff");
    const success = this.colorToRgb(styles.getPropertyValue("--color-green") || "#75b878");
    const bgMod = this.colorToRgb(styles.getPropertyValue("--background-modifier-border") || "#555");
    const rgba = (rgb, alpha) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    return {
      normal: (alpha) => rgba(normal, alpha),
      muted: (alpha) => rgba(muted, alpha),
      faint: (alpha) => rgba(faint, alpha),
      accent: (alpha) => rgba(accent, alpha),
      success: (alpha) => rgba(success, alpha),
      accentStrong: rgba(accent, 0.9),
      imageBg: rgba(bgMod, 0.28),
      imageShade: rgba(accent, 0.16),
      imageLine: rgba(normal, 0.22)
    };
  }

  colorToRgb(value) {
    const raw = String(value).trim();
    const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
      };
    }
    const rgb = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgb) {
      return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
    }
    return { r: 150, g: 160, b: 175 };
  }

  refreshViewport(height) {
    if (!this.viewport || !this.scroller) return;
    const clientHeight = Math.max(1, this.scroller.clientHeight);
    const contentHeight = Math.max(clientHeight, this.scroller.scrollHeight);
    this.layout = new MinimapLayout(this.scroller.scrollTop, contentHeight, clientHeight, height);
    this.viewport.style.top = `${Math.max(0, Math.min(height - this.layout.sliderHeight, this.layout.sliderTop))}px`;
    this.viewport.style.height = `${this.layout.sliderHeight}px`;
  }

  getEstimatedContentHeight() {
    const weightedHeight = this.lineWeights.reduce((sum, weight) => sum + Math.max(0, weight || 0), 0);
    return Math.max(1, weightedHeight || this.scroller?.scrollHeight || 1);
  }

  getScrollableTopPadding() {
    const styles = this.scroller ? getComputedStyle(this.scroller) : null;
    return Number.parseFloat(styles?.paddingTop || "") || 0;
  }

  renderCursorMarker(ctx, metrics, width, height) {
    const cursor = this.getCursorLine();
    if (cursor == null || cursor < 0 || cursor > metrics.lastLine) return;
    const weightBefore = this.lineWeights
      .slice(0, cursor)
      .reduce((sum, weight) => sum + Math.max(0, weight || 0), 0);
    const y = metrics.topPadding + weightBefore * metrics.weightHeight;
    if (y < 0 || y > height) return;
    const p = this.palette || this.readPalette();
    ctx.fillStyle = p.accentStrong;
    ctx.fillRect(0, Math.max(0, Math.floor(y)), width, Math.max(1, Math.min(2, metrics.weightHeight * 1.4)));
  }

  getCursorLine() {
    try {
      const cursor = this.editor?.getCursor?.();
      if (cursor && Number.isFinite(cursor.line)) return cursor.line;
    } catch (error) {
      return null;
    }
    return null;
  }

  safeLastLine() {
    return Math.max(0, this.lines.length - 1);
  }

  getLine(lineNo) {
    return this.lines[lineNo] || "";
  }

  readLines() {
    let lines;
    if (this.editor && typeof this.editor.getLine === "function") {
      const lastLine = this.editorLastLine();
      lines = [];
      for (let lineNo = 0; lineNo <= lastLine; lineNo++) {
        lines.push(this.editor.getLine(lineNo) || "");
      }
    } else {
      const data = typeof this.view.getViewData === "function" ? this.view.getViewData() : this.view.data;
      lines = String(data || "").split(/\r?\n/);
    }
    lines = lines.length ? lines : [""];
    return this.stripFrontmatter(lines);
  }

  editorLastLine() {
    if (!this.editor) return 0;
    if (typeof this.editor.lastLine === "function") return this.editor.lastLine();
    if (typeof this.editor.lineCount === "function") return Math.max(0, this.editor.lineCount() - 1);
    return 0;
  }

  stripFrontmatter(lines) {
    if (!lines.length || String(lines[0]).trim() !== "---") return lines;
    const endIndex = lines.findIndex((line, index) => index > 0 && /^(\.\.\.|---)\s*$/.test(String(line).trim()));
    if (endIndex < 0) return lines;
    const visible = lines.slice(endIndex + 1);
    return visible.length ? visible : [""];
  }

  isPreviewScroller() {
    return !!this.scroller?.classList?.contains("markdown-preview-view")
      || !!this.scroller?.classList?.contains("markdown-reading-view");
  }

  measureLineWeights(lines) {
    const baseLineHeight = this.getBaseLineHeight();
    const weights = [];
    let insideKanban = false;
    let kanbanCollapsed = false;
    let kanbanLines = [];
    for (const line of lines) {
      const text = String(line || "");
      if (text.includes("<!-- task-kanban:start -->")) {
        insideKanban = true;
        kanbanCollapsed = this.isTaskKanbanCollapsed();
        kanbanLines = [text];
        continue;
      }
      if (text.includes("<!-- task-kanban:end -->")) {
        kanbanLines.push(text);
        weights.push(...this.measureKanbanBlockWeights(kanbanLines, baseLineHeight, kanbanCollapsed));
        insideKanban = false;
        kanbanCollapsed = false;
        kanbanLines = [];
        continue;
      }
      if (insideKanban) {
        kanbanLines.push(text);
        continue;
      }
      weights.push(this.measureLineWeight(text, baseLineHeight));
    }
    if (insideKanban && kanbanLines.length) {
      weights.push(...this.measureKanbanBlockWeights(kanbanLines, baseLineHeight, kanbanCollapsed));
    }
    return weights;
  }

  measureKanbanBlockWeights(lines, baseLineHeight, collapsed) {
    const textState = this.getTaskKanbanTextCollapsedState(lines);
    if (textState === true) {
      collapsed = true;
      this.taskKanbanCollapsed = true;
    }
    const total = collapsed ? baseLineHeight * 2.1 : this.getTaskKanbanFixedHeight();
    const weights = lines.map((line) => {
      const text = String(line || "");
      if (text.includes("<!-- task-kanban:start -->") || text.includes("<!-- task-kanban:end -->")) return 0.05;
      if (/\[!(?:todo|task-kanban)\][+-]?\s+Task Kanban/.test(text)) return collapsed ? 2 : 0.2;
      if (/task-kanban-inline-marker|task-kanban-inline-card/.test(text)) return collapsed ? 0 : 100;
      if (/^\s*>\s*$/.test(text)) return 0;
      return collapsed ? 0 : 0.02;
    });
    const sum = Math.max(0.1, weights.reduce((acc, weight) => acc + weight, 0));
    return weights.map((weight) => total * weight / sum);
  }

  measureLineWeight(line, baseLineHeight) {
    const text = String(line || "");
    const type = this.getLineType(text);
    if (!text.trim()) return baseLineHeight * 0.82;
    if (type === "kanban") return this.measureKanbanLineWeight(text, baseLineHeight, this.isTaskKanbanCollapsed());
    if (type === "image") return this.measureImageWeight(text, baseLineHeight);
    if (type === "heading") {
      const level = text.match(/^\s{0,3}(#{1,6})\s+/)?.[1].length || 6;
      return baseLineHeight * (level <= 1 ? 2.1 : level === 2 ? 1.75 : 1.35);
    }
    return this.measureWrappedTextWeight(text, baseLineHeight, 8);
  }

  measureKanbanLineWeight(line, baseLineHeight, collapsed) {
    const text = String(line || "");
    if (collapsed) {
      if (/\[!(?:todo|task-kanban)\][+-]?\s+Task Kanban/.test(text)) return baseLineHeight * 1.8;
      return 0;
    }
    if (/task-kanban-inline-marker|task-kanban-inline-card/.test(text)) {
      return this.getTaskKanbanFixedHeight();
    }
    if (/\[!(?:todo|task-kanban)\][+-]?\s+Task Kanban/.test(text)) return baseLineHeight * 1.8;
    if (/task-kanban-inline-action/.test(text)) return baseLineHeight * 1.6;
    if (/^\s*>\s*$/.test(text)) return baseLineHeight * 0.25;
    return baseLineHeight * 0.9;
  }

  getTaskKanbanFixedHeight() {
    const viewport = Math.max(240, this.scroller?.clientHeight || 0);
    return Math.max(260, viewport * 1.04 + this.getBaseLineHeight() * 2);
  }

  measureWrappedTextWeight(text, baseLineHeight, maxVisualLines = 8) {
    const plainLength = String(text || "").replace(/\s+/g, " ").trim().length;
    if (!plainLength) return baseLineHeight * 0.82;
    const contentWidth = this.getContentWidth();
    const charsPerLine = Math.max(18, Math.floor(contentWidth / this.getAverageCharWidth()));
    const visualLines = Math.max(1, Math.ceil(plainLength / charsPerLine));
    return baseLineHeight * Math.min(maxVisualLines, visualLines);
  }

  isTaskKanbanCollapsed() {
    const detected = this.readTaskKanbanCollapsedState();
    if (detected !== null) {
      this.taskKanbanCollapsed = detected;
    }
    return this.taskKanbanCollapsed;
  }

  readTaskKanbanCollapsedState() {
    const collapsed = this.view.containerEl.querySelector(
      ".callout.is-collapsed:has(.task-kanban-inline-marker), .callout[data-callout-fold='-']:has(.task-kanban-inline-marker), .callout.is-collapsed[data-callout='todo'], .callout[data-callout-fold='-'][data-callout='todo'], .callout.is-collapsed[data-callout='task-kanban'], .callout[data-callout-fold='-'][data-callout='task-kanban']"
    );
    if (collapsed) return true;
    return null;
  }

  getTaskKanbanTextCollapsedState(lines) {
    if (lines.some((line) => /\[!(?:todo|task-kanban)\]-\s+Task Kanban/.test(String(line || "")))) return true;
    if (lines.some((line) => /\[!(?:todo|task-kanban)\]\+?\s+Task Kanban/.test(String(line || "")))) return false;
    return null;
  }

  measureImageWeight(line, baseLineHeight) {
    const info = this.extractImageInfo(line);
    const natural = info?.path ? this.getImageNaturalSize(info.path) : null;
    const visualHeight = this.estimateImageHeight(info, natural);
    return Math.max(baseLineHeight * 1.4, visualHeight + baseLineHeight * 0.7);
  }

  getBaseLineHeight() {
    const target = this.view.containerEl.querySelector(".cm-line")
      || this.view.containerEl.querySelector(".markdown-preview-view")
      || this.scroller;
    const styles = target ? getComputedStyle(target) : null;
    const fontSize = Number.parseFloat(styles?.fontSize || "") || 16;
    const lineHeight = Number.parseFloat(styles?.lineHeight || "");
    return Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.45;
  }

  getContentWidth() {
    const candidates = [
      this.view.containerEl.querySelector(".cm-content"),
      this.view.containerEl.querySelector(".markdown-preview-sizer"),
      this.view.containerEl.querySelector(".markdown-preview-section"),
      this.view.containerEl.querySelector(".markdown-preview-view")
    ].filter(Boolean);
    const target = candidates.find((el) => el.clientWidth > 0) || this.scroller || this.view.containerEl;
    const styles = target ? getComputedStyle(target) : null;
    const paddingLeft = Number.parseFloat(styles?.paddingLeft || "") || 0;
    const paddingRight = Number.parseFloat(styles?.paddingRight || "") || 0;
    const width = (target?.clientWidth || this.scroller?.clientWidth || this.view.containerEl.clientWidth || 700) - paddingLeft - paddingRight;
    return Math.max(180, Math.min(width, this.scroller?.clientWidth || width));
  }

  getAverageCharWidth() {
    const target = this.view.containerEl.querySelector(".cm-line")
      || this.view.containerEl.querySelector(".markdown-preview-view")
      || this.scroller;
    const styles = target ? getComputedStyle(target) : null;
    const fontSize = Number.parseFloat(styles?.fontSize || "") || 16;
    return Math.max(5.5, fontSize * 0.52);
  }

  estimateImageHeight(info, natural) {
    const contentWidth = this.getContentWidth();
    const maxWidth = Math.max(80, contentWidth - 24);
    if (info?.height) return Math.min(info.height, maxWidth * 1.5);
    const requestedWidth = info?.width || Math.min(420, maxWidth);
    const visualWidth = Math.min(requestedWidth, maxWidth);
    if (natural?.width && natural?.height) {
      return Math.max(24, visualWidth * natural.height / natural.width);
    }
    if (info?.width) return info.width;
    return 220;
  }

  extractImageInfo(line) {
    const raw = String(line);
    const wiki = raw.match(/!\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|(\d{2,4})(?:x(\d{2,4}))?)?\]\]/i);
    if (wiki) {
      return {
        path: wiki[1].trim(),
        width: wiki[2] ? Number(wiki[2]) : null,
        height: wiki[3] ? Number(wiki[3]) : null
      };
    }
    const markdown = raw.match(/!\[[^\]]*]\(([^)\s]+)(?:\s*=\s*(\d{2,4})x(\d{0,4}))?\)/i);
    if (markdown) {
      return {
        path: decodeURIComponent(markdown[1].trim()),
        width: markdown[2] ? Number(markdown[2]) : null,
        height: markdown[3] ? Number(markdown[3]) : null
      };
    }
    return null;
  }

  getImageNaturalSize(path) {
    if (!this.plugin.imageSizes) this.plugin.imageSizes = new Map();
    const cacheKey = `${this.view.file?.path || ""}::${path}`;
    const cached = this.plugin.imageSizes.get(cacheKey);
    if (cached && cached.status === "loaded") return cached;
    if (cached && cached.status === "loading") return null;

    const file = this.plugin.app.metadataCache.getFirstLinkpathDest(path, this.view.file?.path || "");
    if (!file) return null;
    const src = this.plugin.app.vault.getResourcePath(file);
    this.plugin.imageSizes.set(cacheKey, { status: "loading" });
    const image = new Image();
    image.onload = () => {
      this.plugin.imageSizes.set(cacheKey, {
        status: "loaded",
        width: image.naturalWidth,
        height: image.naturalHeight
      });
      this.scheduleRefresh();
    };
    image.onerror = () => this.plugin.imageSizes.set(cacheKey, { status: "error" });
    image.src = src;
    return null;
  }

  onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    this.root?.setPointerCapture?.(event.pointerId);
    this.dragging = true;
    this.root?.addClass("is-dragging");
    this.viewport?.addClass("active");
    this.dragStartY = event.clientY;
    this.dragStartLayout = this.layout;
    if (this.isPointerInsideViewport(event)) {
      return;
    }
    this.jumpToPointer(event, true);
  }

  onPointerMove(event) {
    if (!this.dragging) return;
    event.preventDefault();
    event.stopPropagation();
    const scroller = this.getActiveScroller();
    if (!scroller) return;
    if (!this.dragStartLayout) {
      this.jumpToPointer(event, true);
      return;
    }
    const nextTop = this.dragStartLayout.getDesiredScrollTopFromDelta(event.clientY - this.dragStartY);
    this.setScrollTop(nextTop);
  }

  onPointerUp(event) {
    if (this.dragging && event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.dragging = false;
    this.root?.removeClass("is-dragging");
    this.viewport?.removeClass("active");
    this.dragStartLayout = null;
  }

  onWheel(event) {
    if (!this.isEventOverMinimap(event)) return;
    const scroller = this.getActiveScroller();
    if (!scroller) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    const deltaY = this.normalizeWheelDelta(event, scroller);
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const nextTop = Math.max(0, Math.min(maxScroll, scroller.scrollTop + deltaY));
    this.setScrollTop(nextTop);
    this.scheduleRefresh();
  }

  jumpToPointer(event, centerViewport = false) {
    const scroller = this.getActiveScroller();
    if (!this.root || !scroller) return;
    const rect = this.root.getBoundingClientRect();
    const localY = event.clientY - rect.top;
    const layout = this.layout || new MinimapLayout(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight, rect.height);
    const nextTop = centerViewport
      ? layout.getDesiredScrollTopFromTouchLocation(localY)
      : localY / Math.max(1, rect.height) * Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    this.setScrollTop(nextTop);
    this.scheduleRefresh();
  }

  setScrollTop(scrollTop) {
    const scroller = this.getActiveScroller();
    if (!scroller) return;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const nextTop = Math.max(0, Math.min(maxScroll, scrollTop));
    scroller.scrollTop = nextTop;
    if (Math.abs(scroller.scrollTop - nextTop) > 1 && typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ top: nextTop, left: scroller.scrollLeft || 0, behavior: "auto" });
    }
  }

  isPointerInsideViewport(event) {
    if (!this.viewport) return false;
    const rect = this.viewport.getBoundingClientRect();
    return event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
  }

  getActiveScroller() {
    const scroller = this.getScroller();
    this.setScroller(scroller);
    return this.scroller;
  }

  normalizeWheelDelta(event, scroller) {
    if (event.deltaMode === 1) return event.deltaY * 40;
    if (event.deltaMode === 2) return event.deltaY * Math.max(1, scroller.clientHeight);
    return event.deltaY;
  }

  isEventOverMinimap(event) {
    if (!this.root || !this.root.isConnected) return false;
    if (event.target instanceof Element && this.root.contains(event.target)) return true;
    const rect = this.root.getBoundingClientRect();
    return event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
  }
}

module.exports = class CursorMinimapPlugin extends Plugin {
  async onload() {
    this.controllers = new Map();
    this.imageSizes = new Map();
    this.enabled = true;

    this.addCommand({
      id: "toggle-cursor-minimap",
      name: "Toggle Cursor Minimap",
      callback: () => {
        this.enabled = !this.enabled;
        if (this.enabled) {
          this.refreshAll();
          new Notice("Minimap enabled");
        } else {
          this.destroyAll();
          new Notice("Minimap disabled");
        }
      }
    });

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshAll()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshAll()));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.refreshAll()));
    this.registerInterval(window.setInterval(() => this.refreshAll(), 1000));
    this.app.workspace.onLayoutReady(() => this.refreshAll());
  }

  onunload() {
    this.destroyAll();
  }

  refreshAll() {
    if (!this.enabled) return;
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MARKDOWN);
    const seen = new Set();
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      seen.add(view);
      let controller = this.controllers.get(view);
      if (!controller) {
        controller = new MinimapController(this, view);
        this.controllers.set(view, controller);
      }
      controller.mount();
      controller.scheduleRefresh();
    }
    for (const [view, controller] of this.controllers.entries()) {
      if (!seen.has(view) || !view.containerEl.isConnected) {
        controller.destroy();
        this.controllers.delete(view);
      }
    }
  }

  removeController(view) {
    const controller = this.controllers.get(view);
    if (!controller) return;
    controller.destroy();
    this.controllers.delete(view);
  }

  destroyAll() {
    for (const controller of this.controllers.values()) {
      controller.destroy();
    }
    this.controllers.clear();
  }
};
