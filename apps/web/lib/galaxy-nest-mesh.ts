/**
 * Three.js meshes for galaxy organizational hull spheres (client-only).
 */

import * as THREE from 'three';
import type { NestHullNode } from './galaxy-nest-hulls';

export function createNestHullObject3d(node: NestHullNode): THREE.Group {
  const group = new THREE.Group();
  const radius = Math.max(8, node.__radius);
  const color = new THREE.Color(node.__color);
  const isCompany = node.__hullKind === 'company';
  const isTopic = node.__hullKind === 'topic';
  const isFolder = node.__hullKind === 'folder';
  const isArticle = node.__hullKind === 'article';

  const latSeg = isCompany ? 36 : isTopic || isArticle ? 24 : isFolder ? 20 : 22;
  const lonSeg = isCompany ? 24 : isTopic || isArticle ? 16 : isFolder ? 14 : 14;

  // Folder/article shells stay quieter so concept nodes read first; library/topic stronger.
  const shellOpacity = isCompany
    ? 0.025
    : isArticle
      ? 0.055
      : isTopic
        ? 0.08
        : isFolder
          ? 0.04
          : 0.055;
  const wireOpacity = isCompany
    ? 0.16
    : isArticle
      ? 0.38
      : isTopic
        ? 0.55
        : isFolder
          ? 0.28
          : 0.42;
  const ringOpacity = isCompany
    ? 0.12
    : isArticle
      ? 0.28
      : isTopic
        ? 0.4
        : isFolder
          ? 0.22
          : 0.34;

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius, latSeg, lonSeg),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: shellOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  group.add(shell);

  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(radius, latSeg, lonSeg),
    new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: wireOpacity,
      depthWrite: false,
    }),
  );
  group.add(wire);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.985, radius * 1.015, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: ringOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Meridian ring for 3D readability (skip on dense folder shells)
  if (!isFolder) {
    const meridian = ring.clone();
    meridian.rotation.x = 0;
    meridian.rotation.y = Math.PI / 2;
    meridian.material = (ring.material as THREE.MeshBasicMaterial).clone();
    (meridian.material as THREE.MeshBasicMaterial).opacity = isCompany ? 0.1 : isArticle ? 0.14 : 0.22;
    group.add(meridian);
  }

  return group;
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

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = isCompany ? 0.035 : isArticle ? 0.06 : isTopic ? 0.08 : isFolder ? 0.04 : 0.06;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = isCompany ? 0.3 : isArticle ? 0.5 : isTopic ? 0.7 : isFolder ? 0.38 : 0.55;
  ctx.lineWidth = (isCompany ? 1.1 : isArticle || isFolder ? 1.2 : 1.7) / Math.max(globalScale * 0.5, 0.35);
  if (isTopic || isArticle) {
    ctx.setLineDash([8 / globalScale, 5 / globalScale]);
  } else if (isFolder) {
    ctx.setLineDash([5 / globalScale, 4 / globalScale]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const label = node.__label ?? '';
  // Folder labels only when zoomed in; library/topic sooner.
  const labelZoom = isFolder ? 1.15 : isArticle ? 0.9 : 0.55;
  if (label && globalScale > labelZoom) {
    const fontSize = Math.max(9 / globalScale, 2.2);
    ctx.font = `500 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = isFolder ? 0.7 : 0.85;
    ctx.fillStyle = color;
    ctx.fillText(label, x, y - r - 6 / globalScale);
  }
  ctx.restore();
  return true;
}
