import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MemoryConstellationView, createBackdropPixels } from "./constellation-view";
import { buildGraph } from "./graph-model";

globalThis.window = { requestAnimationFrame: () => 0 };

const home = "project-memory/首页.md";
const memory = "project-memory/环境与部署.md";
const stream = "project-memory/工作流/部署.md";
const isolated = "project-memory/工作记录/独立记录.md";
const notes = [home, memory, stream, isolated].map((path) => ({
  path, basename: path.split("/").at(-1).slice(0, -3), mtime: 0,
}));
const links = [
  { source: home, target: memory, weight: 1 },
  { source: memory, target: stream, weight: 1 },
];

function searchElement() {
  const attributes = new Map();
  const classes = new Set();
  return Object.assign(new EventTarget(), {
    children: [], dataset: {}, style: {}, hidden: true, textContent: "", id: "", scrollTop: 0,
    ownerDocument: { activeElement: null }, contains() { return false; },
    classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name) },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
    removeAttribute: (name) => attributes.delete(name),
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    scrollIntoView() {},
    closest() { return null; },
  });
}

// Exercise the real pointer handlers and Canvas renderer with an in-memory host.
function createView(mode = "focus") {
  const view = new MemoryConstellationView({});
  view.graph = buildGraph(notes, links, "memory");
  view.graph.nodes.forEach((node, index) => Object.assign(node, { x: index * 160 - 240, y: 0 }));
  view.nodeById = new Map(view.graph.nodes.map((node) => [node.id, node]));
  view.width = 1000;
  view.height = 700;
  view.displayMode = mode;
  view.reducedMotion = true;
  view.statusEl = {};
  view.zoomEl = {};
  view.captionEl = { style: { setProperty() {} }, classList: { toggle() {} } };
  view.canvas = Object.assign(new EventTarget(), {
    style: {},
    focus() { this.focused = true; },
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  });
  view.scopeButton = Object.assign(new EventTarget(), { classList: { toggle() {} } });
  view.modeButton = Object.assign(new EventTarget(), { classList: { toggle() {} } });
  view.replayButton = new EventTarget();
  view.searchInput = Object.assign(searchElement(), { value: "" });
  view.searchPanel = searchElement();
  view.searchSummary = searchElement();
  view.searchList = Object.assign(searchElement(), { id: "test-search" });
  for (const name of ["relationsPanel", "relationsTitle", "relationsMeta", "relationsPath", "relationsCount", "relationsList", "relationsClose", "relationsOpen"]) {
    view[name] = searchElement();
  }
  view.relationsFilter = Object.assign(searchElement(), { value: "" });
  view.createElement = (_tag, className, text = "") => Object.assign(searchElement(), { className, textContent: text });
  view.registerDomEvent = (target, type, handler) => target.addEventListener(type, handler);
  view.app = {
    vault: { getMarkdownFiles: () => notes.map((note) => ({ ...note, stat: { mtime: 0 } })) },
    metadataCache: {
      getFileCache: () => ({}),
      resolvedLinks: { [home]: { [memory]: 1 }, [memory]: { [stream]: 1 } },
    },
  };
  view.registerInteractions();
  return view;
}

function dispatch(target, type, fields = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), { button: 0 }, fields);
  target.dispatchEvent(event);
  return event;
}

test("search presents live titles, kind, path, and current scope without moving the graph", () => {
  const view = createView();
  view.searchInput.value = "部署";
  dispatch(view.searchInput, "input");
  assert.equal(view.searchPanel.hidden, false);
  assert.equal(view.searchResults.length, 2);
  assert.equal(view.searchList.children[0].children[0].children[0].textContent, "部署");
  assert.equal(view.searchList.children[0].children[0].children[1].textContent, "工作流");
  assert.equal(view.searchList.children[0].children[1].textContent, stream);
  assert.match(view.searchSummary.textContent, /2 项匹配.*记忆/);
  assert.equal(view.searchInput.getAttribute("aria-activedescendant"), "test-search-0");
  assert.equal(view.selectedId, null);
  assertOverview(view);
});

