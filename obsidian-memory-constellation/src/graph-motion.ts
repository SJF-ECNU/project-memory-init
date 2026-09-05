import type { GraphEdge, GraphModel, GraphNode } from "./graph-model";

export interface MotionNode extends GraphNode {
  presence: number;
  scale: number;
}

interface MotionEdge extends GraphEdge {
  reveal: number;
}

export interface MotionFrame extends GraphModel {
  nodes: MotionNode[];
  edges: MotionEdge[];
  moving: boolean;
}

// A bounded wave follows actual relationships, not file order or a per-note timer.
function growthOrder(graph: GraphModel): Map<string, { delay: number; parent: GraphNode }> {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const neighbors = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    neighbors.get(edge.source)?.push(edge.target);
    neighbors.get(edge.target)?.push(edge.source);
  }
  const order = new Map<string, { delay: number; parent: GraphNode }>();
  const roots = [...graph.nodes].sort((a, b) =>
    Number(b.id === graph.homeId) - Number(a.id === graph.homeId) || b.priority - a.priority);
  const layers = new Map<number, string[]>();
  for (const root of roots) {
    if (order.has(root.id)) continue;
    const rootDepth = root.id === graph.homeId ? 0 : 2;
    const queue = [{ node: root, depth: rootDepth }];
    order.set(root.id, { delay: 0, parent: root });
    for (let i = 0; i < queue.length; i += 1) {
      const { node, depth } = queue[i]!;
      const layer = Math.min(depth, 4);
      const siblings = layers.get(layer) ?? [];
      siblings.push(node.id);
      layers.set(layer, siblings);
      for (const id of neighbors.get(node.id) ?? []) {
        const child = nodes.get(id);
        if (!child || order.has(id)) continue;
        order.set(id, { delay: 0, parent: node });
        queue.push({ node: child, depth: depth + 1 });
      }
    }
  }
  for (const [depth, ids] of layers) {
    ids.forEach((id, index) => {
      order.get(id)!.delay = depth * 75 + index / Math.max(1, ids.length - 1) * 90;
    });
  }
  return order;
}

export class GraphTransition {
  private nodeTracks: { from: MotionNode; to: GraphNode; delay: number; leaving: boolean }[];
  private edgeTracks: { edge: GraphEdge; from: number; delay: number; leaving: boolean }[];
  private playbackRate = 1;

  constructor(from: GraphModel | MotionFrame, private target: GraphModel, readonly startedAt: number, durationMs?: number) {
    const previous = new Map(from.nodes.map((node) => [node.id, node]));
    const targetIds = new Set(target.nodes.map((node) => node.id));
    const order = growthOrder(target);
    this.nodeTracks = target.nodes.map((node) => {
      const old = previous.get(node.id);
      const { delay, parent } = order.get(node.id)!;
      return {
        from: old ? { ...old, presence: "presence" in old ? old.presence : 1, scale: "scale" in old ? old.scale : 1 } : {
          ...node, x: node.x + (parent.x - node.x) * 0.18, y: node.y + (parent.y - node.y) * 0.18,
          presence: 0, scale: 0.28,
        },
        to: node, delay: old ? 0 : delay, leaving: false,
      };
    });
    for (const node of from.nodes) {
      if (targetIds.has(node.id)) continue;
      this.nodeTracks.push({
        from: { ...node, presence: "presence" in node ? node.presence : 1, scale: "scale" in node ? node.scale : 1 },
        to: node, delay: 0, leaving: true,
      });
    }
    const previousEdges = new Map(from.edges.map((edge) => [edge.id, edge]));
    const tracks = new Map(this.nodeTracks.map((track) => [track.to.id, track]));
    this.edgeTracks = target.edges.map((edge) => {
      const old = previousEdges.get(edge.id);
      const sourceDelay = tracks.get(edge.source)?.delay ?? 0;
      const targetDelay = tracks.get(edge.target)?.delay ?? 0;
      return {
        edge: old ?? (sourceDelay <= targetDelay ? edge : { ...edge, source: edge.target, target: edge.source }),
        from: old ? ("reveal" in old ? old.reveal : 1) : 0,
        delay: old ? 0 : Math.max(0, Math.max(sourceDelay, targetDelay) - 110),
        leaving: false,
      };
    });
    const targetEdges = new Set(target.edges.map((edge) => edge.id));
    for (const edge of from.edges) {
      if (!targetEdges.has(edge.id)) {
        this.edgeTracks.push({ edge, from: "reveal" in edge ? edge.reveal : 1, delay: 0, leaving: true });
      }
    }
    if (durationMs !== undefined) {
      const timelineDuration = Math.max(
        this.nodeTracks.reduce((end, track) => Math.max(end, track.delay + (track.leaving ? 280 : 450)), 0),
        this.edgeTracks.reduce((end, track) => Math.max(end, track.delay + (track.leaving ? 280 : 420)), 0),
      );
      if (timelineDuration > 0) this.playbackRate = timelineDuration / durationMs;
    }
  }

  sample(time: number): MotionFrame {
    const elapsed = Math.max(0, time - this.startedAt) * this.playbackRate;
    const nodes: MotionNode[] = [];
    let moving = false;
    for (const track of this.nodeTracks) {
      const progress = bounded((elapsed - track.delay) / (track.leaving ? 280 : 450));
      if (progress < 1) moving = true;
      if (track.leaving && progress === 1) continue;
      const eased = 1 - (1 - progress) ** 3;
      const { from, to } = track;
      nodes.push({
        ...to,
        x: mix(from.x, to.x, eased), y: mix(from.y, to.y, eased),
        radius: mix(from.radius, to.radius, eased),
        presence: mix(from.presence, track.leaving ? 0 : 1, eased),
        scale: mix(from.scale, track.leaving ? 0.65 : 1, eased),
      });
    }
    const visible = new Set(nodes.map((node) => node.id));
    const edges = this.edgeTracks.filter(({ edge }) => visible.has(edge.source) && visible.has(edge.target))
      .map(({ edge, from, delay, leaving }) => {
        const progress = bounded((elapsed - delay) / (leaving ? 280 : 420));
        if ((from < 1 || leaving) && progress < 1) moving = true;
        return { ...edge, reveal: mix(from, leaving ? 0 : 1, 1 - (1 - progress) ** 3) };
      }).filter((edge) => edge.reveal > 0);
    return { nodes, edges, homeId: this.target.homeId, moving };
  }
}

function bounded(value: number): number { return Math.max(0, Math.min(1, value)); }
function mix(from: number, to: number, progress: number): number { return from + (to - from) * progress; }
