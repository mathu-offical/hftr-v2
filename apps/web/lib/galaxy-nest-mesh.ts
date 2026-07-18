/**
 * Three.js meshes for galaxy organizational hull spheres (client-only).
 * Emphasis: idle / dim / hover / selected — company never drops below idle floor.
 */

import * as THREE from 'three';
import type { NestHullKind, NestHullNode } from './galaxy-nest-hulls';

export type NestEmphasis = 'idle' | 'dim' | 'hover' | 'selected';

type OpacitySet = { shell: number; wire: number; ring: number; meridian: number };

function baseOpacities(hullKind: NestHullKind): OpacitySet {
  switch (hullKind) {
    case 'company':
      return { shell: 0.03, wire: 0.2, ring: 0.16, meridian: 0.12 };
    case 'library':
      return { shell: 0.055, wire: 0.42, ring: 0.34, meridian: 0.22 };
    case 'folder':
      return { shell: 0.04, wire: 0.28, ring: 0.22, meridian: 0.12 };
    case 'article':
      return { shell: 0.055, wire: 0.38, ring: 0.28, meridian: 0.14 };
    case 'topic':
      return { shell: 0.08, wire: 0.55, ring: 0.4, meridian: 0.22 };
    default: {
      const _exhaustive: never = hullKind;
      return _exhaustive;
    }
  }
}

function scaleOpacities(base: OpacitySet, emphasis: NestEmphasis, hullKind: NestHullKind): OpacitySet {
  // Company envelope stays readable; never fully dims away.
  if (hullKind === 'company') {
    switch (emphasis) {
      case 'dim':
        return {
          shell: base.shell * 0.85,
          wire: base.wire * 0.75,
          ring: base.ring * 0.8,
          meridian: base.meridian * 0.75,
        };
      case 'hover':
        return {
          shell: base.shell * 1.6,
          wire: Math.min(0.55, base.wire * 1.7),
          ring: Math.min(0.5, base.ring * 1.8),
          meridian: Math.min(0.4, base.meridian * 1.7),
        };
      case 'selected':
        return {
          shell: base.shell * 2,
          wire: Math.min(0.65, base.wire * 2),
          ring: Math.min(0.55, base.ring * 2.1),
          meridian: Math.min(0.45, base.meridian * 2),
        };
      case 'idle':
        return base;
      default: {
        const _exhaustive: never = emphasis;
        return _exhaustive;
      }
    }
  }

  switch (emphasis) {
    case 'dim':
      return {
        shell: base.shell * 0.35,
        wire: base.wire * 0.28,
        ring: base.ring * 0.3,
        meridian: base.meridian * 0.25,
      };
    case 'hover':
      return {
        shell: Math.min(0.16, base.shell * 2.4),
        wire: Math.min(0.85, base.wire * 1.85),
        ring: Math.min(0.75, base.ring * 2),
        meridian: Math.min(0.55, base.meridian * 1.9),
      };
    case 'selected':
      return {
        shell: Math.min(0.2, base.shell * 3),
        wire: Math.min(0.95, base.wire * 2.2),
        ring: Math.min(0.85, base.ring * 2.4),
        meridian: Math.min(0.65, base.meridian * 2.2),
      };
    case 'idle':
      return base;
    default: {
      const _exhaustive: never = emphasis;
      return _exhaustive;
    }
  }
}

