import { Vector3, Quaternion } from 'three';
import { PolyhedronDefinition, FaceData } from './PolyhedronDefinition';
import { VERTEX_COLORS, GRID_COLOR_1, GRID_COLOR_2, EDGE_LENGTH } from '../constants';

// Shared constants
const TRIANGLE_HEIGHT = EDGE_LENGTH * Math.sqrt(3) / 2;
const TRIANGLE_INRADIUS = TRIANGLE_HEIGHT / 3;
const SQUARE_INRADIUS = EDGE_LENGTH / 2;
const HEX_INRADIUS = EDGE_LENGTH * Math.sqrt(3) / 2;
const HEX_CIRCUMRADIUS = EDGE_LENGTH;

// Shared face centers (all doubly covered shapes have 2 faces)
// For degenerate polyhedra, we need faceCenters to work with the standard label positioning:
// pos = faceCenters[i].normalize() * inradius * 1.01
// quaternion = align Z-axis with faceCenters[i].normalize()
//
// For a thin planar shape, both faces share the same geometric center but have opposite normals.
// We use the face normals as the faceCenter directions so labels appear on their respective sides.
const DC_FACE_CENTERS = [
  new Vector3(0, -1, 0),  // Face 1: normal points down, label below
  new Vector3(0, 1, 0)    // Face 2: normal points up, label above
];

// Generic factory function
interface KGonConfig {
  k: number;
  id: string;
  name: string;
  latticeType: 'triangular' | 'square' | 'hexagonal';
  vertices: Vector3[];
  inradius: number;
  facePalette: string[];
  vertexPalette: string[];
  getVertexColorIndex: (index: number) => number;
  getFaceColorIndex: (faceIndex: number) => number;
  getLatticeVertexColorIndex: (i: number, j: number) => number;
  getMoveDataImpl: (angle: number) => { label: string; delta: { u: number; v: number } };
  getOrientationLabelImpl?: (delta: number) => string;
  movementSectors: number;
  sectorAngle: number;
}

function createDoublyCoveredKGon(config: KGonConfig): PolyhedronDefinition {
  const {
    k, id, name, latticeType, vertices, inradius, facePalette, vertexPalette,
    getVertexColorIndex, getFaceColorIndex, getLatticeVertexColorIndex,
    getMoveDataImpl, getOrientationLabelImpl,
    movementSectors,
    sectorAngle
  } = config;

  return {
    id: id as any,
    name,
    faceCount: 2,
    vertexCount: k,

    vertices,
    faceCenters: DC_FACE_CENTERS,

    inradius,
    dihedralAngle: 0,  // Degenerate
    rollAngle: Math.PI,  // 180° flip
    edgeLength: EDGE_LENGTH,

    facePalette,
    faceLabelSize: 0.25,
    vertexSphereRadius: 0.08,

    initialPosition: new Vector3(0, inradius, 0),
    initialQuaternion: new Quaternion(),  // Identity

    latticeType,
    movementSectors,
    sectorAngle,

    // Methods
    getVertices() { return this.vertices; },

    getFaces(): FaceData[] {
      // For planar degenerate polyhedra, we have 2 faces at the same location
      // Face 1 (bottom, normal down): vertices in CCW order when viewed from below
      // Face 2 (top, normal up): vertices in CCW order when viewed from above (= reversed)
      // NOTE: We use EXACT vertices (no offset) for physics calculations
      // Visual offset is only applied during rendering in PolyhedronMesh

      // Face 1: exact vertices
      const face1Verts = vertices.map(v => new Vector3(v.x, v.y, v.z));

      // Face 2: reversed vertices
      const face2Verts = [...vertices].reverse().map(v => new Vector3(v.x, v.y, v.z));

      return [
        {
          index: 1,
          center: new Vector3(0, -inradius, 0),
          normal: new Vector3(0, -1, 0),
          vertices: face1Verts
        },
        {
          index: 2,
          center: new Vector3(0, -inradius, 0),
          normal: new Vector3(0, 1, 0),
          vertices: face2Verts
        }
      ];
    },

    getBottomVertexCount() { return k; },

    getVertexColor(index: number): string {
      return vertexPalette[getVertexColorIndex(index)];
    },

    getFaceColor(faceIndex: number): string {
      return facePalette[getFaceColorIndex(faceIndex)];
    },

    getLatticeVertexColor(i: number, j: number): string {
      return vertexPalette[getLatticeVertexColorIndex(i, j)];
    },

    getOrientationLabel(delta: number): string {
      if (getOrientationLabelImpl) return getOrientationLabelImpl(delta);
      return 'X';  // Default
    },

    getMoveData(angle: number) {
      return getMoveDataImpl(angle);
    }
  };
}