test("search keyboard selects, locates, opens, dismisses, and ignores IME confirmation", () => {
  const view = createView();
  const opened = [];
  view.openNode = async (node) => opened.push(node.id);
  view.searchInput.value = "部署";
  dispatch(view.searchInput, "input");
  dispatch(view.searchInput, "keydown", { key: "Enter", isComposing: true });
  assert.equal(view.selectedId, null);
  dispatch(view.searchInput, "keydown", { key: "Enter", keyCode: 229 });
  assert.equal(view.selectedId, null);
  dispatch(view.searchInput, "keydown", { key: "ArrowDown" });
  assert.equal(view.searchIndex, 1);
  dispatch(view.searchInput, "keydown", { key: "Enter" });
  assert.equal(view.selectedId, memory);
  assert.equal(view.searchPanel.hidden, true);
  assert.equal(view.canvas.focused, true);
  assert.equal(view.hoveredId, null);
  assert.equal(view.targetCamera.x, -view.nodeById.get(memory).x);
  assert.deepEqual(opened, []);
  for (const modifier of ["metaKey", "ctrlKey"]) {
    dispatch(view.searchInput, "focus");
    dispatch(view.searchInput, "keydown", { key: "Enter", [modifier]: true });
  }
  assert.deepEqual(opened, [stream, stream]);
  dispatch(view.searchInput, "focus");
  assert.equal(dispatch(view.searchInput, "keydown", { key: "Escape" }).defaultPrevented, true);
  assert.equal(view.searchPanel.hidden, true);
  assert.equal(view.searchInput.value, "部署");
  assert.equal(view.searchInput.getAttribute("aria-activedescendant"), undefined);
  dispatch(view.searchInput, "keydown", { key: "ArrowUp" });
  assert.equal(view.searchIndex, 1);
  assert.equal(dispatch(view.searchInput, "keydown", { key: "Tab" }).defaultPrevented, false);
  assert.equal(view.searchPanel.hidden, true);
});

test("empty results, clearing, and blur remove stale search choices", () => {
  const view = createView();
  view.searchInput.value = "部署";
  dispatch(view.searchInput, "input");
  view.searchInput.value = "不存在";
  dispatch(view.searchInput, "input");
  assert.equal(view.searchIndex, -1);
  assert.match(view.searchList.children[0].textContent, /切换“记忆 \+ 文档”/);
  dispatch(view.searchInput, "keydown", { key: "Enter" });
  assert.equal(view.selectedId, null);
  view.searchInput.value = "";
  dispatch(view.searchInput, "input");
  assert.deepEqual(view.searchResults, []);
  assert.match(view.searchList.children[0].textContent, /空格/);
  dispatch(view.searchInput, "blur");
  assert.equal(view.searchPanel.hidden, true);
});

test("search follows scope changes and removes files absent from the refreshed vault", () => {
  const view = createView();
  const doc = { path: "docs/部署.md", basename: "部署", stat: { mtime: 1 } };
  view.app.vault.getMarkdownFiles = () => [...notes.map((note) => ({ ...note, stat: { mtime: 0 } })), doc];
  view.searchInput.value = "部署";
  dispatch(view.searchInput, "input");
  dispatch(view.scopeButton, "click");
  assert.equal(view.searchResults.length, 3);
  assert.match(view.searchSummary.textContent, /记忆 \+ 文档/);
  view.app.vault.getMarkdownFiles = () => [];
  view.rebuildGraph(false);
  assert.deepEqual(view.searchResults, []);
  dispatch(view.searchInput, "keydown", { key: "Enter" });
  assert.equal(view.selectedId, null);
});

test("search result clicks locate the clicked note without losing focus before activation", () => {
  const view = createView();
  view.searchInput.value = "部署";
  dispatch(view.searchInput, "input");
  view.searchList.closest = () => view.searchList.children[1];
  assert.equal(dispatch(view.searchList, "mousedown").defaultPrevented, true);
  dispatch(view.searchList, "click");
  assert.equal(view.selectedId, memory);
  assert.equal(view.searchPanel.hidden, true);
});

test("search results stay within short graph panes and never take a toolbar grid column", () => {
  const view = createView();
  view.context = { setTransform() {} };
  view.canvas.getBoundingClientRect = () => ({ width: 600, height: 320 });
  view.resizeCanvas();
  assert.equal(view.searchList.style.maxHeight, "130px");
  view.canvas.getBoundingClientRect = () => ({ width: 600, height: 1000 });
  view.resizeCanvas();
  assert.equal(view.searchList.style.maxHeight, "360px");
  const css = readFileSync("styles.css", "utf8");
  const popup = css.match(/\.memory-constellation__search-panel\s*\{([^}]+)\}/)[1];
  assert.match(popup, /position:\s*absolute/);
  assert.match(popup, /width:\s*100%/);
});

function pointAt(view, id) {
  const point = view.worldToScreen(view.nodeById.get(id));
  return { clientX: point.x, clientY: point.y, pointerId: 1 };
}

function clickNode(view, id, detail = 1) {
  const point = pointAt(view, id);
  dispatch(view.canvas, "pointerdown", point);
  dispatch(view.canvas, "pointerup", point);
  dispatch(view.canvas, "click", { ...point, detail });
}

