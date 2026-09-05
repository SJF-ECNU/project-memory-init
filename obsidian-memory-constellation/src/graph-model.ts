export type GraphScope = "memory" | "memory-and-docs";

export type NodeKind =
  | "home"
  | "memory"
  | "workstream"
  | "worklog"
  | "guide"
  | "document-home"
  | "document-index"
  | "document";

export interface NoteInput {
  path: string;
  basename: string;
  mtime: number;
  frontmatter?: Record<string, unknown>;
}

export interface ResolvedLinkInput {
  source: string;
  target: string;
  weight?: number;
}

export interface GraphNode {
  id: string;
  path: string;
  title: string;
  fullTitle: string;
  kind: NodeKind;
  mtime: number;
  degree: number;
  priority: number;
  radius: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  homeId: string | null;
}

const ROOT_GUIDES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md",
  "GEMINI.md",
]);

const KIND_PRIORITY: Record<NodeKind, number> = {
  home: 10,
  "document-home": 9,
  memory: 8,
  workstream: 7,
  "document-index": 6,
  guide: 6,
  worklog: 4,
  document: 3,
};

const KIND_RADIUS: Record<NodeKind, number> = {
  home: 13,
  "document-home": 11,
  memory: 7,
  workstream: 8,
  "document-index": 7,
  guide: 6,
  worklog: 4.5,
  document: 3.5,
};

export function includePath(path: string, scope: GraphScope): boolean {
  if (ROOT_GUIDES.has(path)) return true;

  if (path.startsWith("project-memory/")) {
    return (
      !path.startsWith("project-memory/模板/") &&
      !path.startsWith("project-memory/project-memory/")
    );
  }

  return (
    scope === "memory-and-docs" &&
    path.startsWith("docs/") &&
    !path.startsWith("docs/superpowers/")
  );
}

export function classifyNote(note: NoteInput): NodeKind {
  const type = String(note.frontmatter?.type ?? "");

  if (note.path === "project-memory/首页.md" || type === "project-memory-home") {
    return "home";
  }
  if (note.path === "docs/首页.md" || type === "documentation-home") {
    return "document-home";
  }
  if (note.path.startsWith("project-memory/工作流/") || type === "workstream") {
    return "workstream";
  }
  if (note.path.startsWith("project-memory/工作记录/") || type === "worklog") {
    return "worklog";
  }
  if (ROOT_GUIDES.has(note.path)) return "guide";
  if (note.path.startsWith("docs/索引/") || type === "documentation-index") {
    return "document-index";
  }
  if (note.path.startsWith("docs/")) return "document";
  return "memory";
}

export function shortenTitle(
  basename: string,
  kind: NodeKind,
  maxLength = 24,
): string {
  if (kind === "home") return "项目记忆";
  if (kind === "document-home") return "项目文档";

  let title = basename;
  if (kind === "worklog") {
    title = title.replace(
      /^\d{4}-\d{2}-\d{2}T\d{6}[+-]\d{4}-[^-]+-/,
      "",
    );
  }

  const characters = Array.from(title);
  if (characters.length <= maxLength) return title;
  return `${characters.slice(0, maxLength - 1).join("")}…`;
}

