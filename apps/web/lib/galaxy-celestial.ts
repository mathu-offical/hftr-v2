/**
 * Celestial-body visuals for galaxy granular nodes (D-139).
 * Concepts / tags / article hubs render as distinct 3D object families so the
 * hierarchy reads as stars, planets, rocks, moons — not uniform spheres.
 */

import * as THREE from 'three';

export type CelestialBodyKind = 'star' | 'planet' | 'rock' | 'ember' | 'moon' | 'comet';

export type CelestialConceptInput = {
  sourceClass?: string | null | undefined;
  tags?: readonly string[] | undefined;
  referenceCount?: number | null | undefined;
  queryCount?: number | null | undefined;
};

/** Map research entities onto celestial metaphors. */
export function celestialKindForConcept(input: CelestialConceptInput): CelestialBodyKind {
  const tags = input.tags ?? [];
  if (tags.includes('hftr:article')) return 'star';
  switch (input.sourceClass) {
    case 'catalog_seed':
      return 'rock';
    case 'deterministic_placeholder':
      return 'ember';
    case 'model_generated':
    case 'operator':
      return (input.referenceCount ?? 0) >= 8 ? 'comet' : 'planet';
    default:
      return 'planet';
  }
}

export function celestialKindForTagSatellite(): CelestialBodyKind {
  return 'moon';
}

export function celestialKindForArticleHull(): CelestialBodyKind {
  return 'star';
}

const KIND_SCALE: Record<CelestialBodyKind, number> = {
  star: 1.55,
  planet: 1,
  rock: 0.72,
  ember: 0.55,
  moon: 0.42,
  comet: 0.85,
};

export function celestialScaleForKind(kind: CelestialBodyKind, val = 1): number {
  return Math.cbrt(Math.max(0.6, val)) * 4.2 * KIND_SCALE[kind];
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}

/** Build a lightweight Three.js group for a celestial body. */
export function createCelestialObject3d(
  kind: CelestialBodyKind,
  colorHex: string,
  val = 1,
): THREE.Group {
  const group = new THREE.Group();
  group.userData.celestialKind = kind;
  group.userData.disposeCelestial = () => disposeGroup(group);

  const color = new THREE.Color(colorHex);
  const scale = celestialScaleForKind(kind, val);

  switch (kind) {
    case 'star': {
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(scale * 0.55, 1),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      );
      group.add(core);
      const corona = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 1.15, 16, 12),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      group.add(corona);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(scale * 1.35, scale * 1.55, 48),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2.4;
      group.add(ring);
      break;
    }
    case 'planet': {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 0.7, 14, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }),
      );
      group.add(body);
      const belt = new THREE.Mesh(
        new THREE.RingGeometry(scale * 0.95, scale * 1.2, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      belt.rotation.x = Math.PI / 2.15;
      group.add(belt);
      break;
    }
    case 'rock': {
      const body = new THREE.Mesh(
        new THREE.DodecahedronGeometry(scale * 0.65, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 }),
      );
      group.add(body);
      break;
    }
    case 'ember': {
      const body = new THREE.Mesh(
        new THREE.OctahedronGeometry(scale * 0.5, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
      );
      group.add(body);
      break;
    }
    case 'moon': {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 0.55, 10, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
      );
      group.add(body);
      break;
    }
    case 'comet': {
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 0.45, 10, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      group.add(head);
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(scale * 0.28, scale * 1.4, 8),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -scale * 0.85;
      group.add(tail);
      break;
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }

  return group;
}

/** 2D canvas fallback glyphs for celestial kinds. */
export function paintCelestial2d(
  kind: CelestialBodyKind,
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  radius: number,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  switch (kind) {
    case 'star': {
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'planet': {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.55, radius * 0.45, 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'rock': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = radius * (i % 2 === 0 ? 1 : 0.65);
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'ember': {
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius * 0.7, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius * 0.7, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'moon': {
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.75, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'comet': {
      ctx.beginPath();
      ctx.arc(x + radius * 0.35, y, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(x + radius * 0.1, y);
      ctx.lineTo(x - radius * 1.6, y - radius * 0.35);
      ctx.lineTo(x - radius * 1.6, y + radius * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
