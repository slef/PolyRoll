import { Vector3, Quaternion, Matrix4, Color } from 'three';
import { PolyhedronDefinition, FaceData } from './PolyhedronDefinition';
import { VERTEX_COLORS } from '../constants';

// Tetrahedron-specific constants
const EDGE_LENGTH = 1.0;

// Regular tetrahedron with edge length 1.0
// Vertices positioned at alternating corners of a cube
// For a tetrahedron with vertices at (±a, ±a, ±a), the edge length is 2a√2
// So for edge length L, we need a = L / (2√2)
const a = EDGE_LENGTH / (2 * Math.sqrt(2));
const TET_VERTICES = [
  new Vector3(a, a, a),      // Vertex 0 (top) - color: red
  new Vector3(-a, -a, a),    // Vertex 1 (bottom) - color: blue  (lattice 0,0)
  new Vector3(-a, a, -a),    // Vertex 2 (bottom) - color: yellow (lattice 0,1)
  new Vector3(a, -a, -a),    // Vertex 3 (bottom) - color: green (lattice 1,0)
];

// Face centers - each face is opposite to one vertex
// Face i is opposite to vertex i and uses color i
const TET_FACE_CENTERS = [
  new Vector3(-1, -1, -1).normalize(), // Face 0, opposite vertex 0
  new Vector3(1, 1, -1).normalize(),   // Face 1, opposite vertex 1
  new Vector3(1, -1, 1).normalize(),   // Face 2, opposite vertex 2
  new Vector3(-1, 1, 1).normalize(),   // Face 3, opposite vertex 3
];

// 4 distinct colors for faces and vertices
// Colors ordered to match lattice: blue, yellow, red, green
const TET_FACE_PALETTE = [
  VERTEX_COLORS[2], // 0: Blue
  VERTEX_COLORS[4], // 1: Yellow
  VERTEX_COLORS[0], // 2: Red
  VERTEX_COLORS[1], // 3: Green
];

// Vertex to color mapping (rotated: blue→red, red→green, green→yellow, yellow→blue)
const VERTEX_COLORS_MAP = [
  VERTEX_COLORS[1], // Vertex 0: Green (was Red)
  VERTEX_COLORS[0], // Vertex 1: Red (was Blue)
  VERTEX_COLORS[2], // Vertex 2: Blue (was Yellow)
  VERTEX_COLORS[4], // Vertex 3: Yellow (was Green)
];

// Geometry calculations
const TET_CIRCUMRADIUS = a * Math.sqrt(3); // Distance from center to vertex = a√3
const TET_INRADIUS = a * Math.sqrt(3) / 3; // Distance from center to face = a√3/3 = a/√3
const TET_DIHEDRAL_ANGLE = Math.acos(1 / 3); // ~70.53 degrees
const TET_ROLL_ANGLE = Math.PI - TET_DIHEDRAL_ANGLE;

// Initial orientation: Face 0 (opposite vertex 0) touching ground
const wDown = new Vector3(0, -1, 0);
const wRight = new Vector3(1, 0, 0);
const wForward = new Vector3(0, 0, 1);
const mWorld = new Matrix4().makeBasis(wRight, wDown, wForward);

const tetDown = TET_FACE_CENTERS[0].clone().normalize();
const tetRight = new Vector3(1, 0, -1).normalize();
const tetForward = new Vector3().crossVectors(tetDown, tetRight).normalize();
const mTetInv = new Matrix4().makeBasis(tetRight, tetDown, tetForward).transpose();
const INITIAL_QUATERNION_TET = new Quaternion().setFromRotationMatrix(mWorld.clone().multiply(mTetInv));
const INITIAL_POSITION_TET = new Vector3(0, TET_INRADIUS, 0);

