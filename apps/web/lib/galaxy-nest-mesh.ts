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

  const latSeg = isCompany ? 36 : isTopic ? 24 : 22;
  const lonSeg = isCompany ? 24 : isTopic ? 16 : 14;

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius, latSeg, lonSeg),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isCompany ? 0.03 : isTopic ? 0.08 : 0.055,
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
      opacity: isCompany ? 0.2 : isTopic ? 0.55 : 0.42,
      depthWrite: false,
    }),
  );
  group.add(wire);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.985, radius * 1.015, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isCompany ? 0.16 : isTopic ? 0.4 : 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Meridian ring for 3D readability
  const meridian = ring.clone();
  meridian.rotation.x = 0;
  meridian.rotation.y = Math.PI / 2;
  meridian.material = (ring.material as THREE.MeshBasicMaterial).clone();
  (meridian.material as THREE.MeshBasicMaterial).opacity = isCompany ? 0.1 : 0.22;
  group.add(meridian);

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

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = isCompany ? 0.04 : isTopic ? 0.08 : 0.06;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = isCompany ? 0.35 : isTopic ? 0.7 : 0.55;
  ctx.lineWidth = (isCompany ? 1.1 : 1.7) / Math.max(globalScale * 0.5, 0.35);
  if (isTopic) {
    ctx.setLineDash([8 / globalScale, 5 / globalScale]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const label = node.__label ?? '';
  if (label && globalScale > 0.55) {
    const fontSize = Math.max(9 / globalScale, 2.2);
    ctx.font = `500 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.fillText(label, x, y - r - 6 / globalScale);
  }
  ctx.restore();
  return true;
}
