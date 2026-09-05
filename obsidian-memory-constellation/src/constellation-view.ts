import { ItemView, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { GraphTransition, type MotionFrame, type MotionNode } from "./graph-motion";
import {
  buildGraph,
  searchNodes,
  shortenTitle,
  graphBounds,
  neighborhood,
  type GraphModel,
  type GraphNode,
  type GraphScope,
  type NodeKind,
  type NoteInput,
  type ResolvedLinkInput,
} from "./graph-model";

export const MEMORY_CONSTELLATION_VIEW = "memory-constellation-view";

type DisplayMode = "focus" | "panorama";

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface Point {
  x: number;
  y: number;
}

interface LabelBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface NodeVisual {
  opacity: number;
  active: number;
  label: number;
}

const COLORS: Record<NodeKind, string> = {
  home: "#ddcbaa",
  memory: "#b8acd7",
  workstream: "#95b4cf",
  worklog: "#7e91a7",
  guide: "#c3c7ce",
  "document-home": "#cec2b1",
  "document-index": "#a9a6c1",
  document: "#737f90",
};

const KIND_LABELS: Record<NodeKind, string> = {
  home: "记忆首页", memory: "项目记忆", workstream: "工作流", worklog: "工作记录",
  guide: "Agent 指引", "document-home": "文档首页", "document-index": "文档索引", document: "项目文档",
};

export class MemoryConstellationView extends ItemView {
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private graph: GraphModel = { nodes: [], edges: [], homeId: null };
  private nodeById = new Map<string, GraphNode>();
  private graphScope: GraphScope = "memory";
  private displayMode: DisplayMode = "focus";
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private targetCamera: Camera = { x: 0, y: 0, zoom: 1 };
  private width = 1;
  private height = 1;
  private animationFrame = 0;
  private graphTransition: GraphTransition | null = null;
  private motionFrame: MotionFrame | null = null;
  private motionNodes = new Map<string, MotionNode>();
  private lastFrameTime = 0;
  private nodeVisuals = new Map<string, NodeVisual>();
  private edgeVisuals = new Map<string, number>();
  private focusAmount = 0;
  private frameMoving = false;
  private closed = false;
  private fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  private rebuildTimer: number | null = null;
  private dragging = false;
  private pointerDown = false;
  private suppressClick = false;
  private pointerStart: Point = { x: 0, y: 0 };
  private lastPointer: Point = { x: 0, y: 0 };
  private reducedMotion = false;
  private backdropLightEl!: HTMLElement;
  private backdropAnimationFrame = 0;
  private backdropTarget: Point | null = null;
  private backdropPosition: Point = { x: 0, y: 0 };
  private backdropLastTime = 0;
  private backdropStretch = 0;
  private backdropAngle = 0;
  private statusEl!: HTMLElement;
  private captionEl!: HTMLElement;
  private zoomEl!: HTMLElement;
  private scopeButton!: HTMLButtonElement;
  private modeButton!: HTMLButtonElement;
  private replayButton!: HTMLButtonElement;
  private searchInput!: HTMLInputElement;
  private searchPanel!: HTMLElement;
  private searchSummary!: HTMLElement;
  private searchList!: HTMLElement;
  private searchResults: GraphNode[] = [];
  private searchIndex = -1;
  private relationsPanel!: HTMLElement;
  private relationsTitle!: HTMLElement;
  private relationsMeta!: HTMLElement;
  private relationsPath!: HTMLElement;
  private relationsCount!: HTMLElement;
  private relationsFilter!: HTMLInputElement;
  private relationsList!: HTMLElement;
  private relationsClose!: HTMLButtonElement;
  private relationsOpen!: HTMLButtonElement;
  private resizeObserver!: ResizeObserver;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return MEMORY_CONSTELLATION_VIEW;
  }

  getDisplayText(): string {
    return "记忆星图";
  }

  getIcon(): string {
    return "sparkles";
  }

  async onOpen(): Promise<void> {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderShell();
    this.registerInteractions();
    this.registerVaultEvents();
    this.rebuildGraph(true);
    this.requestDraw();
  }

  async onClose(): Promise<void> {
    this.closed = true;
    window.cancelAnimationFrame(this.animationFrame);
    this.graphTransition = null;
    this.motionFrame = null;
    this.motionNodes.clear();
    this.hideBackdropLight();
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    this.contentEl.empty();
  }

  onResize(): void {
    this.resizeCanvas();
  }

  private renderShell(): void {
    this.contentEl.empty();
    this.contentEl.addClass("memory-constellation");
    this.fontFamily = getComputedStyle(this.contentEl).fontFamily || this.fontFamily;
    this.backdropLightEl = this.createElement("div", "memory-constellation__cursor-light");
    this.backdropLightEl.setAttribute("aria-hidden", "true");

    const chrome = this.createElement("div", "memory-constellation__chrome");
    const heading = this.createElement("div", "memory-constellation__heading");
    heading.append(
      this.createElement("span", "memory-constellation__mark", "◈"),
      this.createElement("span", "memory-constellation__title", "项目记忆"),
    );
    const controls = this.createElement("div", "memory-constellation__controls memory-constellation__glass");
    const searchWrap = this.createElement("label", "memory-constellation__search");
    const searchLabel = this.createElement("span", "memory-constellation__instructions", "搜索笔记标题、文件名或路径");
    const searchIcon = this.createElement("span", "memory-constellation__search-icon");
    setIcon(searchIcon, "search");
    this.searchInput = this.createElement("input", "memory-constellation__search-input");
    this.searchInput.type = "search";
    this.searchInput.placeholder = "搜索记忆…";
    this.searchInput.setAttribute("role", "combobox");
    this.searchInput.setAttribute("aria-autocomplete", "list");
    this.searchInput.setAttribute("aria-expanded", "false");
    this.searchInput.autocomplete = "off";
    this.searchInput.spellcheck = false;
    searchWrap.append(searchLabel, searchIcon, this.searchInput);

    this.searchPanel = this.createElement("div", "memory-constellation__search-panel");
    this.searchPanel.hidden = true;
    this.searchSummary = this.createElement("div", "memory-constellation__search-summary");
    this.searchSummary.setAttribute("role", "status");
    this.searchList = this.createElement("div", "memory-constellation__search-list");
    this.searchList.id = `memory-constellation-search-${crypto.randomUUID()}`;
    this.searchList.setAttribute("role", "listbox");
    this.searchList.setAttribute("aria-label", "匹配的笔记");
    this.searchInput.setAttribute("aria-controls", this.searchList.id);
    const searchHint = this.createElement("div", "memory-constellation__search-hint",
      "↑↓ 选择 · Enter 定位 · ⌘/Ctrl+Enter 打开");
    this.searchPanel.append(this.searchSummary, this.searchList, searchHint);

    this.scopeButton = this.createButton("记忆", "切换是否显示项目文档");
    this.modeButton = this.createButton("简洁", "切换简洁或全景标签");
    controls.append(searchWrap, this.scopeButton, this.modeButton, this.searchPanel);
    chrome.append(heading, controls);

    this.canvas = this.createElement("canvas", "memory-constellation__canvas");
    this.canvas.tabIndex = 0;
    const instructions = this.createElement(
      "span",
      "memory-constellation__instructions",
      "记忆星图画布：悬停预览，单击锁定关系与关联列表，再次单击取消，双击打开笔记，Escape 取消锁定，滚轮缩放，拖拽平移",
    );
    instructions.id = `memory-constellation-help-${crypto.randomUUID()}`;
    this.canvas.setAttribute("aria-labelledby", instructions.id);
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    const texture = document.createElement("canvas");
    texture.width = texture.height = 256;
    const textureContext = texture.getContext("2d")!;
    const pixels = textureContext.createImageData(256, 256);
    pixels.data.set(createBackdropPixels(256));
    textureContext.putImageData(pixels, 0, 0);
    this.backdropLightEl.style.backgroundImage = `url("${texture.toDataURL()}")`;

    this.statusEl = this.createElement("div", "memory-constellation__status", "正在整理星图…");
    this.captionEl = this.createElement("div", "memory-constellation__caption memory-constellation__glass");
    this.captionEl.setAttribute("aria-live", "polite");
    const navigation = this.createElement("div", "memory-constellation__navigation memory-constellation__glass");
    const zoomOut = this.createButton("", "缩小");
    const zoomIn = this.createButton("", "放大");
    const homeButton = this.createButton("", "适应全图");
    this.replayButton = this.createButton("", "重播生长动画");
    this.replayButton.classList.add("memory-constellation__replay");
    setIcon(this.replayButton, "rotate-ccw");
    setIcon(zoomOut, "minus");
    setIcon(zoomIn, "plus");
    setIcon(homeButton, "scan");
    this.zoomEl = this.createElement("span", "memory-constellation__zoom", "100%");
    navigation.append(zoomOut, this.zoomEl, zoomIn, homeButton, this.replayButton);
    this.contentEl.append(this.backdropLightEl, chrome, this.canvas, instructions, this.statusEl, this.captionEl, navigation);
    this.renderRelationsShell();
    this.registerBackdropInteraction();
    this.registerGlassInteraction(controls);
    this.registerGlassInteraction(navigation);

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.contentEl);
    this.register(() => this.resizeObserver.disconnect());
    this.resizeCanvas();

    this.registerDomEvent(homeButton, "click", () => {
      this.setSelection(null);
      this.fitAll(false);
    });
    this.registerDomEvent(zoomOut, "click", () => this.zoomFromCenter(1 / 1.18));
    this.registerDomEvent(zoomIn, "click", () => this.zoomFromCenter(1.18));
  }

  private registerBackdropInteraction(): void {
    const hide = () => this.hideBackdropLight();
    // Listen above both the canvas and controls so the same light passes behind glass.
    this.registerDomEvent(this.contentEl, "pointermove", (event) => {
      if (this.reducedMotion || event.pointerType === "touch") {
        hide();
        return;
      }
      const bounds = this.contentEl.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) {
        hide();
        return;
      }
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (!this.backdropTarget) {
        this.backdropPosition = { x, y };
        this.backdropStretch = 0;
        this.backdropLastTime = 0;
      }
      this.backdropTarget = { x, y };
      this.backdropLightEl.classList.toggle("is-visible", true);
      this.requestBackdropFrame();
    });
    this.registerDomEvent(this.contentEl, "pointerleave", hide);
    this.registerDomEvent(this.contentEl, "pointercancel", hide);
    const ownerWindow = this.contentEl.ownerDocument.defaultView;
    if (ownerWindow) this.registerDomEvent(ownerWindow, "blur", hide);
  }

  private hideBackdropLight(): void {
    this.backdropLightEl.classList.toggle("is-visible", false);
    this.backdropTarget = null;
    this.contentEl.ownerDocument.defaultView?.cancelAnimationFrame(this.backdropAnimationFrame);
    this.backdropAnimationFrame = 0;
  }

  private requestBackdropFrame(): void {
    if (this.closed || this.backdropAnimationFrame) return;
    this.backdropAnimationFrame = this.contentEl.ownerDocument.defaultView!.requestAnimationFrame(
      (time) => this.drawBackdropFrame(time),
    );
  }

  private drawBackdropFrame(time: number): void {
    this.backdropAnimationFrame = 0;
    if (this.closed || !this.backdropTarget) return;
    const elapsed = this.backdropLastTime ? clamp(time - this.backdropLastTime, 1, 32) : 16;
    this.backdropLastTime = time;
    const step = 1 - Math.exp(-elapsed / 45);
    const dx = this.backdropTarget.x - this.backdropPosition.x;
    const dy = this.backdropTarget.y - this.backdropPosition.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.1) {
      this.backdropPosition.x += dx * step;
      this.backdropPosition.y += dy * step;
      this.backdropAngle = Math.atan2(dy, dx);
    } else {
      this.backdropPosition = { ...this.backdropTarget };
    }
    const stretch = Math.min(distance / 220, 0.22);
    this.backdropStretch += (stretch - this.backdropStretch) * step;
    if (distance <= 0.1 && this.backdropStretch < 0.001) this.backdropStretch = 0;
    const { x, y } = this.backdropPosition;
    this.backdropLightEl.style.transform =
      `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${this.backdropAngle}rad) ` +
      `scale(${1 + this.backdropStretch}, ${1 - this.backdropStretch * 0.5})`;
    if (distance > 0.1 || this.backdropStretch > 0) this.requestBackdropFrame();
  }

  private registerGlassInteraction(surface: HTMLElement): void {
    this.registerDomEvent(surface, "pointermove", (event) => {
      if (this.reducedMotion || event.pointerType === "touch") return;
      const bounds = surface.getBoundingClientRect();
      const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
      const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
      surface.style.setProperty("--mc-glass-x", `${x * 100}%`);
      surface.style.setProperty("--mc-glass-y", `${y * 100}%`);
    });
    this.registerDomEvent(surface, "pointerleave", () => {
      surface.style.setProperty("--mc-glass-x", "30%");
      surface.style.setProperty("--mc-glass-y", "0%");
    });
  }

  private registerInteractions(): void {
    this.registerDomEvent(this.scopeButton, "click", () => {
      this.graphScope = this.graphScope === "memory" ? "memory-and-docs" : "memory";
      this.scopeButton.textContent = this.graphScope === "memory" ? "记忆" : "记忆 + 文档";
      this.scopeButton.classList.toggle("is-active", this.graphScope === "memory-and-docs");
      this.rebuildGraph(true);
    });

    this.registerDomEvent(this.modeButton, "click", () => {
      this.displayMode = this.displayMode === "focus" ? "panorama" : "focus";
      this.modeButton.textContent = this.displayMode === "focus" ? "简洁" : "全景";
      this.modeButton.classList.toggle("is-active", this.displayMode === "panorama");
      this.requestDraw();
    });

    this.registerSearchInteractions();
    this.registerRelationsInteractions();
    this.registerDomEvent(this.replayButton, "click", () => this.replayGrowth());

    this.registerDomEvent(this.canvas, "pointerdown", (event) => {
      if (event.button !== 0) return;
      this.pointerDown = true;
      this.dragging = false;
      this.suppressClick = false;
      this.pointerStart = this.eventPoint(event);
      this.lastPointer = this.pointerStart;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.registerDomEvent(this.canvas, "pointermove", (event) => {
      const point = this.eventPoint(event);
      if (this.pointerDown) {
        const totalDistance = Math.hypot(
          point.x - this.pointerStart.x,
          point.y - this.pointerStart.y,
        );
        if (totalDistance > 3) this.dragging = true;
        if (this.dragging) {
          this.setHovered(null);
          const deltaX = (point.x - this.lastPointer.x) / this.camera.zoom;
          const deltaY = (point.y - this.lastPointer.y) / this.camera.zoom;
          this.camera.x += deltaX;
          this.camera.y += deltaY;
          this.targetCamera = { ...this.camera };
          this.requestDraw();
        }
      } else {
        this.updateHover(point);
      }
      this.lastPointer = point;
    });

    this.registerDomEvent(this.canvas, "pointerup", (event) => {
      if (event.button !== 0) return;
      const point = this.eventPoint(event);
      this.suppressClick = this.dragging;
      this.pointerDown = false;
      this.dragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
      this.updateHover(point);
    });

    this.registerDomEvent(this.canvas, "click", (event) => {
      if (this.suppressClick || event.detail > 1) return;
      const node = this.hitTest(this.eventPoint(event));
      this.setSelection(node && node.id !== this.selectedId ? node.id : null);
    });

    this.registerDomEvent(this.canvas, "pointerleave", () => {
      this.setHovered(null);
    });

    this.registerDomEvent(this.canvas, "pointercancel", () => {
      this.pointerDown = false;
      this.dragging = false;
      this.suppressClick = true;
      this.setHovered(null);
    });

    this.registerDomEvent(this.canvas, "dblclick", (event) => {
      const node = this.hitTest(this.eventPoint(event));
      if (node) {
        this.setSelection(node.id);
        void this.openNode(node);
      }
    });

    this.registerDomEvent(
      this.canvas,
      "wheel",
      (event) => {
        event.preventDefault();
        const point = this.eventPoint(event);
        const oldZoom = this.camera.zoom;
        const newZoom = clamp(oldZoom * Math.exp(-event.deltaY * 0.0012), 0.28, 2.4);
        const worldX = (point.x - this.width / 2) / oldZoom - this.camera.x;
        const worldY = (point.y - this.height / 2) / oldZoom - this.camera.y;
        this.camera.zoom = newZoom;
        this.camera.x = (point.x - this.width / 2) / newZoom - worldX;
        this.camera.y = (point.y - this.height / 2) / newZoom - worldY;
        this.targetCamera = { ...this.camera };
        this.updateHover(point);
        this.requestDraw();
      },
      { passive: false },
    );

    this.registerDomEvent(this.canvas, "keydown", (event) => {
      if (event.key === "Escape") this.setSelection(null);
      if (event.key === "Enter" && this.selectedId) {
        const node = this.nodeById.get(this.selectedId);
        if (node) void this.openNode(node);
      }
      if (event.key === "+" || event.key === "=") this.zoomFromCenter(1.18);
      if (event.key === "-") this.zoomFromCenter(1 / 1.18);
    });
  }

  private get focusId(): string | null {
    return this.selectedId ?? this.hoveredId;
  }

  private renderRelationsShell(): void {
    this.relationsPanel = this.createElement("aside", "memory-constellation__relations memory-constellation__glass");
    this.relationsPanel.inert = true;
    this.relationsPanel.setAttribute("aria-hidden", "true");
    const top = this.createElement("div", "memory-constellation__relations-top");
    this.relationsMeta = this.createElement("span", "memory-constellation__relations-meta");
    this.relationsClose = this.createButton("", "取消选中并关闭关联列表");
    setIcon(this.relationsClose, "x");
    top.append(this.relationsMeta, this.relationsClose);
    this.relationsTitle = this.createElement("h3", "memory-constellation__relations-title");
    this.relationsTitle.id = `memory-constellation-relations-${crypto.randomUUID()}`;
    this.relationsPanel.setAttribute("aria-labelledby", this.relationsTitle.id);
    this.relationsPath = this.createElement("div", "memory-constellation__result-path");
    this.relationsOpen = this.createButton("打开笔记 ↗", "打开当前选中的笔记");
    this.relationsFilter = this.createElement("input", "memory-constellation__relations-filter");
    this.relationsFilter.type = "search";
    this.relationsFilter.placeholder = "筛选关联笔记…";
    this.relationsFilter.setAttribute("aria-label", "筛选当前节点的直接关联笔记");
    this.relationsCount = this.createElement("div", "memory-constellation__relations-meta");
    this.relationsCount.setAttribute("role", "status");
    this.relationsList = this.createElement("div", "memory-constellation__relations-list");
    this.relationsList.setAttribute("role", "list");
    this.relationsPanel.append(top, this.relationsTitle, this.relationsPath, this.relationsOpen,
      this.relationsFilter, this.relationsCount, this.relationsList,
      this.createElement("div", "memory-constellation__relations-meta", "单击条目定位 · ↗ 打开文件 · Esc 取消锁定"));
    this.contentEl.append(this.relationsPanel);
  }

  private setSelection(id: string | null): void {
    const node = id ? this.nodeById.get(id) : null;
    if (id && !node) return;
    const wasSelected = this.selectedId !== null;
    const changed = this.selectedId !== id;
    this.selectedId = id;
    this.setHovered(null);
    if (changed) {
      this.relationsFilter.value = "";
      this.relationsList.scrollTop = 0;
      if (node && !wasSelected) this.relationsPanel.classList.toggle("is-left", this.worldToScreen(node).x > this.width / 2);
    }
    if (!node && this.relationsPanel.contains(this.relationsPanel.ownerDocument.activeElement)) {
      this.canvas.focus({ preventScroll: true });
    }
    this.relationsPanel.inert = !node;
    this.relationsPanel.setAttribute("aria-hidden", String(!node));
    this.relationsPanel.classList.toggle("is-open", Boolean(node));
    this.updateRelations();
    this.requestDraw();
  }

  private updateRelations(): void {
    const node = this.selectedId ? this.nodeById.get(this.selectedId) : null;
    const scroll = this.relationsList.scrollTop;
    this.relationsList.replaceChildren();
    if (!node) return;
    this.relationsTitle.textContent = shortenTitle(node.fullTitle, node.kind, Infinity);
    this.relationsMeta.textContent = `已锁定 · ${KIND_LABELS[node.kind]}`;
    this.relationsPath.textContent = node.path;
    const ids = neighborhood(this.graph, node.id, 1);
    const neighbors = this.graph.nodes.filter((item) => item.id !== node.id && ids.has(item.id))
      .sort((a, b) => b.priority - a.priority || a.path.localeCompare(b.path, "zh-CN"));
    const query = this.relationsFilter.value.trim();
    const matches = query ? searchNodes({ nodes: neighbors, edges: [], homeId: null }, query) : neighbors;
    this.relationsCount.textContent = `${query ? `${matches.length} / ` : ""}${neighbors.length} 条直接关联`;
    for (const item of matches) {
      const title = shortenTitle(item.fullTitle, item.kind, Infinity);
      const row = this.createElement("div", "memory-constellation__relation-row");
      row.setAttribute("role", "listitem");
      const select = this.createElement("button", "memory-constellation__relation-note");
      select.type = "button";
      select.dataset.relationAction = "select";
      select.dataset.nodeId = item.id;
      const heading = this.createElement("span", "memory-constellation__result-heading");
      heading.append(this.createElement("span", "memory-constellation__result-title", title),
        this.createElement("span", "memory-constellation__result-kind", KIND_LABELS[item.kind]));
      select.append(heading, this.createElement("span", "memory-constellation__result-path", item.path));
      const open = this.createButton("", `打开：${title}`);
      setIcon(open, "arrow-up-right");
      open.dataset.relationAction = "open";
      open.dataset.nodeId = item.id;
      row.append(select, open);
      this.relationsList.append(row);
    }
    if (!matches.length) this.relationsList.append(this.createElement("div", "memory-constellation__search-empty",
      query ? "没有匹配的关联笔记。" : "当前范围内没有直接关联笔记。"));
    this.relationsList.scrollTop = scroll;
  }

  private registerRelationsInteractions(): void {
    this.registerDomEvent(this.relationsClose, "click", () => this.setSelection(null));
    this.registerDomEvent(this.relationsOpen, "click", () => {
      const node = this.selectedId ? this.nodeById.get(this.selectedId) : null;
      if (node) void this.openNode(node);
    });
    this.registerDomEvent(this.relationsFilter, "input", () => {
      this.relationsList.scrollTop = 0;
      this.updateRelations();
    });
    this.registerDomEvent(this.relationsPanel, "keydown", (event) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        this.setSelection(null);
      }
    });
    this.registerDomEvent(this.relationsList, "click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>("[data-relation-action]");
      const node = action?.dataset.nodeId ? this.nodeById.get(action.dataset.nodeId) : null;
      if (!node || event.detail > 1) return;
      if (action!.dataset.relationAction === "open" || event.metaKey || event.ctrlKey) void this.openNode(node);
      else {
        this.canvas.focus({ preventScroll: true });
        this.selectNode(node.id, true);
      }
    });
    this.registerDomEvent(this.relationsList, "pointerover", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
      this.setHovered(row?.dataset.nodeId ?? null);
    });
    this.registerDomEvent(this.relationsList, "pointerleave", () => this.setHovered(null));
  }

  private registerSearchInteractions(): void {
    this.registerDomEvent(this.searchInput, "input", () => this.updateSearch());
    this.registerDomEvent(this.searchInput, "focus", () => this.updateSearch());
    this.registerDomEvent(this.searchInput, "blur", () => this.closeSearch());
    this.registerDomEvent(this.searchInput, "keydown", (event) => {
      // Enter confirms a Chinese IME candidate before it can navigate the graph.
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
        this.closeSearch();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const wasClosed = this.searchPanel.hidden;
      if (wasClosed) this.updateSearch();
      if (!this.searchResults.length) return;
      if (event.key === "Enter") {
        this.activateSearchResult(this.searchIndex, event.metaKey || event.ctrlKey);
      } else {
        const step = event.key === "ArrowDown" ? 1 : -1;
        const index = wasClosed ? (step === 1 ? 0 : this.searchResults.length - 1)
          : (this.searchIndex + step + this.searchResults.length) % this.searchResults.length;
        this.setSearchIndex(index, true);
      }
    });
    this.registerDomEvent(this.searchList, "mousedown", (event) => {
      if ((event.target as HTMLElement).closest("[data-search-index]")) event.preventDefault();
    });
    this.registerDomEvent(this.searchList, "click", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-search-index]");
      if (row) this.activateSearchResult(Number(row.dataset.searchIndex), event.metaKey || event.ctrlKey);
    });
  }

  private updateSearch(): void {
    const query = this.searchInput.value.trim();
    this.searchResults = searchNodes(this.graph, query);
    this.searchList.replaceChildren();
    this.searchList.scrollTop = 0;
    this.searchPanel.hidden = false;
    this.searchInput.setAttribute("aria-expanded", "true");
    const scope = this.graphScope === "memory" ? "记忆（含 Agent 指引）" : "记忆 + 文档（含 Agent 指引）";
    this.searchSummary.textContent = `${query ? `${this.searchResults.length} 项匹配` : "标题 · 文件名 · 路径"} · ${scope}`;
    for (const [index, node] of this.searchResults.entries()) {
      const row = this.createElement("div", "memory-constellation__search-result");
      row.id = `${this.searchList.id}-${index}`;
      row.dataset.searchIndex = String(index);
      row.setAttribute("role", "option");
      const heading = this.createElement("div", "memory-constellation__result-heading");
      const title = this.createElement("span", "memory-constellation__result-title",
        shortenTitle(node.fullTitle, node.kind, Infinity));
      const kind = this.createElement("span", "memory-constellation__result-kind", KIND_LABELS[node.kind]);
      heading.append(title, kind);
      row.append(heading, this.createElement("div", "memory-constellation__result-path", node.path));
      this.searchList.append(row);
    }
    if (!this.searchResults.length) {
      const message = !query ? "输入关键词，用空格组合筛选。"
        : this.graphScope === "memory" ? "当前记忆范围没有匹配。可换关键词，或切换“记忆 + 文档”。"
        : "没有匹配的标题或路径，试试更短的关键词。";
      this.searchList.append(this.createElement("div", "memory-constellation__search-empty", message));
    }
    this.setSearchIndex(this.searchResults.length ? 0 : -1);
  }

  private setSearchIndex(index: number, scroll = false): void {
    this.searchIndex = index;
    for (const [rowIndex, row] of Array.from(this.searchList.children).entries()) {
      row.classList.toggle("is-selected", rowIndex === index);
      if (this.searchResults.length) row.setAttribute("aria-selected", String(rowIndex === index));
    }
    if (index < 0) this.searchInput.removeAttribute("aria-activedescendant");
    else {
      const row = this.searchList.children[index]!;
      this.searchInput.setAttribute("aria-activedescendant", row.id);
      if (scroll) row.scrollIntoView({ block: "nearest" });
    }
  }

  private activateSearchResult(index: number, open: boolean): void {
    const node = this.searchResults[index];
    if (!node || !this.nodeById.has(node.id)) return;
    this.closeSearch();
    this.selectNode(node.id, true);
    if (open) void this.openNode(node);
    else this.canvas.focus({ preventScroll: true });
  }

  private closeSearch(): void {
    this.searchPanel.hidden = true;
    this.searchInput.setAttribute("aria-expanded", "false");
    this.searchInput.removeAttribute("aria-activedescendant");
  }

  private registerVaultEvents(): void {
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.scheduleRebuild()));
    this.registerEvent(this.app.vault.on("create", () => this.scheduleRebuild()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRebuild()));
    this.registerEvent(this.app.vault.on("rename", () => this.scheduleRebuild()));
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuildGraph(false);
    }, 240);
  }

  private rebuildGraph(resetView: boolean): void {
    const now = performance.now();
    const previousGraph = this.graphTransition?.sample(now) ?? this.graph;
    const notes: NoteInput[] = this.app.vault.getMarkdownFiles().map((file) => ({
      path: file.path,
      basename: file.basename,
      mtime: file.stat.mtime,
      frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter,
    }));

    const links: ResolvedLinkInput[] = [];
    for (const [source, targets] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      for (const [target, weight] of Object.entries(targets)) {
        links.push({ source, target, weight });
      }
    }

    const previousSelection = this.selectedId;
    this.graph = buildGraph(notes, links, this.graphScope);
    this.nodeById = new Map(this.graph.nodes.map((node) => [node.id, node]));
    this.setSelection(previousSelection && this.nodeById.has(previousSelection) ? previousSelection : null);
    this.startGraphTransition(previousGraph, now);
    this.statusEl.textContent = `${this.graph.nodes.length} 个节点   /   ${this.graph.edges.length} 条关系`;
    this.searchInput.placeholder = this.graphScope === "memory" ? "搜索记忆…" : "搜索记忆与文档…";
    if (!this.searchPanel.hidden) this.updateSearch();
    if (resetView) this.fitAll(previousGraph.nodes.length === 0);
    this.requestDraw();
  }

  private startGraphTransition(from: GraphModel | MotionFrame, time: number, durationMs?: number): void {
    this.graphTransition = this.reducedMotion ? null : new GraphTransition(from, this.graph, time, durationMs);
    this.motionFrame = this.graphTransition?.sample(time) ?? null;
    this.motionNodes = new Map(this.motionFrame?.nodes.map((node) => [node.id, node]) ?? []);
    // Retain in-flight hover/label values; prune only after the exit animation completes.
    if (!this.graphTransition) this.pruneVisuals();
  }

  private pruneVisuals(): void {
    const edgeIds = new Set(this.graph.edges.map((edge) => edge.id));
    for (const id of this.nodeVisuals.keys()) if (!this.nodeById.has(id)) this.nodeVisuals.delete(id);
    for (const id of this.edgeVisuals.keys()) if (!edgeIds.has(id)) this.edgeVisuals.delete(id);
  }

  private replayGrowth(): void {
    this.setSelection(null);
    this.closeSearch();
    this.nodeVisuals.clear();
    this.edgeVisuals.clear();
    this.focusAmount = 0;
    this.startGraphTransition({ nodes: [], edges: [], homeId: null }, performance.now(), 10000);
    this.fitAll(true);
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const bounds = this.canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(bounds.width));
    const nextHeight = Math.max(1, Math.floor(bounds.height));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = nextWidth;
    this.height = nextHeight;
    this.searchList.style.maxHeight = `${Math.max(48, Math.min(360, this.height - 190))}px`;
    this.canvas.width = Math.floor(nextWidth * ratio);
    this.canvas.height = Math.floor(nextHeight * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.requestDraw();
  }

  private requestDraw(): void {
    if (this.closed || this.animationFrame) return;
    this.animationFrame = window.requestAnimationFrame((time) => this.drawFrame(time));
  }

  private approach(value: number, target: number, step: number): number {
    if (this.reducedMotion || Math.abs(target - value) < 0.002) return target;
    this.frameMoving = true;
    return value + (target - value) * step;
  }

  private drawFrame(time: number): void {
    this.animationFrame = 0;
    if (this.closed) return;
    this.frameMoving = false;
    const elapsed = this.lastFrameTime ? clamp(time - this.lastFrameTime, 1, 32) : 16;
    this.lastFrameTime = time;
    const step = 1 - Math.exp(-elapsed / 72);
    const cameraStep = 1 - Math.exp(-elapsed / 95);
    for (const key of ["x", "y", "zoom"] as const) {
      this.camera[key] = this.approach(this.camera[key], this.targetCamera[key], cameraStep);
    }
    this.zoomEl.textContent = `${Math.round(this.camera.zoom * 100)}%`;

    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const activeId = this.focusId;
    const directSet = neighborhood(this.graph, activeId, 1);
    this.focusAmount = this.approach(this.focusAmount, activeId ? 1 : 0, step);
    if (this.graphTransition) {
      this.motionFrame = this.graphTransition.sample(time);
      if (this.motionFrame.moving && !this.reducedMotion) this.frameMoving = true;
      else {
        this.graphTransition = null;
        this.motionFrame = null;
        this.pruneVisuals();
      }
      this.motionNodes = new Map(this.motionFrame?.nodes.map((node) => [node.id, node]) ?? []);
    }

    for (const node of this.motionFrame?.nodes ?? this.graph.nodes) {
      const visual = this.nodeVisuals.get(node.id) ?? { opacity: 0.84, active: 0, label: 0 };
      const opacity = activeId === null ? 0.84 : directSet.has(node.id) ? 0.96 : node.id === this.hoveredId ? 0.84 : 0.14;
      visual.opacity = this.approach(visual.opacity, opacity, step);
      visual.active = this.approach(visual.active, node.id === activeId ? 1 : node.id === this.hoveredId ? 0.6 : 0, step);
      this.nodeVisuals.set(node.id, visual);
    }

    this.drawEdges(context, step);
    this.drawNodes(context);
    this.drawLabels(context, directSet, step);
    if (this.frameMoving) this.requestDraw();
  }

  private drawEdges(context: CanvasRenderingContext2D, step: number): void {
    for (const edge of this.motionFrame?.edges ?? this.graph.edges) {
      const source = this.motionNodes.get(edge.source) ?? this.nodeById.get(edge.source);
      const target = this.motionNodes.get(edge.target) ?? this.nodeById.get(edge.target);
      if (!source || !target) continue;
      const reveal = (edge as Partial<MotionFrame["edges"][number]>).reveal ?? 1;
      const presence = Math.max(this.nodePresence(source), this.nodePresence(target));
      if (presence < 0.001 || reveal < 0.001) continue;

      const active = source.id === this.focusId || target.id === this.focusId;
      const emphasis = this.approach(this.edgeVisuals.get(edge.id) ?? 0, active ? 1 : 0, step);
      this.edgeVisuals.set(edge.id, emphasis);
      const from = this.worldToScreen(source);
      const to = this.worldToScreen(target);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      // A shallow, stable bend leaves crossings legible without moving the graph.
      const bend = Math.min(13, distance * 0.028) * (source.y < target.y ? 1 : -1);
      const cx = (from.x + to.x) / 2 - (dy / distance) * bend;
      const cy = (from.y + to.y) / 2 + (dx / distance) * bend;
      const base = this.displayMode === "panorama" ? 0.18 : 0.13;
      const alpha = (base * (1 - this.focusAmount * 0.84) + emphasis * 0.7) * presence * reveal;

      context.save();
      context.globalAlpha = alpha;
      const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
      gradient.addColorStop(0, emphasis > 0.01 ? COLORS[source.kind] : "#929292");
      gradient.addColorStop(0.5, emphasis > 0.01 ? "#eeeeee" : "#b0b0b0");
      gradient.addColorStop(1, emphasis > 0.01 ? COLORS[target.kind] : "#929292");
      context.strokeStyle = gradient;
      context.lineWidth = 0.65 + emphasis * 0.65;
      context.beginPath();
      context.moveTo(from.x, from.y);
      // Split the quadratic at t so the stroke genuinely extends along its curve.
      const controlX = from.x + (cx - from.x) * reveal;
      const controlY = from.y + (cy - from.y) * reveal;
      const endX = (1 - reveal) ** 2 * from.x + 2 * (1 - reveal) * reveal * cx + reveal ** 2 * to.x;
      const endY = (1 - reveal) ** 2 * from.y + 2 * (1 - reveal) * reveal * cy + reveal ** 2 * to.y;
      context.quadraticCurveTo(controlX, controlY, endX, endY);
      context.stroke();
      if (emphasis > 0.02) {
        context.globalAlpha = emphasis * 0.065 * presence * reveal;
        context.lineWidth = 4;
        context.stroke();
      }
      context.restore();
    }
  }

  private nodeRadius(node: GraphNode): number {
    const moving = this.motionNodes.get(node.id);
    return (moving?.radius ?? node.radius) * clamp(Math.sqrt(this.camera.zoom), 0.78, 1.35) * (moving?.scale ?? 1);
  }

  private nodePresence(node: GraphNode): number {
    return this.motionNodes.get(node.id)?.presence ?? 1;
  }

  private drawNodes(context: CanvasRenderingContext2D): void {
    const ordered = [...(this.motionFrame?.nodes ?? this.graph.nodes)].sort((a, b) =>
      (this.nodeVisuals.get(a.id)?.active ?? 0) - (this.nodeVisuals.get(b.id)?.active ?? 0) ||
      a.priority - b.priority,
    );
    for (const node of ordered) {
      const presence = this.nodePresence(node);
      if (presence < 0.001) continue;
      const point = this.worldToScreen(node);
      if (!this.isOnScreen(point, 60)) continue;
      const visual = this.nodeVisuals.get(node.id)!;
      const radius = this.nodeRadius(node) * (1 + visual.active * 0.1);
      const color = COLORS[node.kind];
      const glass = this.isAnchor(node);
      context.save();
      context.globalAlpha = presence;

      if (visual.active > 0.01) {
        const glow = context.createRadialGradient(point.x, point.y, radius, point.x, point.y, radius * 5);
        glow.addColorStop(0, withAlpha(color, 0.12 * visual.active));
        glow.addColorStop(0.35, withAlpha(color, 0.04 * visual.active));
        glow.addColorStop(1, withAlpha(color, 0));
        context.fillStyle = glow;
        context.beginPath();
        context.arc(point.x, point.y, radius * 5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = withAlpha(color, 0.38 * visual.active);
        context.lineWidth = 0.75;
        context.beginPath();
        context.arc(point.x, point.y, radius + 4 + 2 * (1 - visual.active), 0, Math.PI * 2);
        context.stroke();
      }

      context.globalAlpha = visual.opacity * presence;
      const face = context.createLinearGradient(point.x - radius * 0.45, point.y - radius, point.x + radius * 0.45, point.y + radius);
      face.addColorStop(0, withAlpha(color, glass ? 0.78 : 1));
      face.addColorStop(0.24, withAlpha(color, glass ? 0.52 : 0.94));
      face.addColorStop(0.55, withAlpha(color, glass ? 0.34 : 0.86));
      face.addColorStop(0.82, withAlpha(color, glass ? 0.42 : 0.74));
      face.addColorStop(1, withAlpha(color, glass ? 0.68 : 0.82));
      context.fillStyle = face;
      context.shadowColor = "rgba(0, 0, 0, 0.4)";
      context.shadowBlur = 5;
      context.shadowOffsetY = 2;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;

      const rim = context.createLinearGradient(point.x - radius, point.y - radius, point.x + radius, point.y + radius);
      rim.addColorStop(0, "rgba(255, 255, 255, 0.85)");
      rim.addColorStop(0.3, withAlpha(color, 0.68));
      rim.addColorStop(0.58, withAlpha(color, 0.18));
      rim.addColorStop(1, withAlpha(color, 0.82));
      context.strokeStyle = rim;
      context.lineWidth = glass ? 1 : 0.65;
      context.stroke();
      // Keep the lens reflections inside large beads; tiny notes need a solid silhouette.
      if (glass && radius >= 6) {
        context.beginPath();
        context.arc(point.x, point.y, radius - 1.7, Math.PI * 1.12, Math.PI * 1.6);
        context.strokeStyle = withAlpha("#ffffff", 0.38 + visual.active * 0.2);
        context.lineWidth = 0.7;
        context.stroke();
        context.beginPath();
        context.arc(point.x, point.y, radius - 1.4, Math.PI * 0.12, Math.PI * 0.42);
        context.strokeStyle = withAlpha(color, 0.44);
        context.lineWidth = 0.8;
        context.stroke();
      }
      context.restore();
    }
  }

  private drawLabels(
    context: CanvasRenderingContext2D,
    directSet: Set<string>,
    step: number,
  ): void {
    const candidates = [...(this.motionFrame?.nodes ?? this.graph.nodes)].sort((a, b) => {
      const rank = (node: GraphNode) =>
        (node.id === this.focusId ? 1000 : node.id === this.hoveredId ? 500 : this.isAnchor(node) ? 100 : 0) +
        (directSet.has(node.id) ? 30 : 0) + node.priority;
      return rank(b) - rank(a);
    });
    const boxes: LabelBox[] = [];
    const obstacles = candidates.filter((node) => this.nodePresence(node) > 0.35).map((node) => {
      const point = this.worldToScreen(node);
      const radius = this.nodeRadius(node) + 3;
      return { id: node.id, anchor: this.isAnchor(node), left: point.x - radius, right: point.x + radius, top: point.y - radius, bottom: point.y + radius };
    });
    const maxLabels = Math.max(18, Math.floor(this.width * this.height / 23000));
    let count = 0;

    for (const node of candidates) {
      const presence = clamp((this.nodePresence(node) - 0.35) / 0.65, 0, 1);
      if (presence < 0.001) continue;
      const point = this.worldToScreen(node);
      if (!this.isOnScreen(point, 60)) continue;
      const visual = this.nodeVisuals.get(node.id)!;
      const active = node.id === this.focusId || node.id === this.hoveredId;
      const important = this.isAnchor(node);
      const required = important || active;
      const fontSize = important ? 13 : 12;
      context.font = `${important ? 500 : 400} ${fontSize}px ${this.fontFamily}`;
      const textWidth = context.measureText(node.title).width;
      const gap = this.nodeRadius(node) + 9;
      const baseline = point.y + fontSize * 0.35;
      const positions = [
        { x: point.x + gap, y: baseline },
        { x: point.x - gap - textWidth, y: baseline },
        { x: point.x - textWidth / 2, y: point.y + gap + fontSize },
        { x: point.x - textWidth / 2, y: point.y - gap },
      ];
      if (node.kind === "home" || node.kind === "document-home") positions.unshift(positions[2]!);
      if (required) {
        for (const offset of [24, 48, 72]) {
          positions.push(
            { x: point.x + gap, y: baseline - offset },
            { x: point.x - gap - textWidth, y: baseline - offset },
            { x: point.x + gap, y: baseline + offset },
            { x: point.x - gap - textWidth, y: baseline + offset },
          );
        }
      }
      const available = positions.map((position) => ({
        ...position,
        left: position.x - 5, right: position.x + textWidth + 5,
        top: position.y - fontSize - 4, bottom: position.y + 5,
      }));
      const visible = available.filter((box) =>
        box.left >= 10 && box.right <= this.width - 10 &&
        box.top >= 68 && box.bottom <= this.height - 55,
      );
      const placement = visible.find((box) =>
        !boxes.some((other) => overlaps(box, other)) &&
        !obstacles.some((other) =>
          other.id !== node.id && (!required || other.anchor) && overlaps(box, other),
        ),
      ) ?? (required ? visible.reduce<typeof available[number] | undefined>((best, box) => {
        const score = (candidate: LabelBox) => boxes.reduce((total, other) =>
          total + overlapArea(candidate, other), 0);
        return !best || score(box) < score(best) ? box : best;
      }, undefined) ?? available[0] : undefined);

      const eligible = this.shouldShowLabel(node, directSet) && (count < maxLabels || required);
      const opacity = eligible && placement
        ? this.focusId === null ? 0.8 : directSet.has(node.id) || active ? 1 : 0.12
        : 0;
      visual.label = this.approach(visual.label, opacity, step);
      if (opacity > 0 && placement) {
        boxes.push(placement);
        count += 1;
      }
      if (visual.label < 0.01 || !placement) continue;

      context.save();
      context.globalAlpha = visual.label * presence;
      if (Math.abs(placement.y - baseline) > fontSize + gap) {
        const endX = clamp(point.x, placement.left + 5, placement.right - 5);
        const endY = placement.y - fontSize / 2;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(endX, endY);
        context.strokeStyle = withAlpha(COLORS[node.kind], 0.3);
        context.lineWidth = 0.6;
        context.stroke();
      }
      context.lineJoin = "round";
      context.lineWidth = 4;
      context.strokeStyle = "rgba(18, 18, 18, 0.92)";
      context.strokeText(node.title, placement.x, placement.y);
      context.fillStyle = active ? "#ffffff" : important ? "#e2e2e2" : "#b5b5b5";
      context.fillText(node.title, placement.x, placement.y);
      context.restore();
    }
  }

  private shouldShowLabel(node: GraphNode, directSet: Set<string>): boolean {
    if (this.isAnchor(node)) return true;
    if (node.id === this.hoveredId || directSet.has(node.id)) return true;
    if (this.focusId !== null) return node.priority >= 8;
    if (this.displayMode === "panorama") return true;
    return node.priority >= 6.8 || this.camera.zoom > 0.96;
  }

  private isAnchor(node: GraphNode): boolean {
    return node.kind !== "worklog" && node.kind !== "document";
  }

  private selectNode(id: string, center: boolean): void {
    const node = this.nodeById.get(id);
    if (!node) return;
    this.setSelection(id);
    if (center) {
      this.setHovered(null);
      this.targetCamera.x = -node.x;
      this.targetCamera.y = -node.y;
      this.targetCamera.zoom = clamp(Math.max(this.camera.zoom, 0.95), 0.65, 1.35);
      this.requestDraw();
    }
  }

  private fitAll(immediate: boolean): void {
    const bounds = graphBounds(this.graph.nodes);
    const rangeX = Math.max(200, bounds.maxX - bounds.minX + 140);
    const rangeY = Math.max(200, bounds.maxY - bounds.minY + 140);
    const target: Camera = {
      x: -(bounds.minX + bounds.maxX) / 2,
      y: -(bounds.minY + bounds.maxY) / 2,
      zoom: clamp(Math.min((this.width - 100) / rangeX, (this.height - 140) / rangeY), 0.34, 1.2),
    };
    this.targetCamera = target;
    if (immediate || this.reducedMotion) this.camera = { ...target };
    this.requestDraw();
  }

  private zoomFromCenter(factor: number): void {
    this.targetCamera.zoom = clamp(this.targetCamera.zoom * factor, 0.28, 2.4);
    this.requestDraw();
  }

  private updateHover(point: Point): void {
    const node = this.hitTest(point);
    this.setHovered(node?.id ?? null);
  }

  private setHovered(id: string | null): void {
    if (this.hoveredId === id) return;
    this.hoveredId = id;
    const node = id ? this.nodeById.get(id) : null;
    if (node) {
      this.captionEl.textContent = `${node.title}   ·   ${node.degree} 条关系   ·   双击打开`;
    }
    this.captionEl.classList.toggle("is-visible", Boolean(node));
    this.canvas.style.cursor = id ? "pointer" : this.dragging ? "grabbing" : "grab";
    this.requestDraw();
  }

  private hitTest(point: Point): GraphNode | null {
    let closest: GraphNode | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const node of this.graph.nodes) {
      if (this.nodePresence(node) < 0.35) continue;
      const screen = this.worldToScreen(node);
      const distance = Math.hypot(point.x - screen.x, point.y - screen.y);
      const radius = Math.max(11, node.radius * Math.sqrt(this.camera.zoom) + 6);
      if (distance <= radius && distance < closestDistance) {
        closest = node;
        closestDistance = distance;
      }
    }
    return closest;
  }

  private async openNode(node: GraphNode): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(node.path);
    if (!(file instanceof TFile)) return;
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private worldToScreen(node: GraphNode): Point {
    const position = this.motionNodes.get(node.id) ?? node;
    return {
      x: this.width / 2 + (position.x + this.camera.x) * this.camera.zoom,
      y: this.height / 2 + (position.y + this.camera.y) * this.camera.zoom,
    };
  }

  private isOnScreen(point: Point, margin: number): boolean {
    return (
      point.x >= -margin &&
      point.x <= this.width + margin &&
      point.y >= -margin &&
      point.y <= this.height + margin
    );
  }

  private eventPoint(event: MouseEvent | PointerEvent | WheelEvent): Point {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  private createButton(label: string, ariaLabel: string): HTMLButtonElement {
    const button = this.createElement("button", "memory-constellation__button", label);
    button.type = "button";
    button.setAttribute("aria-label", ariaLabel);
    return button;
  }

  private createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
}

// Generated once per view. Stochastic alpha rounding breaks up dark 8-bit contour bands.
export function createBackdropPixels(size: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const edge = Math.exp(-6);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const intensity = Math.max(0, (Math.exp(-6 * (dx * dx + dy * dy)) - edge) / (1 - edge));
      const offset = (y * size + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.floor(intensity * 36 + Math.random());
    }
  }
  return pixels;
}

function overlaps(left: LabelBox, right: LabelBox): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

function overlapArea(left: LabelBox, right: LabelBox): number {
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
    Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
}