function render(view, time = performance.now() + 1000) {
  const nodes = [];
  const edges = [];
  const labels = [];
  const colors = [];
  const saved = [];
  let circleX;
  let isEdge = false;
  view.context = {
    globalAlpha: 1,
    clearRect() {},
    save() { saved.push(this.globalAlpha); },
    restore() { this.globalAlpha = saved.pop(); },
    beginPath() { isEdge = false; },
    moveTo() {},
    lineTo() { isEdge = true; },
    quadraticCurveTo() { isEdge = true; },
    arc(x) { circleX = x; },
    fill() { nodes.push({ x: circleX, alpha: this.globalAlpha, face: this.fillStyle }); colors.push(this.fillStyle); },
    stroke() {
      colors.push(this.strokeStyle);
      if (isEdge && typeof this.strokeStyle === "object") {
        edges.push({ color: this.strokeStyle, alpha: this.globalAlpha });
      }
    },
    createLinearGradient() {
      return { stops: [], addColorStop(offset, color) { this.stops.push({ offset, color }); colors.push(color); } };
    },
    createRadialGradient() { return this.createLinearGradient(); },
    measureText: (text) => ({ width: text.length * 8 }),
    fillText(text) { labels.push({ text, alpha: this.globalAlpha }); colors.push(this.fillStyle); },
    strokeText() { colors.push(this.strokeStyle); },
  };
  view.drawFrame(time);
  return { nodes, edges, labels, colors: colors.filter((color) => typeof color === "string") };
}

function assertOverview(view) {
  const { nodes, edges } = render(view);
  assert.equal(nodes.length, view.graph.nodes.length);
  assert.ok(nodes.every((node) => node.alpha === 0.84), "every node returns to normal brightness");
  assert.ok(edges.every((edge) => edge.color.stops[0].color === "#929292"), "no focus edges remain");
}

for (const mode of ["focus", "panorama"]) {
  test(`${mode}: pointer exit restores all nodes, including isolated notes`, () => {
    const view = createView(mode);
    assertOverview(view);
    dispatch(view.canvas, "pointermove", pointAt(view, memory));
    const hovered = render(view);
    assert.ok(hovered.nodes.some((node) => node.alpha === 0.14));
    assert.ok(hovered.edges.some((edge) => edge.color.stops[0].color !== "#929292"));
    dispatch(view.canvas, "pointermove", { clientX: 20, clientY: 20 });
    assertOverview(view);
    dispatch(view.canvas, "pointermove", pointAt(view, home));
    dispatch(view.canvas, "pointerleave");
    assertOverview(view);
  });
}

test("explicit selection locks relationships until toggled off; search selection follows the same rule", () => {
  const view = createView();
  clickNode(view, memory);
  assert.equal(view.selectedId, memory);
  dispatch(view.canvas, "pointerleave");
  render(view);
  assert.equal(view.nodeVisuals.get(home).opacity, 0.96);
  assert.equal(view.nodeVisuals.get(isolated).opacity, 0.14);
  dispatch(view.canvas, "pointermove", pointAt(view, isolated));
  render(view);
  assert.equal(view.focusId, memory, "hovering elsewhere cannot replace the locked relationship set");
  assert.equal(view.nodeVisuals.get(stream).opacity, 0.96);
  clickNode(view, memory);
  assert.equal(view.selectedId, null);
  assertOverview(view);
  view.searchInput.value = "环境与部署";
  dispatch(view.searchInput, "keydown", { key: "Enter" });
  assert.equal(view.selectedId, memory);
  assert.ok(view.relationsPanel.classList.contains("is-open"));
  dispatch(view.canvas, "keydown", { key: "Escape" });
  assert.equal(view.selectedId, null);
  assertOverview(view);
});

test("double-click opens once and drag release does not toggle a pinned node", () => {
  const view = createView();
  const opened = [];
  view.openNode = async (node) => opened.push(node.id);
  clickNode(view, memory, 1);
  clickNode(view, memory, 2);
  dispatch(view.canvas, "dblclick", pointAt(view, memory));
  assert.deepEqual(opened, [memory]);
  assert.equal(view.selectedId, memory);
  const point = pointAt(view, memory);
  dispatch(view.canvas, "pointerdown", point);
  dispatch(view.canvas, "pointermove", { ...point, clientX: point.clientX + 20 });
  dispatch(view.canvas, "pointerup", { ...point, clientX: point.clientX + 20 });
  dispatch(view.canvas, "click", { ...point, clientX: point.clientX + 20, detail: 1 });
  assert.equal(view.selectedId, memory);
});

