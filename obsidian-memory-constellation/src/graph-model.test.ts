import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGraph,
  classifyNote,
  includePath,
  neighborhood,
  searchNodes,
  shortenTitle,
  type NoteInput,
  type ResolvedLinkInput,
} from "./graph-model";

const notes: NoteInput[] = [
  {
    path: "project-memory/首页.md",
    basename: "首页",
    mtime: 5,
    frontmatter: { type: "project-memory-home" },
  },
  {
    path: "project-memory/工作流/文档整理.md",
    basename: "文档整理",
    mtime: 4,
    frontmatter: { type: "workstream" },
  },
  {
    path: "project-memory/工作记录/2026/09/2026-09-04T232149+0800-Codex-EvoMind最新适配.md",
    basename: "2026-09-04T232149+0800-Codex-EvoMind最新适配",
    mtime: 3,
    frontmatter: { type: "worklog" },
  },
  { path: "project-memory/项目概览.md", basename: "项目概览", mtime: 2 },
  { path: "project-memory/模板/工作记录模板.md", basename: "工作记录模板", mtime: 1 },
  { path: "docs/首页.md", basename: "首页", mtime: 5, frontmatter: { type: "documentation-home" } },
  { path: "docs/索引/架构与设计.md", basename: "架构与设计", mtime: 2 },
  { path: "docs/architecture.md", basename: "architecture", mtime: 1 },
  { path: "docs/superpowers/generated.md", basename: "generated", mtime: 1 },
  { path: "AGENTS.md", basename: "AGENTS", mtime: 1 },
];

const links: ResolvedLinkInput[] = [
  { source: "project-memory/首页.md", target: "project-memory/工作流/文档整理.md" },
  { source: "project-memory/工作流/文档整理.md", target: "project-memory/工作记录/2026/09/2026-09-04T232149+0800-Codex-EvoMind最新适配.md" },
  { source: "project-memory/首页.md", target: "project-memory/项目概览.md", weight: 2 },
  { source: "project-memory/首页.md", target: "project-memory/项目概览.md", weight: 1 },
  { source: "project-memory/项目概览.md", target: "project-memory/首页.md", weight: 1 },
  { source: "project-memory/工作记录/2026/09/2026-09-04T232149+0800-Codex-EvoMind最新适配.md", target: "project-memory/首页.md" },
  { source: "docs/首页.md", target: "docs/索引/架构与设计.md" },
  { source: "docs/索引/架构与设计.md", target: "docs/architecture.md" },
];

describe("scope and classification", () => {
  it("keeps Project Memory and agent guides in the default scope", () => {
    assert.equal(includePath("project-memory/首页.md", "memory"), true);
    assert.equal(includePath("AGENTS.md", "memory"), true);
    assert.equal(includePath("docs/architecture.md", "memory"), false);
  });

  it("excludes templates, nested legacy memory, and superpowers documents", () => {
    assert.equal(includePath("project-memory/模板/工作记录模板.md", "memory"), false);
    assert.equal(includePath("project-memory/project-memory/首页.md", "memory"), false);
    assert.equal(includePath("docs/superpowers/generated.md", "memory-and-docs"), false);
  });

  it("recognizes semantic note kinds", () => {
    assert.equal(classifyNote(notes[0]!), "home");
    assert.equal(classifyNote(notes[1]!), "workstream");
    assert.equal(classifyNote(notes[2]!), "worklog");
    assert.equal(classifyNote(notes[6]!), "document-index");
  });
});

describe("titles", () => {
  it("removes timestamp and agent prefixes from worklogs", () => {
    assert.equal(shortenTitle(notes[2]!.basename, "worklog"), "EvoMind最新适配");
  });

  it("uses unambiguous home labels and bounds long titles", () => {
    assert.equal(shortenTitle("首页", "home"), "项目记忆");
    assert.equal(shortenTitle("首页", "document-home"), "项目文档");
    assert.equal(Array.from(shortenTitle("这是一个非常非常长的文档标题", "document", 8)).length, 8);
  });
});