// ========================================
// Doubly Covered Triangle (k=3)
// ========================================

// Triangle vertices must align with triangular lattice vertices
// Triangular floor mesh has upward-pointing triangles with:
//   v1 at (0, -2/3*height) - bottom vertex
//   v2 at (+side/2, +1/3*height) - top right
//   v3 at (-side/2, +1/3*height) - top left
// Vertices are at y = -inradius so they touch the ground when shape is at y = inradius
const DC_TRIANGLE_VERTICES = [
  new Vector3(0, -TRIANGLE_INRADIUS, -TRIANGLE_HEIGHT * 2 / 3),           // Bottom (v1)
  new Vector3(EDGE_LENGTH / 2, -TRIANGLE_INRADIUS, TRIANGLE_HEIGHT / 3),   // Top right (v2)
  new Vector3(-EDGE_LENGTH / 2, -TRIANGLE_INRADIUS, TRIANGLE_HEIGHT / 3)   // Top left (v3)
];

const DC_TRIANGLE_FACE_PALETTE = [GRID_COLOR_1, GRID_COLOR_2];  // 2-color faces
const DC_TRIANGLE_VERTEX_PALETTE = [VERTEX_COLORS[0], VERTEX_COLORS[1], VERTEX_COLORS[2]];  // RGB

export const dcTriangle = createDoublyCoveredKGon({
  k: 3,
  id: 'dcTriangle',
  name: 'DC Triangle',
  latticeType: 'triangular',

  vertices: DC_TRIANGLE_VERTICES,
  inradius: TRIANGLE_INRADIUS,

  facePalette: DC_TRIANGLE_FACE_PALETTE,
  vertexPalette: DC_TRIANGLE_VERTEX_PALETTE,

  getVertexColorIndex: (index) => [2, 0, 1][index],  // 0→B, 1→R, 2→G (matches lattice at origin)

  getFaceColorIndex: (faceIndex) => faceIndex - 1,  // Face 1→0, Face 2→1

  getLatticeVertexColorIndex: (i, j) => {
    // Same formula as octahedron: 3-color pattern
    return (((2 + 2 * i + j) % 3) + 3) % 3;
  },

  getMoveDataImpl: (angle) => {
    let a = angle % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;

    // Shift by 30° to align with edge midpoints
    const shifted = a - Math.PI / 6;
    let s = (shifted < 0) ? shifted + 2 * Math.PI : shifted;
    const sector = Math.round(s / (Math.PI / 3)) % 6;

    // Triangular lattice movement (6 directions, same as octahedron)
    switch (sector) {
      case 0: return { label: 'FLIP-0', delta: { u: 1, v: 1 } };
      case 1: return { label: 'FLIP-1', delta: { u: 0, v: 1 } };
      case 2: return { label: 'FLIP-2', delta: { u: -1, v: 0 } };
      case 3: return { label: 'FLIP-3', delta: { u: -1, v: -1 } };
      case 4: return { label: 'FLIP-4', delta: { u: 0, v: -1 } };
      case 5: return { label: 'FLIP-5', delta: { u: 1, v: 0 } };
      default: return { label: 'FLIP', delta: { u: 0, v: 0 } };
    }
  },

  movementSectors: 3,
  sectorAngle: (2 * Math.PI) / 3
});

// ========================================
// Doubly Covered Square (k=4)
// ========================================

// Square vertices must align with square lattice vertices
// Square lattice vertices are at grid points offset by -size/2
// So for a square at (0,0), vertices are at (±size/2, ±size/2)
// Vertices are at y = -inradius so they touch the ground when shape is at y = inradius
const DC_SQUARE_VERTICES = [
  new Vector3(-EDGE_LENGTH / 2, -SQUARE_INRADIUS, -EDGE_LENGTH / 2),
  new Vector3(EDGE_LENGTH / 2, -SQUARE_INRADIUS, -EDGE_LENGTH / 2),
  new Vector3(EDGE_LENGTH / 2, -SQUARE_INRADIUS, EDGE_LENGTH / 2),
  new Vector3(-EDGE_LENGTH / 2, -SQUARE_INRADIUS, EDGE_LENGTH / 2)
];

const DC_SQUARE_FACE_PALETTE = [GRID_COLOR_1, GRID_COLOR_2];  // 2-color faces
const DC_SQUARE_VERTEX_PALETTE = [
  VERTEX_COLORS[0],  // Red
  VERTEX_COLORS[1],  // Green
  VERTEX_COLORS[2],  // Blue
  VERTEX_COLORS[4]   // Yellow
];