test("relation drawer lists direct links only, filters them, and supports explicit opening and selection", () => {
  const view = createView();
  clickNode(view, memory);
  assert.equal(view.relationsTitle.textContent, "环境与部署");
  assert.equal(view.relationsPath.textContent, memory);
  assert.equal(view.relationsList.children.length, 2);
  assert.match(view.relationsCount.textContent, /2 条直接关联/);
  view.relationsFilter.value = "工作流 部署";
  dispatch(view.relationsFilter, "input");
  assert.equal(view.relationsList.children.length, 1);
  const row = view.relationsList.children[0];
  assert.equal(row.children[0].dataset.nodeId, stream);
  assert.equal(row.children[0].children[1].textContent, stream);
  const opened = [];
  view.openNode = async (node) => opened.push(node.id);
  view.relationsList.closest = () => row.children[1];
  dispatch(view.relationsList, "click");
  assert.deepEqual(opened, [stream]);
  assert.equal(view.selectedId, memory, "open action does not navigate the relation context");
  view.relationsList.closest = () => row.children[0];
  dispatch(view.relationsList, "click");
  assert.equal(view.selectedId, stream);
  assert.equal(view.relationsTitle.textContent, "部署");
  assert.equal(view.relationsFilter.value, "");
});

test("drawer closure and missing selections restore overview without selecting the homepage", () => {
  const view = createView();
  clickNode(view, isolated);
  assert.match(view.relationsList.children[0].textContent, /没有直接关联/);
  dispatch(view.relationsClose, "click");
  assert.equal(view.selectedId, null);
  assert.equal(view.relationsPanel.inert, true);
  assertOverview(view);
  clickNode(view, memory);
  view.app.vault.getMarkdownFiles = () => [];
  view.rebuildGraph(false);
  assert.equal(view.selectedId, null);
  assert.equal(view.relationsPanel.classList.contains("is-open"), false);
});

test("drawer avoids the first clicked node and remains on that side while navigating", () => {
  const view = createView();
  const rightNode = view.graph.nodes.find((node) => node.x > 0);
  const leftNode = view.graph.nodes.find((node) => node.x < 0);
  clickNode(view, rightNode.id);
  assert.equal(view.relationsPanel.classList.contains("is-left"), true);
  const camera = { ...view.camera };
  clickNode(view, leftNode.id);
  assert.equal(view.relationsPanel.classList.contains("is-left"), true);
  assert.deepEqual(view.camera, camera, "a canvas click never moves the double-click target");
  dispatch(view.canvas, "click", { clientX: 20, clientY: 20, detail: 1 });
  assert.equal(view.selectedId, null);
  clickNode(view, leftNode.id);
  assert.equal(view.relationsPanel.classList.contains("is-left"), false);
  const css = readFileSync("styles.css", "utf8");
  const drawer = css.match(/\.memory-constellation__relations\s*\{([^}]+)\}/)[1];
  assert.match(drawer, /position: absolute/);
  assert.match(drawer, /width: min\(340px, calc\(50% - 28px\)\)/);
});

test("dense relations are complete, deduplicated, and kept current across vault refresh", () => {
  const view = createView();
  const hub = "docs/索引/架构.md";
  const docs = [hub, ...Array.from({ length: 100 }, (_, i) => `docs/目录${i}/说明.md`)];
  view.graphScope = "memory-and-docs";
  view.app.vault.getMarkdownFiles = () => docs.map((path) => ({ path, basename: path.split("/").at(-1).slice(0, -3), stat: { mtime: 0 } }));
  view.app.metadataCache.resolvedLinks = { [hub]: Object.fromEntries(docs.slice(1).map((path) => [path, 1])), [docs[1]]: { [hub]: 1 } };
  view.rebuildGraph(true);
  view.selectNode(hub, false);
  assert.equal(view.relationsList.children.length, 100);
  assert.match(view.relationsCount.textContent, /^100 条/);
  view.relationsFilter.value = "目录88";
  dispatch(view.relationsFilter, "input");
  assert.equal(view.relationsList.children.length, 1);
  assert.equal(view.relationsList.children[0].children[0].dataset.nodeId, "docs/目录88/说明.md");
  view.app.metadataCache.resolvedLinks = { [hub]: { [docs[1]]: 1 } };
  view.rebuildGraph(false);
  assert.equal(view.selectedId, hub, "valid selection survives refresh");
  assert.match(view.relationsCount.textContent, /^0 \/ 1/);
  dispatch(view.scopeButton, "click");
  assert.equal(view.selectedId, null, "scope removal drops obsolete document selection");
  assert.equal(view.relationsPanel.inert, true);
});

test("replay and drawer Escape clear selection; right clicks never select or drag", () => {
  const view = createView();
  clickNode(view, memory);
  dispatch(view.replayButton, "click");
  assert.equal(view.selectedId, null);
  assert.equal(view.relationsPanel.inert, true);
  clickNode(view, memory);
  dispatch(view.relationsPanel, "keydown", { key: "Escape", isComposing: true });
  assert.equal(view.selectedId, memory);
  dispatch(view.relationsPanel, "keydown", { key: "Escape" });
  assert.equal(view.selectedId, null);
  dispatch(view.canvas, "pointerdown", { ...pointAt(view, home), button: 2 });
  assert.equal(view.pointerDown, false);
});

