/**
 * Three.js meshes for galaxy organizational hull spheres (client-only).
 * Emphasis: idle / dim / hover / selected — company never drops below idle floor.
 * Kind-differentiated shells + always-on library/folder sprite labels (D-107).
 */

import * as THREE from 'three';
import type { NestHullKind, NestHullNode } from './galaxy-nest-hulls';

export type NestEmphasis = 'idle' | 'dim' | 'hover' | 'selected';

type OpacitySet = { shell: number; wire: number; ring: number; meridian: number };

function baseOpacities(hullKind: NestHullKind): OpacitySet {
  switch (hullKind) {
    case 'company':
      return { shell: 0.02, wire: 0.14, ring: 0.1, meridian: 0.08 };
    case 'library':
      // Higher idle opacity so library nests read as distinct clusters (D-132).
      return { shell: 0.14, wire: 0.72, ring: 0.55, meridian: 0.38 };
    case 'folder':
      // Brighter folder shells — primary visual cluster unit inside large libs (D-132).
      return { shell: 0.11, wire: 0.58, ring: 0.48, meridian: 0.26 };
    case 'article':
      return { shell: 0.035, wire: 0.28, ring: 0.22, meridian: 0.1 };
    case 'topic':
      return { shell: 0.09, wire: 0.6, ring: 0.45, meridian: 0.26 };
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

/** Canvas sprite label above nest — always on for library/folder; hover for article. */
function createNestLabelSprite(
  label: string,
  color: string,
  hullKind: NestHullKind,
  emphasis: NestEmphasis,
): THREE.Sprite | null {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const alwaysOn = hullKind === 'library' || hullKind === 'folder' || hullKind === 'topic';
  if (!alwaysOn && emphasis !== 'hover' && emphasis !== 'selected') return null;
  if (hullKind === 'company' && emphasis === 'idle') return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const fontSize = hullKind === 'library' ? 42 : hullKind === 'folder' ? 34 : 28;
  const padX = 18;
  const padY = 10;
  ctx.font = `${hullKind === 'library' ? 700 : 600} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  const metrics = ctx.measureText(trimmed);
  const w = Math.ceil(metrics.width + padX * 2);
  const h = Math.ceil(fontSize + padY * 2);
  canvas.width = w;
  canvas.height = h;

  ctx.font = `${hullKind === 'library' ? 700 : 600} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.82)';
  ctx.beginPath();
  const r = 8;
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle =
    emphasis === 'selected' ? 'rgba(192, 202, 245, 0.7)' : `${color}99`;
  ctx.lineWidth = hullKind === 'library' ? 2.5 : 1.5;
  ctx.stroke();

  ctx.fillStyle = emphasis === 'selected' ? '#e8ecf4' : color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(trimmed, w / 2, h / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: emphasis === 'dim' ? 0.35 : hullKind === 'library' ? 0.95 : 0.88,
  });
  const sprite = new THREE.Sprite(material);
  const scale = hullKind === 'library' ? 28 : hullKind === 'folder' ? 22 : 18;
  sprite.scale.set((w / h) * scale, scale, 1);
  sprite.userData.nestPart = 'label';
  return sprite;
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
  const isLibrary = hullKind === 'library';
  const isFolder = hullKind === 'folder';
  const isArticle = hullKind === 'article';
  const opacities = scaleOpacities(baseOpacities(hullKind), emphasis, hullKind);

  // Kind-differentiated tessellation: library dense, folder mid, article sparse.
  const latSeg = isCompany ? 28 : isLibrary ? 28 : isTopic ? 24 : isFolder ? 16 : isArticle ? 12 : 20;
  const lonSeg = isCompany ? 18 : isLibrary ? 20 : isTopic ? 16 : isFolder ? 12 : isArticle ? 10 : 14;

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

  // Library: thick dual equator. Folder: single thin. Article: sparse dashed-feel ring.
  const ringInner = isLibrary ? radius * 0.97 : isFolder ? radius * 0.99 : radius * 0.985;
  const ringOuter = isLibrary ? radius * 1.04 : isFolder ? radius * 1.012 : radius * 1.02;
  const ringSegs = isArticle ? 32 : 64;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(ringInner, ringOuter, ringSegs),
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

  if (isLibrary) {
    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.78, radius * 0.8, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: opacities.ring * 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring2.rotation.x = Math.PI / 2;
    ring2.userData.nestPart = 'ringInner';
    group.add(ring2);
  }

  if (!isFolder && !isArticle) {
    const meridian = ring.clone();
    meridian.rotation.x = 0;
    meridian.rotation.y = Math.PI / 2;
    meridian.material = (ring.material as THREE.MeshBasicMaterial).clone();
    (meridian.material as THREE.MeshBasicMaterial).opacity = opacities.meridian;
    meridian.userData.nestPart = 'meridian';
    group.add(meridian);
  }

  if (isFolder) {
    // Octahedron wire cue — folders read as angular clusters inside smooth library shells.
    const octa = new THREE.Mesh(
      new THREE.OctahedronGeometry(radius * 0.92, 0),
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: opacities.wire * 0.55,
        depthWrite: false,
      }),
    );
    octa.userData.nestPart = 'octa';
    group.add(octa);
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

  const labelSprite = createNestLabelSprite(node.__label, node.__color, hullKind, emphasis);
  if (labelSprite) {
    labelSprite.position.set(0, radius + (isLibrary ? 14 : 10), 0);
    group.add(labelSprite);
  }

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
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;

    if (child instanceof THREE.Sprite) {
      const mat = child.material as THREE.SpriteMaterial;
      if (mat) {
        mat.opacity = emphasis === 'dim' ? 0.35 : hullKind === 'library' ? 0.95 : 0.88;
        mat.needsUpdate = true;
      }
      child.visible = emphasis !== 'dim' || hullKind === 'company' || hullKind === 'library';
      return;
    }

    const mat = child.material as THREE.MeshBasicMaterial;
    if (!mat || !('opacity' in mat)) return;
    const part = child.userData.nestPart as string | undefined;
    switch (part) {
      case 'shell':
        mat.opacity = opacities.shell;
        break;
      case 'wire':
      case 'octa':
        mat.opacity = part === 'octa' ? opacities.wire * 0.55 : opacities.wire;
        break;
      case 'ring':
      case 'ringInner':
        mat.opacity = part === 'ringInner' ? opacities.ring * 0.65 : opacities.ring;
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
  const isLibrary = node.__hullKind === 'library';
  const isFolder = node.__hullKind === 'folder';
  const isArticle = node.__hullKind === 'article';
  const emphasis: NestEmphasis = node.__emphasis ?? 'idle';

  let fillA = isCompany ? 0.03 : isLibrary ? 0.08 : isArticle ? 0.05 : isTopic ? 0.09 : isFolder ? 0.05 : 0.06;
  let strokeA = isCompany ? 0.28 : isLibrary ? 0.7 : isArticle ? 0.45 : isTopic ? 0.75 : isFolder ? 0.5 : 0.55;
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
    ((isCompany ? 1.1 : isLibrary ? 2.2 : isArticle || isFolder ? 1.3 : 1.7) *
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

  if (isLibrary) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = strokeA * 0.55;
    ctx.lineWidth = 1.1 / Math.max(globalScale * 0.5, 0.35);
    ctx.stroke();
  }

  if (emphasis === 'hover' || emphasis === 'selected') {
    ctx.beginPath();
    ctx.arc(x, y, r * (emphasis === 'selected' ? 1.08 : 1.045), 0, Math.PI * 2);
    ctx.strokeStyle = emphasis === 'selected' ? '#c0caf5' : color;
    ctx.globalAlpha = emphasis === 'selected' ? 0.55 : 0.4;
    ctx.lineWidth = 2 / Math.max(globalScale * 0.4, 0.4);
    ctx.stroke();
  }

  const label = node.__label ?? '';
  // Library/folder labels prefer earlier zoom; articles only when close or focused.
  const labelZoom = isLibrary ? 0.35 : isFolder ? 0.55 : isArticle ? 1.05 : 0.7;
  const forceLabel =
    emphasis === 'hover' ||
    emphasis === 'selected' ||
    isLibrary ||
    (isFolder && globalScale > 0.4);
  if (label && (forceLabel || globalScale > labelZoom)) {
    const fontSize = Math.max((isLibrary ? 11 : 9) / globalScale, 2.2);
    ctx.font = `${forceLabel || isLibrary ? 600 : 500} ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(label);
    const pad = 3 / globalScale;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(8, 12, 20, 0.85)';
    ctx.fillRect(
      x - (metrics.width + pad * 2) / 2,
      y - r - fontSize - 8 / globalScale,
      metrics.width + pad * 2,
      fontSize + pad * 2,
    );
    ctx.globalAlpha = forceLabel ? 0.95 : isFolder ? 0.78 : 0.9;
    ctx.fillStyle = forceLabel && emphasis === 'selected' ? '#e8ecf4' : color;
    ctx.fillText(label, x, y - r - 6 / globalScale);
  }
  ctx.restore();
  return true;
}
