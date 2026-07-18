declare module 'd3-force-3d' {
  export interface ForceCollide<Node> {
    (alpha: number): void;
    radius(radius: number | ((node: Node, i: number, nodes: Node[]) => number)): this;
    strength(strength: number): this;
    iterations(n: number): this;
    initialize(nodes: Node[]): void;
  }

  export interface ForceManyBody<Node> {
    (alpha: number): void;
    strength(strength: number | ((node: Node, i: number, nodes: Node[]) => number)): this;
    distanceMin(min: number): this;
    distanceMax(max: number): this;
    theta(t: number): this;
    initialize(nodes: Node[]): void;
  }

  export function forceCollide<Node = unknown>(
    radius?: number | ((node: Node, i: number, nodes: Node[]) => number),
  ): ForceCollide<Node>;

  export function forceLink<Node = unknown, Link = unknown>(links?: Link[]): unknown;
  export function forceManyBody<Node = unknown>(): ForceManyBody<Node>;
  export function forceCenter(x?: number, y?: number, z?: number): unknown;
  export function forceRadial(
    radius: number,
    x?: number,
    y?: number,
    z?: number,
  ): unknown;
  export function forceSimulation<Node = unknown>(nodes?: Node[]): unknown;
}