test("rebuild and scope change do not reintroduce a home highlight", () => {
  const view = createView();
  view.rebuildGraph(false);
  assert.equal(view.selectedId, null);
  assertOverview(view);
  dispatch(view.canvas, "pointermove", pointAt(view, memory));
  dispatch(view.scopeButton, "click");
  assertOverview(view);
});

test("cancelled pointer interaction clears temporary focus", () => {
  const view = createView();
  const point = pointAt(view, memory);
  dispatch(view.canvas, "pointermove", point);
  dispatch(view.canvas, "pointerdown", point);
  dispatch(view.canvas, "pointercancel");
  assertOverview(view);
  assert.equal(view.pointerDown, false);
});

test("animated hover transitions settle back to overview and stop repainting", () => {
  const view = createView();
  view.reducedMotion = false;
  let requested = 0;
  view.requestDraw = () => { requested += 1; };
  const start = performance.now() + 1000;
  render(view, start);
  dispatch(view.canvas, "pointermove", pointAt(view, memory));
  const entering = render(view, start + 16);
  assert.ok(entering.nodes.some((node) => node.alpha > 0.14 && node.alpha < 0.84));
  dispatch(view.canvas, "pointermove", pointAt(view, home));
  render(view, start + 32);
  dispatch(view.canvas, "pointerleave");
  for (let frame = 3; frame < 120; frame += 1) render(view, start + frame * 16);
  requested = 0;
  const settled = render(view, start + 2000);
  assert.ok(settled.nodes.every((node) => node.alpha === 0.84));
  assert.equal(settled.nodes.length, view.graph.nodes.length, "no hover halo remains");
  assert.equal(requested, 0, "static graph does not request another animation frame");
});

test("locked focus settles without continuous rendering and cancellation returns to overview", () => {
  const view = createView();
  view.reducedMotion = false;
  clickNode(view, memory);
  dispatch(view.canvas, "pointerleave");
  const start = performance.now() + 1000;
  for (let frame = 0; frame < 120; frame += 1) render(view, start + frame * 16);
  let requested = 0;
  view.requestDraw = () => { requested += 1; };
  render(view, start + 2000);
  assert.equal(requested, 0);
  assert.equal(view.focusId, memory);
  assert.equal(view.nodeVisuals.get(stream).opacity, 0.96);
  dispatch(view.relationsClose, "click");
  for (let frame = 0; frame < 120; frame += 1) render(view, start + 2100 + frame * 16);
  requested = 0;
  assertOverview(view);
  assert.equal(requested, 0);
});

test("replay button starts from a blank frame, ignores invisible hits, and settles without RAF", () => {
  const view = createView();
  view.reducedMotion = false;
  dispatch(view.replayButton, "click");
  const start = view.graphTransition.startedAt;
  assert.equal(render(view, start).nodes.length, 0);
  assert.equal(view.hitTest(pointAt(view, home)), null, "invisible newborn nodes cannot intercept a click");
  assert.ok(render(view, start + 140).nodes.length > 0);
  assert.equal(view.selectedId, null);
  assert.equal(view.hoveredId, null);
  render(view, start + 9900);
  assert.ok(view.graphTransition, "the replay button uses the full 10-second timeline");
  for (let frame = 0; frame <= 100; frame += 1) render(view, start + 10000 + frame * 16);
  assert.equal(view.graphTransition, null);
  assert.equal(view.motionNodes.size, 0);
  let requested = 0;
  view.requestDraw = () => { requested += 1; };
  assertOverview(view);
  assert.equal(requested, 0);
});

test("scope switching animates the camera and retains exiting nodes only for drawing", () => {
  const view = createView();
  view.reducedMotion = false;
  const more = ["docs/首页.md", "docs/说明.md"].map((path) => ({ path, basename: path.split("/").at(-1).slice(0, -3), stat: { mtime: 1 } }));
  view.app.vault.getMarkdownFiles = () => [...notes.map((note) => ({ ...note, stat: { mtime: 0 } })), ...more];
  const camera = { ...view.camera };
  dispatch(view.scopeButton, "click");
  assert.deepEqual(view.camera, camera, "switching does not snap the current camera");
  assert.notDeepEqual(view.targetCamera, camera);
  assert.equal(view.motionNodes.get(home).presence, 1, "existing memory does not blink out");
  assert.equal(view.motionNodes.get("docs/首页.md").presence, 0);
  render(view, view.graphTransition.startedAt + 200);
  dispatch(view.scopeButton, "click");
  assert.equal(view.nodeById.has("docs/首页.md"), false, "removed notes are not search or hit targets");
  assert.ok(view.motionNodes.has("docs/首页.md"), "exit is drawn rather than abruptly removed");
  const start = view.graphTransition.startedAt;
  for (let frame = 0; frame < 120; frame += 1) render(view, start + frame * 16);
  assert.equal(view.graphTransition, null);
  assert.equal(view.nodeVisuals.has("docs/首页.md"), false);
  assertOverview(view);
});