export const tetrahedron: PolyhedronDefinition = {
  id: 'tetrahedron',
  name: 'Tetrahedron',
  faceCount: 4,
  vertexCount: 4,

  // Geometry
  vertices: TET_VERTICES,
  faceCenters: TET_FACE_CENTERS,

  // Metrics
  inradius: TET_INRADIUS,
  circumradius: TET_CIRCUMRADIUS,
  dihedralAngle: TET_DIHEDRAL_ANGLE,
  rollAngle: TET_ROLL_ANGLE,
  edgeLength: EDGE_LENGTH,

  // Visual styling
  facePalette: TET_FACE_PALETTE,
  faceLabelSize: 0.25,
  vertexSphereRadius: 0.08,

  // Initial state
  initialPosition: INITIAL_POSITION_TET,
  initialQuaternion: INITIAL_QUATERNION_TET,

  // Lattice configuration
  latticeType: 'triangular',
  movementSectors: 6,
  sectorAngle: Math.PI / 3,

  // Methods - Core geometry
  getVertices() {
    return this.vertices;
  },

  getFaces(): FaceData[] {
    // Each face is made of 3 vertices (all except the opposite vertex)
    const faces: FaceData[] = [
      { vertices: [TET_VERTICES[1], TET_VERTICES[2], TET_VERTICES[3]] }, // Face 0: opposite vertex 0
      { vertices: [TET_VERTICES[0], TET_VERTICES[3], TET_VERTICES[2]] }, // Face 1: opposite vertex 1
      { vertices: [TET_VERTICES[0], TET_VERTICES[1], TET_VERTICES[3]] }, // Face 2: opposite vertex 2
      { vertices: [TET_VERTICES[0], TET_VERTICES[2], TET_VERTICES[1]] }, // Face 3: opposite vertex 3
    ];

    return faces.map((face, i) => {
      const n = TET_FACE_CENTERS[i].clone().normalize();
      const center = n.clone().multiplyScalar(TET_INRADIUS);

      // Ensure CCW winding from outside
      const v1 = face.vertices[0];
      const v2 = face.vertices[1];
      const v3 = face.vertices[2];
      const cp = new Vector3().subVectors(v2, v1).cross(new Vector3().subVectors(v3, v1));

      const vertices = cp.dot(n) > 0 ? [v1, v2, v3] : [v1, v3, v2];

      return {
        index: i + 1,
        center,
        normal: n,
        vertices
      };
    });
  },

  getBottomVertexCount() {
    return 3;
  },

  // Methods - Visual rendering
  // Tetrahedron vertex coloring: 4 distinct colors
  // Vertex i gets the color of the face opposite to it
  getVertexColor(index: number): string {
    return VERTEX_COLORS_MAP[index];
  },

  // Tetrahedron face coloring: 4 distinct colors
  // Face i (opposite vertex i) gets complementary color from vertex i
  getFaceColor(faceIndex: number): string {
    // Face 0 opposite vertex 0, etc.
    // Map: Face 0→blue, Face 1→yellow, Face 2→red, Face 3→green
    const faceColors = [
      VERTEX_COLORS[2], // Face 0: Blue
      VERTEX_COLORS[4], // Face 1: Yellow
      VERTEX_COLORS[0], // Face 2: Red
      VERTEX_COLORS[1], // Face 3: Green
    ];
    return faceColors[faceIndex];
  },

  // Methods - Floor lattice
  // Tetrahedron uses 4-color vertex palette on triangular lattice
  // The coloring ensures that:
  // 1. Every triangle has 3 different colors at its vertices
  // 2. Every pair of adjacent triangles together has all 4 colors
  // Formula: 2*(i mod 2) + ((i+j) mod 2)
  // Pattern: Even rows alternate blue/green, odd rows alternate yellow/red
  getLatticeVertexColor(i: number, j: number): string {
    const colorIdx = 2 * (((i % 2) + 2) % 2) + (((i + j) % 2) + 2) % 2;
    return TET_FACE_PALETTE[colorIdx];
  },

  // Methods - Orientation and movement
  getOrientationLabel(delta: number): string {
    const sector = Math.round(delta / 60) % 6;
    let label = 'X';
    if (sector === 0 || sector === 3) label = 'X';
    else if (sector === 2 || sector === 5) label = 'Y';
    else if (sector === 4 || sector === 1) label = 'Z';
    return label;
  },

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
