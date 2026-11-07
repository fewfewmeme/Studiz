// Observable tool state of the reader (remembered per document).
import * as db from '../db.js';
import { MARK_COLORS, BRUSH_COLORS, PEN_COLORS, PEN_WIDTHS, BRUSH_WIDTHS, ERASER_SIZES } from '../../config.js';
import { settings } from '../settings.js';

export class Tools {
  constructor(docId) {
    this.docId = docId;
    this.tool = 'none';       // none | marker | underline | pen | eraser | text
    this.brush = false;       // marker draws freehand (for scans / canvases)
    this.markerMode = false;  // selecting text applies the colour at once
    this.color = 1;           // 1..6  -> --mark-N
    this.ulStyle = 'solid';   // solid | wavy | dashed | double
    this.ulColor = 5;         // index into MARK_COLORS-like "ink" colours for underline (1..6)
    this.penIdx = 0; this.penW = 1; this.brushW = 1; this.eraserIdx = 1;
    this.listeners = new Set();
  }
  async load() {
    const s = await db.kvGet('tools:' + this.docId, null);
    if (!s) { this.color = settings().defaultMarkColor || 1; this.markerMode = !!settings().defaultMarkerMode; }
    if (s) for (const k of ['brush', 'markerMode', 'color', 'ulStyle', 'ulColor', 'penIdx', 'penW', 'brushW', 'eraserIdx']) if (s[k] !== undefined) this[k] = s[k];
    return this;
  }
  persist() {
    const o = {}; for (const k of ['brush', 'markerMode', 'color', 'ulStyle', 'ulColor', 'penIdx', 'penW', 'brushW', 'eraserIdx']) o[k] = this[k];
    db.kvSet('tools:' + this.docId, o).catch(() => {});
  }
  set(patch) { Object.assign(this, patch); this.persist(); this.listeners.forEach(f => f(this)); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  drawTool() {
    if (this.tool === 'pen') return 'pen';
    if (this.tool === 'eraser') return 'eraser';
    if (this.tool === 'text') return 'text';
    if (this.tool === 'marker' && this.brush) return 'brush';
    return null;
  }
  drawing() { return !!this.drawTool(); }
  markColorToken() { return 'm' + this.color; }
  penColor() { return PEN_COLORS[this.penIdx]; }
  penWidth() { return PEN_WIDTHS[this.penW]; }
  brushColor() { return BRUSH_COLORS[this.color - 1]; }
  brushWidth() { return BRUSH_WIDTHS[this.brushW]; }
  eraserSize() { return ERASER_SIZES[this.eraserIdx]; }
  ulInk() { return PEN_COLORS[Math.min(PEN_COLORS.length - 1, this.ulColor)]; }
  markHex() { return MARK_COLORS[this.color - 1]; }
}