test("replay respects reduced motion and repeated replay replaces rather than queues animations", () => {
  const view = createView();
  dispatch(view.replayButton, "click");
  assert.equal(view.graphTransition, null);
  assertOverview(view);
  view.reducedMotion = false;
  dispatch(view.replayButton, "click");
  const first = view.graphTransition;
  dispatch(view.replayButton, "click");
  assert.notEqual(view.graphTransition, first);
  assert.ok(view.motionFrame.nodes.every((node) => node.presence === 0));
});

test("closing during growth cancels rendering and releases temporary graph data", async () => {
  const view = createView();
  view.reducedMotion = false;
  addBackdropHost(view);
  dispatch(view.replayButton, "click");
  assert.ok(view.graphTransition);
  const cancel = globalThis.window.cancelAnimationFrame;
  let cancelled = false;
  globalThis.window.cancelAnimationFrame = () => { cancelled = true; };
  try { await view.onClose(); } finally { globalThis.window.cancelAnimationFrame = cancel; }
  assert.equal(cancelled, true);
  assert.equal(view.graphTransition, null);
  assert.equal(view.motionFrame, null);
  assert.equal(view.motionNodes.size, 0);
  assert.equal(view.closed, true);
});

test("large documentation anchors retain their names among dense small nodes", () => {
  const view = createView();
  const titles = ["架构与设计", "计划与变更", "开发与使用", "运维与部署", "验证与报告", "参考资料"];
  const paths = ["docs/首页.md", ...titles.map((title) => `docs/索引/${title}.md`)];
  const denseNotes = [...notes, ...paths.map((path) => ({
    path, basename: path.split("/").at(-1).slice(0, -3), mtime: 0,
  })), ...Array.from({ length: 120 }, (_, i) => ({
    path: `docs/文档${i}.md`, basename: `文档${i}`, mtime: 0,
  }))];
  view.graph = buildGraph(denseNotes, paths.slice(1).map((target) => ({
    source: paths[0], target,
  })), "memory-and-docs");
  view.graph.nodes.forEach((node, index) => {
    const angle = index * 2.4;
    const radius = node.kind === "document" ? 140 + index % 90 : 190;
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
  });
  view.nodeById = new Map(view.graph.nodes.map((node) => [node.id, node]));
  dispatch(view.canvas, "pointermove", pointAt(view, paths[0]));
  const { labels } = render(view);
  for (const title of [...titles, "项目文档", "项目记忆"]) {
    assert.ok(labels.some((label) => label.text === title), `anchor label remains visible: ${title}`);
  }
});

function assertNeutral(color) {
  const channels = color.startsWith("#")
    ? color.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16))
    : color.match(/[\d.]+/g).slice(0, 3).map(Number);
  assert.equal(channels[0], channels[1], `red and green match: ${color}`);
  assert.equal(channels[1], channels[2], `green and blue match: ${color}`);
}

test("floating controls retain a neutral monochrome palette", () => {
  const styles = readFileSync("styles.css", "utf8");
  const colors = styles.match(/#[\da-f]{6}\b|rgba?\([\d.,\s]+\)/gi);
  assert.ok(colors.length > 20, "check the actual stylesheet palette");
  colors.forEach(assertNeutral);
});

test("node categories retain distinct tints and glass does not obscure small notes", () => {
  const view = createView();
  const extra = ["AGENTS.md", "docs/首页.md", "docs/索引/架构与设计.md", "docs/架构.md"];
  view.graph = buildGraph([...notes, ...extra.map((path) => ({
    path, basename: path.split("/").at(-1).slice(0, -3), mtime: 0,
  }))], links, "memory-and-docs");
  view.graph.nodes.forEach((node, index) => Object.assign(node, { x: index * 90 - 315, y: 0 }));
  view.nodeById = new Map(view.graph.nodes.map((node) => [node.id, node]));
  assert.equal(new Set(view.graph.nodes.map((node) => node.kind)).size, 8);
  const { nodes } = render(view);
  const faces = new Map(nodes.map((node) => [node.x, node.face.stops]));
  const tints = [];
  for (const node of view.graph.nodes) {
    const stops = faces.get(view.worldToScreen(node).x);
    const middle = stops.find((stop) => stop.offset === 0.55).color;
    const channels = middle.match(/[\d.]+/g).map(Number);
    const [r, g, b, alpha] = channels;
    tints.push(`${r},${g},${b}`);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 64, "restrained color chroma");
    if (view.isAnchor(node)) {
      assert.ok(alpha >= 0.25 && alpha <= 0.5, "large nodes have a translucent interior");
    } else {
      assert.ok(alpha >= 0.7, "small notes remain legible, not empty glass rings");
    }
  }
  assert.equal(new Set(tints).size, view.graph.nodes.length, "semantic categories are visibly distinct");
});