export function createNestHullObject3d(
  node: NestHullNode,
  emphasis: NestEmphasis = 'idle',
): THREE.Group {
  const group = new THREE.Group();
  const radius = Math.max(8, node.__radius);
  const color = new THREE.Color(node.__color);
  const hullKind = node.__hullKind;
  const isCompany = hullKind === 'company';
  const isTopic = hullKind === 'topic';
  const isFolder = hullKind === 'folder';
  const isArticle = hullKind === 'article';
  const opacities = scaleOpacities(baseOpacities(hullKind), emphasis, hullKind);

  const latSeg = isCompany ? 36 : isTopic || isArticle ? 24 : isFolder ? 20 : 22;
  const lonSeg = isCompany ? 24 : isTopic || isArticle ? 16 : isFolder ? 14 : 14;

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius, latSeg, lonSeg),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opacities.shell,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shell.userData.nestPart = 'shell';
  group.add(shell);

  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(radius, latSeg, lonSeg),
    new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: opacities.wire,
      depthWrite: false,
    }),
  );
  wire.userData.nestPart = 'wire';
  group.add(wire);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.985, radius * 1.015, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opacities.ring,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.userData.nestPart = 'ring';
  group.add(ring);

  if (!isFolder) {
    const meridian = ring.clone();
    meridian.rotation.x = 0;
    meridian.rotation.y = Math.PI / 2;
    meridian.material = (ring.material as THREE.MeshBasicMaterial).clone();
    (meridian.material as THREE.MeshBasicMaterial).opacity = opacities.meridian;
    meridian.userData.nestPart = 'meridian';
    group.add(meridian);
  }

  // Outer halo — always present; visibility toggled by emphasis (avoids mesh rebuild).
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.045, radius * 1.07, 64),
    new THREE.MeshBasicMaterial({
      color: emphasis === 'selected' ? '#c0caf5' : color,
      transparent: true,
      opacity: emphasis === 'selected' ? 0.55 : 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.userData.nestPart = 'halo';
  halo.visible = emphasis === 'hover' || emphasis === 'selected';
  group.add(halo);

  const scale = emphasis === 'selected' ? 1.035 : 1;
  group.scale.set(scale, scale, scale);

  group.userData.nestHullId = node.id;
  group.userData.nestHullKind = hullKind;
  group.userData.nestEmphasis = emphasis;
  return group;
}

/** Mutate existing nest group materials when emphasis changes (avoids physics reset). */
export function applyNestHullEmphasis(
  group: THREE.Object3D,
  hullKind: NestHullKind,
  emphasis: NestEmphasis,
): void {
  const opacities = scaleOpacities(baseOpacities(hullKind), emphasis, hullKind);
  const prev = group.userData.nestEmphasis as NestEmphasis | undefined;
  if (prev === emphasis) return;
  group.userData.nestEmphasis = emphasis;

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = child.material as THREE.MeshBasicMaterial;
    if (!mat || !('opacity' in mat)) return;
    const part = child.userData.nestPart as string | undefined;
    switch (part) {
      case 'shell':
        mat.opacity = opacities.shell;
        break;
      case 'wire':
        mat.opacity = opacities.wire;
        break;
      case 'ring':
        mat.opacity = opacities.ring;
        break;
      case 'meridian':
        mat.opacity = opacities.meridian;
        break;
      case 'halo':
        child.visible = emphasis === 'hover' || emphasis === 'selected';
        mat.opacity = emphasis === 'selected' ? 0.55 : 0.4;
        if (emphasis === 'selected') {
          mat.color.set('#c0caf5');
        }
        break;
      default:
        break;
    }
    mat.needsUpdate = true;
  });

  const scale = emphasis === 'selected' ? 1.035 : 1;
  group.scale.set(scale, scale, scale);
}

export function paintNestHull2d(
  node: {
    x?: number;
    y?: number;
    __kind?: string;
    __hullKind?: string;
    __radius?: number;
    __color?: string;
    __label?: string;
    __emphasis?: NestEmphasis;
  },
  ctx: CanvasRenderingContext2D,
  globalScale: number,
): boolean {
  if (node.__kind !== 'nest-hull') return false;
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const r = Math.max(8, node.__radius ?? 40);
  const color = node.__color ?? '#7aa2f7';
  const isCompany = node.__hullKind === 'company';
  const isTopic = node.__hullKind === 'topic';
  const isFolder = node.__hullKind === 'folder';
  const isArticle = node.__hullKind === 'article';
  const emphasis: NestEmphasis = node.__emphasis ?? 'idle';

  let fillA = isCompany ? 0.035 : isArticle ? 0.06 : isTopic ? 0.08 : isFolder ? 0.04 : 0.06;
  let strokeA = isCompany ? 0.3 : isArticle ? 0.5 : isTopic ? 0.7 : isFolder ? 0.38 : 0.55;
  if (emphasis === 'dim') {
    fillA *= isCompany ? 0.85 : 0.35;
    strokeA *= isCompany ? 0.75 : 0.3;
  } else if (emphasis === 'hover') {
    fillA *= 2.2;
    strokeA = Math.min(0.95, strokeA * 1.7);
  } else if (emphasis === 'selected') {
    fillA *= 2.8;
    strokeA = Math.min(1, strokeA * 2);
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = fillA;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = strokeA;
  ctx.lineWidth =
    ((isCompany ? 1.1 : isArticle || isFolder ? 1.2 : 1.7) *
      (emphasis === 'selected' ? 1.5 : emphasis === 'hover' ? 1.25 : 1)) /
    Math.max(globalScale * 0.5, 0.35);
  if (isTopic || isArticle) {
    ctx.setLineDash([8 / globalScale, 5 / globalScale]);
  } else if (isFolder) {
    ctx.setLineDash([5 / globalScale, 4 / globalScale]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (emphasis === 'hover' || emphasis === 'selected') {
    ctx.beginPath();
    ctx.arc(x, y, r * (emphasis === 'selected' ? 1.08 : 1.045), 0, Math.PI * 2);
    ctx.strokeStyle = emphasis === 'selected' ? '#c0caf5' : color;
    ctx.globalAlpha = emphasis === 'selected' ? 0.55 : 0.4;
    ctx.lineWidth = 2 / Math.max(globalScale * 0.4, 0.4);
    ctx.stroke();
  }

  const label = node.__label ?? '';
  const labelZoom = isFolder ? 1.15 : isArticle ? 0.9 : 0.55;
  const forceLabel = emphasis === 'hover' || emphasis === 'selected';
  if (label && (forceLabel || globalScale > labelZoom)) {
    const fontSize = Math.max(9 / globalScale, 2.2);
    ctx.font = `${forceLabel ? 600 : 500} ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = forceLabel ? 0.95 : isFolder ? 0.7 : 0.85;
    ctx.fillStyle = forceLabel && emphasis === 'selected' ? '#e8ecf4' : color;
    ctx.fillText(label, x, y - r - 6 / globalScale);
  }
  ctx.restore();
  return true;
}
