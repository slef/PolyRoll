import { Vector3, Quaternion, Matrix4, Color } from 'three';
import { PolyhedronDefinition, FaceData } from './PolyhedronDefinition';
import { VERTEX_COLORS } from '../constants';

// Icosahedron-specific constants (from constants.ts)
const EDGE_LENGTH = 1.0;
const phi = (1 + Math.sqrt(5)) / 2;
// Raw vertices (0, +-1, +-phi) have edge length 2. Scale by 0.5 for unit edge length.
const icoScale = 0.5;

const ICO_VERTICES_RAW = [
  [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
  [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
  [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
].map(v => new Vector3(v[0], v[1], v[2]).multiplyScalar(icoScale));

const ICO_INDICES = [
  0, 11, 5,  0, 5, 1,  0, 1, 7,  0, 7, 10,  0, 10, 11,
  1, 5, 9,   5, 11, 4, 11, 10, 2, 10, 7, 6,  7, 1, 8,
  3, 9, 4,   3, 4, 2,  3, 2, 6,  3, 6, 8,   3, 8, 9,
  4, 9, 5,   2, 4, 11, 6, 2, 10, 8, 6, 7,   9, 8, 1
];

// For edge length 'a', inradius r = (a * phi^2) / (2 * sqrt(3))
const ICO_INRADIUS = (phi * phi * EDGE_LENGTH) / (2 * Math.sqrt(3));
const ICO_DIHEDRAL_ANGLE = Math.acos(-Math.sqrt(5) / 3);
const ICO_ROLL_ANGLE = Math.PI - ICO_DIHEDRAL_ANGLE;

const ICO_FACE_CENTERS: Vector3[] = [];
for (let i = 0; i < ICO_INDICES.length; i += 3) {
  const a = ICO_VERTICES_RAW[ICO_INDICES[i]];
  const b = ICO_VERTICES_RAW[ICO_INDICES[i+1]];
  const c = ICO_VERTICES_RAW[ICO_INDICES[i+2]];
  const center = new Vector3().addVectors(a, b).add(c).divideScalar(3);
  ICO_FACE_CENTERS.push(center);
}

const ICO_FACE_COLORS_INDICES = [
  0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3
];

const ICO_VERTEX_COLORS_INDICES = [
  0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5
];

const ICO_FACE_PALETTE = ['#c084fc', '#fef08a', '#f472b6', '#bae6fd'];

// Initial orientation calculation (exact copy from constants.ts lines 108-120)
const icoFace0Normal = ICO_FACE_CENTERS[0].clone().normalize();
const icoFace0Vertex0 = ICO_VERTICES_RAW[ICO_INDICES[0]].clone();
const icoFace0Center = ICO_FACE_CENTERS[0];
const icoVToVert = new Vector3().subVectors(icoFace0Vertex0, icoFace0Center).normalize();
const sourceDown = icoFace0Normal;
const sourceBack = icoVToVert;
const sourceRight = new Vector3().crossVectors(sourceDown, sourceBack).normalize();
const mSource = new Matrix4().makeBasis(sourceRight, sourceDown, sourceBack);
const targetDown = new Vector3(0, -1, 0);
const targetBack = new Vector3(0, 0, -1);
const targetRight = new Vector3().crossVectors(targetDown, targetBack).normalize();
const mTarget = new Matrix4().makeBasis(targetRight, targetDown, targetBack);
const INITIAL_QUATERNION_ICO = new Quaternion().setFromRotationMatrix(mTarget.multiply(mSource.transpose()));
const INITIAL_POSITION_ICO = new Vector3(0, ICO_INRADIUS, 0);

export const icosahedron: PolyhedronDefinition = {
  id: 'icosahedron',
  name: 'Icosahedron',
  faceCount: 20,
  vertexCount: 12,

  // Geometry
  vertices: ICO_VERTICES_RAW,
  faceIndices: (() => {
    const indices: number[][] = [];
    for (let i = 0; i < ICO_INDICES.length; i += 3) {
      indices.push([ICO_INDICES[i], ICO_INDICES[i+1], ICO_INDICES[i+2]]);
    }
    return indices;
  })(),
  faceCenters: ICO_FACE_CENTERS,

  // Metrics
  inradius: ICO_INRADIUS,
  dihedralAngle: ICO_DIHEDRAL_ANGLE,
  rollAngle: ICO_ROLL_ANGLE,
  edgeLength: EDGE_LENGTH,

  // Visual styling
  facePalette: ICO_FACE_PALETTE,
  faceColorIndices: ICO_FACE_COLORS_INDICES,
  vertexColorIndices: ICO_VERTEX_COLORS_INDICES,
  faceLabelSize: 0.2,
  vertexSphereRadius: 0.07,

  // Initial state
  initialPosition: INITIAL_POSITION_ICO,
  initialQuaternion: INITIAL_QUATERNION_ICO,

  // Lattice configuration
  latticeType: 'triangular',
  movementSectors: 6,
  sectorAngle: Math.PI / 3,

  // Methods - Core geometry
  getVertices() {
    return this.vertices;
  },

  // getFaces implementation (from turtle.ts lines 54-64)
  getFaces(): FaceData[] {
    const faces: FaceData[] = [];
    for (let i = 0; i < ICO_INDICES.length; i += 3) {
      const v1 = ICO_VERTICES_RAW[ICO_INDICES[i]];
      const v2 = ICO_VERTICES_RAW[ICO_INDICES[i+1]];
      const v3 = ICO_VERTICES_RAW[ICO_INDICES[i+2]];
      const center = new Vector3().add(v1).add(v2).add(v3).divideScalar(3);
      const normal = center.clone().normalize();
      faces.push({ index: i / 3 + 1, center, normal, vertices: [v1, v2, v3] });
    }
    return faces;
  },

  getBottomVertexCount() {
    return 3;
  },

  // Methods - Visual rendering
  // Icosahedron vertex coloring: uses ICO_VERTEX_COLORS_INDICES (Simulation.tsx line 316)
  getVertexColor(index: number): string {
    return VERTEX_COLORS[ICO_VERTEX_COLORS_INDICES[index]];
  },

  // Icosahedron face coloring: 4-color pattern via ICO_FACE_COLORS_INDICES (Simulation.tsx line 298)
  getFaceColor(faceIndex: number): string {
    const palette = ICO_FACE_PALETTE.map(c => new Color(c));
    const color = palette[ICO_FACE_COLORS_INDICES[faceIndex]];
    return `#${color.getHexString()}`;
  },

  // Methods - Floor lattice
  // Icosahedron uses uniform gray color on triangular lattice (Floor.tsx lines 79-80)
  getLatticeVertexColor(_i: number, _j: number): string {
    return '#cbd5e1'; // uniform gray
  },

  // Methods - Orientation and movement
  // Icosahedron uses 60° sectors (6 directions) same as octahedron (App.tsx lines 44-48)
  getOrientationLabel(delta: number): string {
    const sector = Math.round(delta / 60) % 6;
    let label = 'X';
    if (sector === 0 || sector === 3) label = 'X';
    else if (sector === 2 || sector === 5) label = 'Y';
    else if (sector === 4 || sector === 1) label = 'Z';
    return label;
  },

  // getMoveData for hexagonal/triangular lattice (same as octahedron)
  getMoveData(angle: number): { label: string; delta: { u: number; v: number } } {
    let a = angle % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;

    const shifted = a - Math.PI / 6;
    let s = (shifted < 0) ? shifted + 2 * Math.PI : shifted;
    const sector = Math.round(s / (Math.PI / 3)) % 6;

    switch (sector) {
      case 0: return { label: '-Z', delta: { u: 1, v: 1 } };
      case 1: return { label: '+Y', delta: { u: 0, v: 1 } };
      case 2: return { label: '-X', delta: { u: -1, v: 0 } };
      case 3: return { label: '+Z', delta: { u: -1, v: -1 } };
      case 4: return { label: '-Y', delta: { u: 0, v: -1 } };
      case 5: return { label: '+X', delta: { u: 1, v: 0 } };
      default: return { label: '?', delta: { u: 0, v: 0 } };
    }
  },
};