test("search interaction styles remain transparent with a capsule-level focus indicator", () => {
  const styles = readFileSync("styles.css", "utf8");
  const interactiveInput = styles.match(/input\.memory-constellation__search-input:is\(:hover, :focus, :focus-visible, :active\)\s*\{([^}]+)\}/);
  assert.ok(interactiveInput, "override host input interaction states");
  for (const rule of ["background: transparent", "box-shadow: none", "outline: none"]) {
    assert.ok(interactiveInput[1].includes(rule), rule);
  }
  assert.match(styles, /__controls:has\(input:focus-visible\)\s*\{[^}]*outline:/);
});

test("toolbar reserves stable columns for both scope labels and both display modes", () => {
  const styles = readFileSync("styles.css", "utf8");
  const controls = styles.match(/\.memory-constellation__controls\s*\{([^}]+)\}/)?.[1];
  assert.ok(controls?.includes("display: grid"));
  assert.ok(controls.includes("grid-template-columns: minmax(0, 1fr) 104px 54px"));
  assert.ok(controls.includes("width: 372px") && controls.includes("min-width: 0"));
  const search = styles.match(/\.memory-constellation__search\s*\{([^}]+)\}/)[1];
  assert.ok(search.includes("min-width: 0") && !search.includes("width: 192px"));
  const view = createView();
  const combinations = [];
  for (let scope = 0; scope < 2; scope += 1) {
    dispatch(view.scopeButton, "click");
    for (let mode = 0; mode < 2; mode += 1) {
      dispatch(view.modeButton, "click");
      combinations.push(`${view.scopeButton.textContent}/${view.modeButton.textContent}`);
    }
  }
  assert.deepEqual(combinations, ["记忆 + 文档/全景", "记忆 + 文档/简洁", "记忆/全景", "记忆/简洁"]);
});

test("glass reflection follows the pointer and resets without changing graph focus", () => {
  const view = createView();
  view.reducedMotion = false;
  const properties = new Map();
  const surface = Object.assign(new EventTarget(), {
    style: { setProperty: (key, value) => properties.set(key, value) },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 40 }),
  });
  view.registerGlassInteraction(surface);
  dispatch(surface, "pointermove", { clientX: 160, clientY: 40 });
  assert.equal(properties.get("--mc-glass-x"), "75%");
  assert.equal(properties.get("--mc-glass-y"), "50%");
  dispatch(surface, "pointerleave");
  assert.equal(properties.get("--mc-glass-x"), "30%");
  assert.equal(properties.get("--mc-glass-y"), "0%");
  assert.equal(view.hoveredId, null);
  view.reducedMotion = true;
  dispatch(surface, "pointermove", { clientX: 160, clientY: 40 });
  assert.equal(properties.get("--mc-glass-x"), "30%", "reduced motion keeps reflections still");
});

function addBackdropHost(view) {
  const classes = new Set();
  const frames = new Map();
  let frameId = 0;
  const ownerWindow = Object.assign(new EventTarget(), {
    frames,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    advance(time) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
    },
  });
  view.backdropLightEl = {
    style: {},
    classList: { toggle: (name, value) => value ? classes.add(name) : classes.delete(name) },
  };
  view.contentEl = Object.assign(new EventTarget(), {
    ownerDocument: { defaultView: ownerWindow },
    empty() {},
    getBoundingClientRect: () => ({ left: 100, top: 50, right: 1100, bottom: 750 }),
  });
  view.registerBackdropInteraction();
  return classes;
}

test("backdrop light follows the whole view without requesting graph frames", () => {
  const view = createView();
  view.reducedMotion = false;
  const classes = addBackdropHost(view);
  let requested = 0;
  view.requestDraw = () => { requested += 1; };
  const ownerWindow = view.contentEl.ownerDocument.defaultView;
  dispatch(view.contentEl, "pointermove", { clientX: 400, clientY: 350, pointerType: "mouse" });
  ownerWindow.advance(1000);
  assert.match(view.backdropLightEl.style.transform, /^translate\(300px, 300px\)/);
  assert.ok(classes.has("is-visible"));
  dispatch(view.canvas, "pointerleave");
  dispatch(view.contentEl, "pointermove", { clientX: 950, clientY: 90, pointerType: "mouse" });
  assert.equal(ownerWindow.frames.size, 1, "one independent light frame is scheduled");
  ownerWindow.advance(1016);
  assert.ok(view.backdropPosition.x > 300 && view.backdropPosition.x < 850, "position eases toward the pointer");
  assert.ok(view.backdropStretch > 0 && view.backdropStretch <= 0.22, "motion produces bounded deformation");
  assert.ok(classes.has("is-visible"), "entering floating controls does not hide the backdrop");
  assert.equal(view.hoveredId, null);
  assert.equal(requested, 0, "moving the light alone never redraws the graph");
});

