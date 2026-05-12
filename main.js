const { Plugin, MarkdownView, Notice } = require("obsidian");

const VIEW_TYPE_MARKDOWN = "markdown";

class MinimapController {
  constructor(plugin, view) {
    this.plugin = plugin;
    this.view = view;
    this.editor = view.editor;
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.viewport = null;
    this.scroller = null;
    this.raf = 0;
    this.dragging = false;
    this.boundScroll = () => this.scheduleRefresh();
    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = (event) => this.onPointerUp(event);
    this.boundWheel = (event) => this.onWheel(event);
  }

  mount() {
    if (!this.view?.containerEl || this.root) return;
    this.scroller = this.view.containerEl.querySelector(".cm-scroller");
    const content = this.view.containerEl.querySelector(".view-content");
    if (!content || !this.scroller) return;

    content.addClass("cursor-minimap-host");
    this.root = content.createDiv({ cls: "cursor-minimap" });
    this.canvas = this.root.createEl("canvas", { cls: "cursor-minimap-canvas" });
    this.viewport = this.root.createDiv({ cls: "cursor-minimap-viewport" });
    this.ctx = this.canvas.getContext("2d");

    this.root.addEventListener("pointerdown", this.boundPointerDown);
    window.addEventListener("pointermove", this.boundPointerMove, true);
    window.addEventListener("pointerup", this.boundPointerUp, true);
    this.root.addEventListener("wheel", this.boundWheel, { passive: false });
    this.scroller.addEventListener("scroll", this.boundScroll, { passive: true });

    this.scheduleRefresh();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.scroller?.removeEventListener("scroll", this.boundScroll);
    this.root?.removeEventListener("pointerdown", this.boundPointerDown);
    this.root?.removeEventListener("wheel", this.boundWheel);
    window.removeEventListener("pointermove", this.boundPointerMove, true);
    window.removeEventListener("pointerup", this.boundPointerUp, true);
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.viewport = null;
    this.scroller = null;
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
    this.scroller = this.view.containerEl.querySelector(".cm-scroller");
    if (!this.editor || !this.scroller) return;

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

    const lastLine = this.safeLastLine();
    const lineCount = Math.max(1, lastLine + 1);
    const rowHeight = height / lineCount;
    const minPaintHeight = lineCount > height * 1.5 ? 0.55 : Math.max(0.75, Math.min(2, rowHeight));
    const charWidth = lineCount > 1800 ? 1.05 : lineCount > 900 ? 1.25 : 1.55;
    const maxColumns = Math.max(30, Math.floor((width - 12) / charWidth));

    for (let lineNo = 0; lineNo <= lastLine; lineNo++) {
      const line = this.editor.getLine(lineNo) || "";
      const y = lineNo * rowHeight;
      if (y > height) break;
      this.renderMinimapLine(ctx, line, y, rowHeight, minPaintHeight, charWidth, maxColumns);
    }

    this.refreshViewport(height);
  }

  renderMinimapLine(ctx, line, y, rowHeight, minPaintHeight, charWidth, maxColumns) {
    const visible = line.slice(0, maxColumns).replace(/\t/g, "  ");
    if (!visible.trim()) return;
    const lineType = this.getLineType(line);
    if (lineType === "image") {
      this.renderImageBlock(ctx, line, y, rowHeight, minPaintHeight);
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
    const h = Math.max(minPaintHeight, Math.min(24, Math.max(rowHeight * 8, minPaintHeight)));
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

  getLineType(line) {
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
    const fullScrollHeight = Math.max(clientHeight, this.scroller.scrollHeight);
    const viewportHeight = Math.max(16, Math.min(height, clientHeight / fullScrollHeight * height));
    const top = Math.max(0, Math.min(height - viewportHeight, this.scroller.scrollTop / fullScrollHeight * height));
    this.viewport.style.top = `${Math.min(height - viewportHeight, top)}px`;
    this.viewport.style.height = `${viewportHeight}px`;
  }

  safeLastLine() {
    if (typeof this.editor.lastLine === "function") return this.editor.lastLine();
    if (typeof this.editor.lineCount === "function") return Math.max(0, this.editor.lineCount() - 1);
    return 0;
  }

  onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    this.root?.setPointerCapture?.(event.pointerId);
    this.dragging = true;
    this.jumpToPointer(event);
  }

  onPointerMove(event) {
    if (!this.dragging) return;
    event.preventDefault();
    event.stopPropagation();
    this.jumpToPointer(event);
  }

  onPointerUp(event) {
    if (this.dragging && event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.dragging = false;
  }

  onWheel(event) {
    if (!this.scroller) return;
    event.preventDefault();
    event.stopPropagation();
    this.scroller.scrollTop += event.deltaY;
    this.scheduleRefresh();
  }

  jumpToPointer(event) {
    if (!this.root || !this.scroller) return;
    const rect = this.root.getBoundingClientRect();
    const ratio = rect.height <= 0 ? 0 : Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const maxScroll = Math.max(1, this.scroller.scrollHeight - this.scroller.clientHeight);
    const fullScrollHeight = Math.max(this.scroller.clientHeight, this.scroller.scrollHeight);
    this.scroller.scrollTop = Math.max(0, Math.min(maxScroll, ratio * fullScrollHeight));
    this.scheduleRefresh();
  }
}

module.exports = class CursorMinimapPlugin extends Plugin {
  async onload() {
    this.controllers = new Map();
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
      if (!(view instanceof MarkdownView) || !view.editor) continue;
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