export function buildGraph(
  notes: NoteInput[],
  links: ResolvedLinkInput[],
  scope: GraphScope,
): GraphModel {
  const nodes = notes
    .filter((note) => includePath(note.path, scope))
    .map((note): GraphNode => {
      const kind = classifyNote(note);
      return {
        id: note.path,
        path: note.path,
        title: shortenTitle(note.basename, kind),
        fullTitle: note.basename,
        kind,
        mtime: note.mtime,
        degree: 0,
        priority: KIND_PRIORITY[kind],
        radius: KIND_RADIUS[kind],
        x: 0,
        y: 0,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const collapsed = new Map<string, GraphEdge>();

  for (const link of links) {
    const sourceNode = byId.get(link.source);
    const targetNode = byId.get(link.target);
    if (!sourceNode || !targetNode || link.source === link.target) {
      continue;
    }
    if (isRoutineVisualEdge(sourceNode, targetNode)) continue;

    const [source, target] = [link.source, link.target].sort((left, right) =>
      left.localeCompare(right, "zh-CN"),
    );
    const id = `${source}↔${target}`;
    const current = collapsed.get(id);
    if (current) {
      current.weight += link.weight ?? 1;
    } else {
      collapsed.set(id, {
        id,
        source,
        target,
        weight: link.weight ?? 1,
      });
    }
  }

  const edges = [...collapsed.values()].sort((left, right) =>
    left.id.localeCompare(right.id, "zh-CN"),
  );

  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    source.degree += 1;
    target.degree += 1;
  }

  for (const node of nodes) {
    node.priority += Math.min(2.5, Math.log2(node.degree + 1) * 0.7);
    node.radius += Math.min(2, Math.sqrt(node.degree) * 0.28);
  }

  const home =
    nodes.find((node) => node.kind === "home") ??
    nodes.find((node) => node.kind === "document-home") ??
    nodes[0] ??
    null;

  layoutGraph(nodes, edges);
  return { nodes, edges, homeId: home?.id ?? null };
}

function isRoutineVisualEdge(source: GraphNode, target: GraphNode): boolean {
  const kinds = new Set([source.kind, target.kind]);
  return kinds.has("home") && kinds.has("worklog");
}

export function neighborhood(
  graph: GraphModel,
  startId: string | null,
  depth: number,
): Set<string> {
  if (!startId) return new Set();

  const adjacent = adjacency(graph.edges);
  const visited = new Set([startId]);
  let frontier = new Set([startId]);

  for (let hop = 0; hop < depth; hop += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacent.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    frontier = next;
  }
  return visited;
}

export function searchNodes(graph: GraphModel, query: string): GraphNode[] {
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("zh-CN");
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const phrase = terms.join(" ");

  return graph.nodes.flatMap((node) => {
    const titles = [node.fullTitle, shortenTitle(node.fullTitle, node.kind, Infinity)].map(normalize);
    const searchable = `${titles.join(" ")} ${normalize(node.path)}`;
    if (!terms.every((term) => searchable.includes(term))) return [];
    const rank = titles.some((title) => title === phrase) ? 0
      : titles.some((title) => title.startsWith(phrase)) ? 1
      : titles.some((title) => title.includes(phrase)) ? 2
      : terms.every((term) => titles.some((title) => title.includes(term))) ? 3 : 4;
    return [{ node, rank }];
  }).sort((left, right) => left.rank - right.rank
    || right.node.priority - left.node.priority
    || right.node.mtime - left.node.mtime
    || left.node.path.localeCompare(right.node.path, "zh-CN"))
    .map(({ node }) => node);
}

export function graphBounds(nodes: GraphNode[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (nodes.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  return nodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.x),
      maxX: Math.max(bounds.maxX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxY: Math.max(bounds.maxY, node.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
  const groups = new Map<NodeKind, GraphNode[]>();
  for (const node of nodes) {
    const group = groups.get(node.kind) ?? [];
    group.push(node);
    groups.set(node.kind, group);
  }

  const home = groups.get("home")?.[0];
  if (home) position(home, 0, 0);

  placeRing(groups.get("guide") ?? [], 0, 0, 130, -Math.PI * 0.8);
  placeRing(groups.get("memory") ?? [], 0, 0, 215, -Math.PI * 0.95);
  placeRing(groups.get("workstream") ?? [], 0, 0, 365, -Math.PI * 0.9);

  const adjacent = adjacency(edges);
  const workstreams = new Map((groups.get("workstream") ?? []).map((node) => [node.id, node]));
  const logsByParent = new Map<string, GraphNode[]>();
  const orphanLogs: GraphNode[] = [];

  for (const log of groups.get("worklog") ?? []) {
    const parentId = [...(adjacent.get(log.id) ?? [])].find((id) => workstreams.has(id));
    if (!parentId) {
      orphanLogs.push(log);
      continue;
    }
    const siblings = logsByParent.get(parentId) ?? [];
    siblings.push(log);
    logsByParent.set(parentId, siblings);
  }

  for (const [parentId, logs] of logsByParent) {
    const parent = workstreams.get(parentId);
    if (!parent) continue;
    const parentAngle = Math.atan2(parent.y, parent.x);
    logs.sort((left, right) => right.mtime - left.mtime || left.path.localeCompare(right.path));
    logs.forEach((log, index) => {
      const row = Math.floor(index / 7);
      const rowCount = Math.min(7, logs.length - row * 7);
      const column = index % 7;
      const spread = (column - (rowCount - 1) / 2) * 0.065;
      const angle = parentAngle + spread + signedJitter(log.id, 0.018);
      const radius = 505 + row * 54 + signedJitter(`${log.id}:r`, 13);
      position(log, Math.cos(angle) * radius, Math.sin(angle) * radius);
    });
  }
  placeRing(orphanLogs, 0, 0, 525, -Math.PI * 0.9);

  const documentHome = groups.get("document-home")?.[0];
  const documentCenterX = 760;
  if (documentHome) position(documentHome, documentCenterX, 0);

  const indexes = groups.get("document-index") ?? [];
  placeRing(indexes, documentCenterX, 0, 205, -Math.PI / 2);
  const indexesById = new Map(indexes.map((node) => [node.id, node]));
  const docsByIndex = new Map<string, GraphNode[]>();
  const orphanDocs: GraphNode[] = [];

  for (const document of groups.get("document") ?? []) {
    const parentId = [...(adjacent.get(document.id) ?? [])].find((id) => indexesById.has(id));
    if (!parentId) {
      orphanDocs.push(document);
      continue;
    }
    const siblings = docsByIndex.get(parentId) ?? [];
    siblings.push(document);
    docsByIndex.set(parentId, siblings);
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const [parentId, documents] of docsByIndex) {
    const parent = indexesById.get(parentId);
    if (!parent) continue;
    documents.sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
    documents.forEach((document, index) => {
      const radius = 72 + Math.sqrt(index + 1) * 23;
      const angle = index * goldenAngle + hashUnit(parentId) * Math.PI * 2;
      position(
        document,
        parent.x + Math.cos(angle) * radius,
        parent.y + Math.sin(angle) * radius,
      );
    });
  }
  placeRing(orphanDocs, documentCenterX, 0, 455, -Math.PI / 2);
}

function placeRing(
  nodes: GraphNode[],
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
): void {
  const sorted = [...nodes].sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
  sorted.forEach((node, index) => {
    const angle = startAngle + (index / Math.max(1, sorted.length)) * Math.PI * 2;
    const localRadius = radius + signedJitter(`${node.id}:ring`, Math.min(18, radius * 0.05));
    position(
      node,
      centerX + Math.cos(angle) * localRadius,
      centerY + Math.sin(angle) * localRadius,
    );
  });
}

function position(node: GraphNode, x: number, y: number): void {
  node.x = x;
  node.y = y;
}

function adjacency(edges: GraphEdge[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const edge of edges) {
    const source = result.get(edge.source) ?? new Set<string>();
    const target = result.get(edge.target) ?? new Set<string>();
    source.add(edge.target);
    target.add(edge.source);
    result.set(edge.source, source);
    result.set(edge.target, target);
  }
  return result;
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function signedJitter(value: string, amount: number): number {
  return (hashUnit(value) * 2 - 1) * amount;
}