export const dcSquare = createDoublyCoveredKGon({
  k: 4,
  id: 'dcSquare',
  name: 'DC Square',
  latticeType: 'square',

  vertices: DC_SQUARE_VERTICES,
  inradius: SQUARE_INRADIUS,

  facePalette: DC_SQUARE_FACE_PALETTE,
  vertexPalette: DC_SQUARE_VERTEX_PALETTE,

  getVertexColorIndex: (index) => [0, 2, 3, 1][index],  // 0→R, 1→B, 2→Y, 3→G (matches lattice at origin)

  getFaceColorIndex: (faceIndex) => faceIndex - 1,  // Face 1→0, Face 2→1

  getLatticeVertexColorIndex: (i, j) => {
    // 4-color pattern: 2*(i mod 2) + (j mod 2)
    return 2 * (((i % 2) + 2) % 2) + (((j % 2) + 2) % 2);
  },

  getMoveDataImpl: (angle) => {
    let a = angle % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;

    const sector = Math.round(a / (Math.PI / 2)) % 4;

    // Square lattice movement (4 directions)
    switch (sector) {
      case 0: return { label: 'FLIP-E', delta: { u: 1, v: 0 } };
      case 1: return { label: 'FLIP-N', delta: { u: 0, v: 1 } };
      case 2: return { label: 'FLIP-W', delta: { u: -1, v: 0 } };
      case 3: return { label: 'FLIP-S', delta: { u: 0, v: -1 } };
      default: return { label: 'FLIP', delta: { u: 0, v: 0 } };
    }
  },

  movementSectors: 4,
  sectorAngle: Math.PI / 2
});

// ========================================
// Doubly Covered Hexagon (k=6)
// ========================================

// Hexagon vertices must align with hexagonal lattice vertices
// Hexagonal lattice vertices are at 30°, 90°, 150°, 210°, 270°, 330° from center
// Vertices are at y = -inradius so they touch the ground when shape is at y = inradius
const DC_HEXAGON_VERTICES = Array.from({ length: 6 }, (_, i) => {
  const angle = Math.PI / 6 + (Math.PI / 3) * i;  // Start at 30°, then 90°, 150°, etc.
  return new Vector3(
    HEX_CIRCUMRADIUS * Math.cos(angle),
    -HEX_INRADIUS,
    HEX_CIRCUMRADIUS * Math.sin(angle)
  );
});

const DC_HEXAGON_FACE_PALETTE = [GRID_COLOR_1, GRID_COLOR_2];  // 2-color faces
const DC_HEXAGON_VERTEX_PALETTE = [
  VERTEX_COLORS[0],  // Red
  VERTEX_COLORS[1]   // Green
];

export const dcHexagon = createDoublyCoveredKGon({
  k: 6,
  id: 'dcHexagon',
  name: 'DC Hexagon',
  latticeType: 'hexagonal',

  vertices: DC_HEXAGON_VERTICES,
  inradius: HEX_INRADIUS,

  facePalette: DC_HEXAGON_FACE_PALETTE,
  vertexPalette: DC_HEXAGON_VERTEX_PALETTE,

  getVertexColorIndex: (index) => index % 2,  // Alternating R-G-R-G-R-G

  getFaceColorIndex: (faceIndex) => faceIndex - 1,  // Face 1→0, Face 2→1

  getLatticeVertexColorIndex: (i, j) => {
    // 2-color pattern: alternate based on hexagon column
    return ((i % 2) + 2) % 2;
  },

  getMoveDataImpl: (angle) => {
    let a = angle % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;

    // Shift by 30° to align with edge midpoints
    const shifted = a - Math.PI / 6;
    let s = (shifted < 0) ? shifted + 2 * Math.PI : shifted;
    const sector = Math.round(s / (Math.PI / 3)) % 6;

    // Hexagonal lattice movement (axial coordinates)
    switch (sector) {
      case 0: return { label: 'FLIP-E', delta: { u: 1, v: 0 } };
      case 1: return { label: 'FLIP-NE', delta: { u: 1, v: -1 } };
      case 2: return { label: 'FLIP-NW', delta: { u: 0, v: -1 } };
      case 3: return { label: 'FLIP-W', delta: { u: -1, v: 0 } };
      case 4: return { label: 'FLIP-SW', delta: { u: -1, v: 1 } };
      case 5: return { label: 'FLIP-SE', delta: { u: 0, v: 1 } };
      default: return { label: 'FLIP', delta: { u: 0, v: 0 } };
    }
  },

  movementSectors: 6,
  sectorAngle: Math.PI / 3
});
