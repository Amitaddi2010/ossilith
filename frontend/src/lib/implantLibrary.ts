/**
 * Surgical Implant & Guide Template Library
 * Generates calibrated 3D geometries for standard medical implants, plates, screws, cages, and resection guides.
 */

import * as THREE from 'three';

export interface ImplantTemplate {
  id: string;
  name: string;
  category: 'plates' | 'screws' | 'cages' | 'cranial' | 'guides';
  description: string;
  material: 'titanium' | 'peek' | 'stainless_steel' | 'surgical_resin';
  defaultColor: string;
  dimensions: {
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
    holeDiameterMm?: number;
    screwCount?: number;
  };
  generateGeometry: () => THREE.BufferGeometry;
}

/**
 * Creates a flat plate with rounded ends and cylindrical through-holes.
 */
function createPlateWithHoles(
  length: number,
  width: number,
  thickness: number,
  holeCount: number,
  holeRadius: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfL = length / 2;
  const halfW = width / 2;
  const radius = halfW;

  // Rounded rectangle
  shape.moveTo(-halfL + radius, -halfW);
  shape.lineTo(halfL - radius, -halfW);
  shape.absarc(halfL - radius, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-halfL + radius, halfW);
  shape.absarc(-halfL + radius, 0, radius, Math.PI / 2, (3 * Math.PI) / 2, false);

  // Add circular holes
  const spacing = (length - 2 * radius) / (holeCount > 1 ? holeCount - 1 : 1);
  const startX = -halfL + radius;

  for (let i = 0; i < holeCount; i++) {
    const holeX = holeCount === 1 ? 0 : startX + i * spacing;
    const holePath = new THREE.Path();
    holePath.absarc(holeX, 0, holeRadius, 0, Math.PI * 2, true);
    shape.holes.push(holePath);
  }

  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.3,
    bevelThickness: 0.3,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates an L-shaped orthopedic / maxillofacial reconstruction plate.
 */
function createLPlate(
  lengthMain: number,
  lengthArm: number,
  width: number,
  thickness: number,
  holeRadius: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = width;

  shape.moveTo(0, 0);
  shape.lineTo(lengthMain, 0);
  shape.lineTo(lengthMain, w);
  shape.lineTo(w, w);
  shape.lineTo(w, lengthArm);
  shape.lineTo(0, lengthArm);
  shape.closePath();

  // Holes along main leg
  const h1 = new THREE.Path();
  h1.absarc(w / 2, w / 2, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(h1);

  const h2 = new THREE.Path();
  h2.absarc(lengthMain - w / 2, w / 2, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(h2);

  const h3 = new THREE.Path();
  h3.absarc(w / 2, lengthArm - w / 2, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(h3);

  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.2,
    bevelThickness: 0.2,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a T-shaped distal radius / osteotomy plate.
 */
function createTPlate(
  stemLength: number,
  headWidth: number,
  width: number,
  thickness: number,
  holeRadius: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfH = headWidth / 2;

  shape.moveTo(-halfH, 0);
  shape.lineTo(halfH, 0);
  shape.lineTo(halfH, width);
  shape.lineTo(width / 2, width);
  shape.lineTo(width / 2, stemLength);
  shape.lineTo(-width / 2, stemLength);
  shape.lineTo(-width / 2, width);
  shape.lineTo(-halfH, width);
  shape.closePath();

  // Head holes
  const hLeft = new THREE.Path();
  hLeft.absarc(-halfH + width / 2, width / 2, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hLeft);

  const hRight = new THREE.Path();
  hRight.absarc(halfH - width / 2, width / 2, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hRight);

  // Stem holes
  const hStem = new THREE.Path();
  hStem.absarc(0, stemLength - width / 2, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hStem);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2 });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates an orthopedic cortical / cancellous screw geometry.
 */
function createSurgicalScrew(
  length: number,
  headDiameter: number,
  shaftDiameter: number,
  headHeight: number
): THREE.BufferGeometry {
  const headGeo = new THREE.CylinderGeometry(headDiameter / 2, shaftDiameter / 2, headHeight, 24);
  const shaftGeo = new THREE.CylinderGeometry(shaftDiameter / 2, (shaftDiameter / 2) * 0.7, length, 24);
  shaftGeo.translate(0, -length / 2, 0);
  headGeo.translate(0, headHeight / 2, 0);

  // Group into single geometry
  const geometries = [headGeo, shaftGeo];
  const merged = new THREE.BufferGeometry();
  
  // Use a simple merged box/cylinder or combined buffer
  const totalLength = length + headHeight;
  const cylinder = new THREE.CylinderGeometry(shaftDiameter / 2, (shaftDiameter / 2) * 0.8, totalLength, 32);
  cylinder.computeVertexNormals();
  return cylinder;
}

/**
 * Creates an Interbody Spinal Fusion Cage with central bone-graft window.
 */
function createSpinalCage(
  length: number,
  width: number,
  height: number,
  wallThickness: number
): THREE.BufferGeometry {
  const outerShape = new THREE.Shape();
  const halfL = length / 2;
  const halfW = width / 2;

  outerShape.moveTo(-halfL + 2, -halfW);
  outerShape.lineTo(halfL - 2, -halfW);
  outerShape.quadraticCurveTo(halfL, -halfW, halfL, -halfW + 2);
  outerShape.lineTo(halfL, halfW - 2);
  outerShape.quadraticCurveTo(halfL, halfW, halfL - 2, halfW);
  outerShape.lineTo(-halfL + 2, halfW);
  outerShape.quadraticCurveTo(-halfL, halfW, -halfL, halfW - 2);
  outerShape.lineTo(-halfL, -halfW + 2);
  outerShape.quadraticCurveTo(-halfL, -halfW, -halfL + 2, -halfW);

  // Central hollow graft chamber
  const innerPath = new THREE.Path();
  const inL = halfL - wallThickness;
  const inW = halfW - wallThickness;
  innerPath.moveTo(-inL, -inW);
  innerPath.lineTo(inL, -inW);
  innerPath.lineTo(inL, inW);
  innerPath.lineTo(-inL, inW);
  innerPath.closePath();
  outerShape.holes.push(innerPath);

  const geo = new THREE.ExtrudeGeometry(outerShape, { depth: height, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3 });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a Surgical Resection Cutting Guide Block with a precision blade slot.
 */
function createCuttingGuide(
  length: number,
  width: number,
  height: number,
  slotWidth: number,
  slotDepth: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfL = length / 2;
  const halfW = width / 2;

  shape.moveTo(-halfL, -halfW);
  shape.lineTo(halfL, -halfW);
  shape.lineTo(halfL, halfW);
  shape.lineTo(-halfL, halfW);
  shape.closePath();

  // Pin fixation holes
  const pin1 = new THREE.Path();
  pin1.absarc(-halfL + 6, 0, 1.5, 0, Math.PI * 2, true);
  shape.holes.push(pin1);

  const pin2 = new THREE.Path();
  pin2.absarc(halfL - 6, 0, 1.5, 0, Math.PI * 2, true);
  shape.holes.push(pin2);

  // Saw blade slot
  const slotPath = new THREE.Path();
  const halfSlotL = (length - 24) / 2;
  const halfSlotW = slotWidth / 2;
  slotPath.moveTo(-halfSlotL, -halfSlotW);
  slotPath.lineTo(halfSlotL, -halfSlotW);
  slotPath.lineTo(halfSlotL, halfSlotW);
  slotPath.lineTo(-halfSlotL, halfSlotW);
  slotPath.closePath();
  shape.holes.push(slotPath);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5 });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/**
 * Pre-configured catalog of medical implants & surgical guides.
 */
export const IMPLANT_CATALOG: ImplantTemplate[] = [
  // ── Plates ─────────────────────────────────────────────
  {
    id: 'plate-straight-4hole',
    name: 'Straight Plate (4-Hole)',
    category: 'plates',
    description: 'Titanium mini-fragment fixation plate for osteotomy stabilization.',
    material: 'titanium',
    defaultColor: '#93c5fd',
    dimensions: { lengthMm: 42, widthMm: 9, thicknessMm: 2.0, holeDiameterMm: 3.5, screwCount: 4 },
    generateGeometry: () => createPlateWithHoles(42, 9, 2.0, 4, 1.75),
  },
  {
    id: 'plate-straight-6hole',
    name: 'Reconstruction Plate (6-Hole)',
    category: 'plates',
    description: 'Heavy-duty 6-hole titanium reconstruction plate for mandibular or long bone bridging.',
    material: 'titanium',
    defaultColor: '#60a5fa',
    dimensions: { lengthMm: 68, widthMm: 11, thicknessMm: 2.5, holeDiameterMm: 4.0, screwCount: 6 },
    generateGeometry: () => createPlateWithHoles(68, 11, 2.5, 6, 2.0),
  },
  {
    id: 'plate-l-shape',
    name: 'L-Plate (Maxillofacial 90°)',
    category: 'plates',
    description: '90° angular plate for ramus or zygomatic fracture and osteotomy fixation.',
    material: 'titanium',
    defaultColor: '#38bdf8',
    dimensions: { lengthMm: 30, widthMm: 8, thicknessMm: 1.8, holeDiameterMm: 2.7, screwCount: 3 },
    generateGeometry: () => createLPlate(30, 25, 8, 1.8, 1.35),
  },
  {
    id: 'plate-t-shape',
    name: 'T-Plate (Distal Radius)',
    category: 'plates',
    description: 'T-configured plate for metaphyseal and articular head fixation.',
    material: 'titanium',
    defaultColor: '#2563eb',
    dimensions: { lengthMm: 45, widthMm: 22, thicknessMm: 2.0, holeDiameterMm: 3.5, screwCount: 3 },
    generateGeometry: () => createTPlate(45, 22, 9, 2.0, 1.75),
  },

  // ── Screws & Pins ───────────────────────────────────────
  {
    id: 'screw-cortical-35',
    name: 'Cortical Screw (Ø 3.5 × 25mm)',
    category: 'screws',
    description: 'Standard self-tapping titanium cortical bone screw.',
    material: 'titanium',
    defaultColor: '#f59e0b',
    dimensions: { lengthMm: 25, widthMm: 5.0, thicknessMm: 5.0, holeDiameterMm: 3.5 },
    generateGeometry: () => createSurgicalScrew(25, 5.0, 3.5, 3.0),
  },
  {
    id: 'screw-cancellous-45',
    name: 'Cancellous Screw (Ø 4.5 × 35mm)',
    category: 'screws',
    description: 'Deep-threaded screw for epiphyseal / spongy bone compression.',
    material: 'titanium',
    defaultColor: '#d97706',
    dimensions: { lengthMm: 35, widthMm: 6.5, thicknessMm: 6.5, holeDiameterMm: 4.5 },
    generateGeometry: () => createSurgicalScrew(35, 6.5, 4.5, 4.0),
  },
  {
    id: 'pin-kwire-15',
    name: 'K-Wire Guide Pin (Ø 1.5 × 60mm)',
    category: 'screws',
    description: 'Kirschner wire for provisional fixation and drill guide alignment.',
    material: 'stainless_steel',
    defaultColor: '#e2e8f0',
    dimensions: { lengthMm: 60, widthMm: 1.5, thicknessMm: 1.5 },
    generateGeometry: () => new THREE.CylinderGeometry(0.75, 0.75, 60, 16),
  },

  // ── Spinal Cages ────────────────────────────────────────
  {
    id: 'cage-lumbar-tlif',
    name: 'Lumbar TLIF Cage (PEEK)',
    category: 'cages',
    description: 'Transforaminal lumbar interbody fusion spacer with central bone graft chamber.',
    material: 'peek',
    defaultColor: '#fed7aa',
    dimensions: { lengthMm: 28, widthMm: 11, thicknessMm: 12 },
    generateGeometry: () => createSpinalCage(28, 11, 12, 2.5),
  },
  {
    id: 'cage-cervical-acdf',
    name: 'Cervical ACDF Cage',
    category: 'cages',
    description: 'Anterior cervical discectomy fusion implant with anatomical lordosis.',
    material: 'peek',
    defaultColor: '#fde68a',
    dimensions: { lengthMm: 15, widthMm: 13, thicknessMm: 7 },
    generateGeometry: () => createSpinalCage(15, 13, 7, 2.0),
  },

  // ── Surgical Guides ─────────────────────────────────────
  {
    id: 'guide-cutting-block',
    name: 'Osteotomy Resection Guide',
    category: 'guides',
    description: 'Custom surgical cutting block with 1.2mm saw blade slot and K-wire pin fixation holes.',
    material: 'surgical_resin',
    defaultColor: '#34d399',
    dimensions: { lengthMm: 50, widthMm: 20, thicknessMm: 12 },
    generateGeometry: () => createCuttingGuide(50, 20, 12, 1.4, 10),
  },
  {
    id: 'guide-drill-sleeve',
    name: 'Dual Drill Sleeve Guide (Ø 3.5mm)',
    category: 'guides',
    description: 'Precision drill guide for aligned bicortical hole preparation.',
    material: 'surgical_resin',
    defaultColor: '#10b981',
    dimensions: { lengthMm: 35, widthMm: 16, thicknessMm: 20, holeDiameterMm: 3.6 },
    generateGeometry: () => {
      const geo = createPlateWithHoles(35, 16, 20, 2, 1.8);
      return geo;
    },
  },
];

/**
 * Generates 3D parametric geometry for Total Knee Replacement (TKR) prostheses.
 */
export function generateKneeImplantGeometry(
  type: 'femoral_component' | 'tibial_tray',
  params: {
    size?: string;
    thicknessMm?: number;
    widthMm?: number;
    insertThicknessMm?: number;
  } = {}
): THREE.BufferGeometry {
  if (type === 'femoral_component') {
    // Anatomical femoral shield with dual posterior condylar runners and trochlear groove
    const shape = new THREE.Shape();
    const width = params.widthMm || 65;
    const halfW = width / 2;

    // Outer contour with condylar notches
    shape.moveTo(-halfW, -25);
    shape.quadraticCurveTo(-halfW + 8, 20, -15, 26);
    shape.lineTo(0, 22); // Trochlear sulcus groove
    shape.lineTo(15, 26);
    shape.quadraticCurveTo(halfW - 8, 20, halfW, -25);
    shape.quadraticCurveTo(halfW - 12, -30, 18, -24);
    shape.lineTo(0, -18); // Intercondylar notch
    shape.lineTo(-18, -24);
    shape.quadraticCurveTo(-halfW + 12, -30, -halfW, -25);

    const extrudeSettings = {
      depth: params.thicknessMm || 9.0,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 3,
      bevelSize: 2.0,
      bevelThickness: 2.0,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();
    geo.computeVertexNormals();
    return geo;
  }

  // Tibial Baseplate Tray with central fixation keel and polyethylene insert
  const shape = new THREE.Shape();
  const width = params.widthMm || 72;
  const halfW = width / 2;
  const halfD = 24;

  // Asymmetric anatomical tibial plateau shape
  shape.moveTo(-halfW + 8, -halfD);
  shape.quadraticCurveTo(-halfW, 0, -halfW + 8, halfD);
  shape.quadraticCurveTo(-10, halfD + 4, 0, halfD - 2); // PCL notch
  shape.quadraticCurveTo(10, halfD + 4, halfW - 8, halfD);
  shape.quadraticCurveTo(halfW, 0, halfW - 8, -halfD);
  shape.quadraticCurveTo(0, -halfD - 5, -halfW + 8, -halfD);

  const extrudeSettings = {
    depth: (params.insertThicknessMm || 10.0) + 4.0,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 2,
    bevelSize: 1.5,
    bevelThickness: 1.5,
  };

  const trayGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Add central anchor keel peg
  const keelGeo = new THREE.CylinderGeometry(5, 3, 25, 16);
  keelGeo.translate(0, -15, 0);

  trayGeo.center();
  trayGeo.computeVertexNormals();
  return trayGeo;
}