describe("graph construction", () => {
  it("collapses repeated links and keeps a stable semantic layout", () => {
    const first = buildGraph(notes, links, "memory");
    const second = buildGraph(notes, links, "memory");

    assert.equal(first.nodes.some((node) => node.path === "docs/architecture.md"), false);
    assert.equal(first.nodes.some((node) => node.path === "project-memory/模板/工作记录模板.md"), false);
    assert.equal(
      first.edges.find((edge) =>
        [edge.source, edge.target].includes("project-memory/项目概览.md"),
      )?.weight,
      4,
    );
    assert.equal(
      first.edges.some(
        (edge) =>
          [edge.source, edge.target].includes("project-memory/首页.md") &&
          [edge.source, edge.target].includes(
            "project-memory/工作记录/2026/09/2026-09-04T232149+0800-Codex-EvoMind最新适配.md",
          ),
      ),
      false,
    );
    assert.deepEqual(first.nodes.map(({ id, x, y }) => ({ id, x, y })),
      second.nodes.map(({ id, x, y }) => ({ id, x, y })),
    );
    assert.deepEqual(
      pickPosition(first.nodes.find((node) => node.kind === "home")),
      { x: 0, y: 0 },
    );
  });

  it("adds documents only in the expanded scope", () => {
    const graph = buildGraph(notes, links, "memory-and-docs");
    assert.equal(graph.nodes.some((node) => node.path === "docs/architecture.md"), true);
    assert.equal(graph.nodes.some((node) => node.path === "docs/superpowers/generated.md"), false);
  });

  it("returns a bounded undirected focus neighborhood", () => {
    const graph = buildGraph(notes, links, "memory");
    const focused = neighborhood(graph, "project-memory/首页.md", 2);
    assert.equal(focused.has("project-memory/首页.md"), true);
    assert.equal(
      focused.has("project-memory/工作记录/2026/09/2026-09-04T232149+0800-Codex-EvoMind最新适配.md"),
      true,
    );
  });
});

describe("note search", () => {
  it("finds display titles, original filenames, paths, and normalized mixed keywords", () => {
    const graph = buildGraph(notes, links, "memory-and-docs");
    assert.equal(searchNodes(graph, "项目记忆")[0]?.kind, "home");
    assert.equal(searchNodes(graph, " 项目文档 ")[0]?.kind, "document-home");
    assert.equal(searchNodes(graph, "ｅｖｏｍｉｎｄ 2026/09 Codex")[0]?.kind, "worklog");
    assert.equal(searchNodes(graph, "2026-09-04T232149+0800-Codex")[0]?.kind, "worklog");
    assert.deepEqual(searchNodes(graph, "不存在"), []);
    assert.deepEqual(searchNodes(graph, "  "), []);
    assert.deepEqual(searchNodes(graph, "EvoMind 不存在"), []);
  });

  it("ranks exact titles before prefixes, title fragments, and path-only matches", () => {
    const paths = ["部署/配置", "环境与部署", "部署指南", "部署"];
    const graph = buildGraph(paths.map((path) => ({
      path: `project-memory/${path}.md`, basename: path.split("/").at(-1)!, mtime: 0,
    })), [], "memory");
    assert.deepEqual(searchNodes(graph, "部署").map((node) => node.fullTitle),
      ["部署", "部署指南", "环境与部署", "配置"]);
  });

  it("preserves same-name results and searches only the active graph scope", () => {
    const memory = buildGraph(notes, links, "memory");
    const expanded = buildGraph(notes, links, "memory-and-docs");
    assert.equal(searchNodes(expanded, "首页").length, 2);
    assert.equal(searchNodes(memory, "architecture").length, 0);
    assert.equal(searchNodes(expanded, "architecture").length, 1);
    assert.equal(searchNodes(expanded, "generated").length, 0);
  });
});

function pickPosition(node: { x: number; y: number } | undefined): { x: number; y: number } | null {
  return node ? { x: node.x, y: node.y } : null;
}
