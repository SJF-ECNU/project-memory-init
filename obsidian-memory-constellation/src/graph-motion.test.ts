import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGraph } from "./graph-model";
import { GraphTransition } from "./graph-motion";

const home = "project-memory/首页.md";
const doc = "docs/首页.md";
const index = "docs/索引/架构.md";
const note = "docs/说明.md";
const paths = [home, "project-memory/背景.md", doc, index, note, "docs/独立文档.md"];
const notes = paths.map((path) => ({ path, basename: path.split("/").at(-1)!.slice(0, -3), mtime: 0 }));
const links = [[home, paths[1]!], [home, doc], [doc, index], [index, note]].map(([source, target]) => ({ source: source!, target: target! }));
const memory = buildGraph(notes, links, "memory");
const expanded = buildGraph(notes, links, "memory-and-docs");
const empty = { nodes: [], edges: [], homeId: null };

test("replay begins blank, grows along relations, and finishes including isolated notes within 900 ms", () => {
  const motion = new GraphTransition(empty, expanded, 1000);
  const start = motion.sample(1000);
  assert.ok(start.nodes.every((node) => node.presence === 0));
  assert.equal(start.edges.length, 0);
  const wave = motion.sample(1120);
  assert.ok(wave.nodes.find((node) => node.id === home)!.presence > wave.nodes.find((node) => node.id === note)!.presence);
  assert.ok(wave.edges.some((edge) => edge.reveal > 0 && edge.reveal < 1));
  const end = motion.sample(1900);
  assert.equal(end.moving, false);
  assert.equal(end.nodes.length, expanded.nodes.length);
  assert.equal(end.edges.length, expanded.edges.length);
  assert.ok(end.nodes.every((node) => node.presence === 1 && node.scale === 1));
});

test("scope expansion retains existing nodes while new nodes grow, contraction fades them out", () => {
  const motion = new GraphTransition(memory, expanded, 0);
  assert.equal(motion.sample(0).nodes.find((node) => node.id === home)!.presence, 1);
  assert.equal(motion.sample(0).nodes.find((node) => node.id === doc)!.presence, 0);
  const contraction = new GraphTransition(motion.sample(900), memory, 1000);
  const middle = contraction.sample(1100).nodes.find((node) => node.id === doc)!;
  assert.ok(middle.presence > 0 && middle.presence < 1);
  assert.ok(middle.scale < 1);
  const end = contraction.sample(1900);
  assert.deepEqual(end.nodes.map((node) => node.id), memory.nodes.map((node) => node.id));
  assert.equal(end.edges.length, memory.edges.length);
  assert.equal(end.moving, false);
});

test("rapid reversal continues from the current positions, scale, and opacity", () => {
  const opening = new GraphTransition(memory, expanded, 0);
  const snapshot = opening.sample(260);
  const closing = new GraphTransition(snapshot, memory, 260);
  const next = closing.sample(260);
  for (const node of snapshot.nodes) {
    const resumed = next.nodes.find((candidate) => candidate.id === node.id)!;
    assert.equal(resumed.x, node.x);
    assert.equal(resumed.y, node.y);
    assert.equal(resumed.presence, node.presence);
    assert.equal(resumed.scale, node.scale);
  }
  const reopening = new GraphTransition(closing.sample(320), expanded, 320);
  assert.equal(reopening.sample(1220).nodes.length, expanded.nodes.length);
  assert.equal(reopening.sample(1220).moving, false);
});

test("unlinking retained notes removes the old edge; empty graphs have no animation loop", () => {
  const motion = new GraphTransition(memory, { ...memory, edges: [] }, 0);
  assert.equal(motion.sample(900).edges.length, 0);
  assert.equal(new GraphTransition(empty, empty, 0).sample(0).moving, false);
});

test("growth duration does not scale linearly with note count or link depth", () => {
  const manyNotes = Array.from({ length: 1000 }, (_, i) => ({ path: `docs/${i}.md`, basename: String(i), mtime: 0 }));
  const chain = manyNotes.slice(1).map((node, i) => ({ source: manyNotes[i]!.path, target: node.path }));
  const graph = buildGraph(manyNotes, chain, "memory-and-docs");
  const motion = new GraphTransition(empty, graph, 0);
  assert.equal(motion.sample(900).moving, false);
  assert.ok(motion.sample(900).nodes.every((node) => node.presence === 1));
});

test("global replay lasts 10 seconds in either scope without slowing ordinary transitions", () => {
  for (const graph of [memory, expanded]) {
    const replay = new GraphTransition(empty, graph, 1000, 10000);
    assert.equal(replay.sample(1000).nodes.every((node) => node.presence === 0), true);
    assert.equal(replay.sample(6000).moving, true);
    assert.equal(replay.sample(10900).moving, true);
    const end = replay.sample(11000);
    assert.equal(end.moving, false);
    assert.ok(end.nodes.every((node) => node.presence === 1 && node.scale === 1));
    assert.ok(end.edges.every((edge) => edge.reveal === 1));
  }
  assert.equal(new GraphTransition(memory, expanded, 0).sample(900).moving, false);
  assert.equal(new GraphTransition(empty, empty, 0, 10000).sample(0).moving, false);
});