test("backdrop light clears on exit, cancellation, capture outside the view and window blur", () => {
  const view = createView();
  view.reducedMotion = false;
  const classes = addBackdropHost(view);
  const show = () => dispatch(view.contentEl, "pointermove", { clientX: 400, clientY: 350, pointerType: "mouse" });
  for (const event of ["pointerleave", "pointercancel"]) {
    show();
    dispatch(view.contentEl, event);
    assert.ok(!classes.has("is-visible"));
    assert.equal(view.contentEl.ownerDocument.defaultView.frames.size, 0);
  }
  show();
  dispatch(view.contentEl, "pointermove", { clientX: 50, clientY: 350, pointerType: "mouse" });
  assert.ok(!classes.has("is-visible"), "pointer capture outside the view cannot leave light on the edge");
  show();
  dispatch(view.contentEl.ownerDocument.defaultView, "blur");
  assert.ok(!classes.has("is-visible"));
});

test("light motion settles to a circle and cancels pending frames on close", async () => {
  const view = createView();
  view.reducedMotion = false;
  addBackdropHost(view);
  const ownerWindow = view.contentEl.ownerDocument.defaultView;
  dispatch(view.contentEl, "pointermove", { clientX: 400, clientY: 350, pointerType: "mouse" });
  ownerWindow.advance(1000);
  dispatch(view.contentEl, "pointermove", { clientX: 600, clientY: 390, pointerType: "mouse" });
  dispatch(view.contentEl, "pointermove", { clientX: 700, clientY: 390, pointerType: "mouse" });
  assert.equal(ownerWindow.frames.size, 1, "rapid events coalesce into one animation frame");
  for (let frame = 1; frame <= 120; frame += 1) ownerWindow.advance(1000 + frame * 16);
  assert.deepEqual(view.backdropPosition, { x: 600, y: 340 });
  assert.equal(view.backdropStretch, 0);
  assert.equal(ownerWindow.frames.size, 0, "no continuous repainting after settling");
  dispatch(view.contentEl, "pointermove", { clientX: 500, clientY: 300, pointerType: "mouse" });
  const cancel = globalThis.window.cancelAnimationFrame;
  globalThis.window.cancelAnimationFrame = () => {};
  try { await view.onClose(); } finally { globalThis.window.cancelAnimationFrame = cancel; }
  assert.equal(ownerWindow.frames.size, 0, "unloading cannot leave a light animation behind");
});

test("backdrop light is suppressed for reduced motion and touch input", () => {
  const view = createView();
  const classes = addBackdropHost(view);
  dispatch(view.contentEl, "pointermove", { clientX: 400, clientY: 350, pointerType: "mouse" });
  assert.ok(!classes.has("is-visible"));
  view.reducedMotion = false;
  dispatch(view.contentEl, "pointermove", { clientX: 400, clientY: 350, pointerType: "touch" });
  assert.ok(!classes.has("is-visible"));
});

test("compact light texture has a smooth falloff and sub-level alpha dithering", () => {
  const random = Math.random;
  let low;
  let high;
  try {
    Math.random = () => 0;
    low = createBackdropPixels(64);
    Math.random = () => 0.999999;
    high = createBackdropPixels(64);
  } finally { Math.random = random; }
  let dithered = 0;
  for (let i = 3; i < low.length; i += 4) {
    assert.ok(high[i] - low[i] >= 0 && high[i] - low[i] <= 1, "dither spans only one alpha level");
    if (high[i] !== low[i]) dithered += 1;
    assert.ok(high[i] <= 36, "bounded luminance");
  }
  assert.ok(dithered > 1000, "fractional gray levels are distributed rather than rounded into rings");
  const alpha = (x, y) => low[(y * 64 + x) * 4 + 3];
  assert.equal(alpha(0, 0), 0);
  assert.ok(alpha(32, 32) > alpha(42, 32));
  assert.ok(alpha(42, 32) > alpha(52, 32));
  assert.ok(alpha(0, 32) <= 1 && alpha(63, 32) <= 1, "no hard edge at the texture boundary");
  const styles = readFileSync("styles.css", "utf8");
  const light = styles.match(/__cursor-light\s*\{([^}]+)\}/)[1];
  assert.ok(light.includes("width: 160px") && light.includes("height: 160px"));
  assert.ok(!light.includes("radial-gradient"), "do not reintroduce concentric gradient layers");
});
