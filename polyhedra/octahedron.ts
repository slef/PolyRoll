import { Vector3, Quaternion, Matrix4, Color } from 'three';
import { PolyhedronDefinition, FaceData } from './PolyhedronDefinition';
import { VERTEX_COLORS } from '../constants';

// Octahedron-specific constants (from constants.ts)
const EDGE_LENGTH = 1.0;
const OCTAHEDRON_RADIUS = EDGE_LENGTH / Math.sqrt(2);
const OCT_INRADIUS = EDGE_LENGTH / Math.sqrt(6);
const OCT_DIHEDRAL_ANGLE = Math.acos(-1 / 3);
const OCT_ROLL_ANGLE = Math.PI - OCT_DIHEDRAL_ANGLE;

const OCT_FACE_CENTERS = [
  new Vector3(1,1,1), new Vector3(-1,1,1), new Vector3(1,-1,1), new Vector3(1,1,-1),
  new Vector3(-1,-1,1), new Vector3(-1,1,-1), new Vector3(1,-1,-1), new Vector3(-1,-1,-1)
];

const OCT_FACE_PALETTE = ['#c084fc', '#fef08a']; // Light Purple, Pale Yellow

// Initial orientation calculation (exact copy from constants.ts lines 96-102)
const wDown = new Vector3(0, -1, 0);
const wRight = new Vector3(1, 0, 0);
const wForward = new Vector3(0, 0, 1);
const mWorld = new Matrix4().makeBasis(wRight, wDown, wForward);

const octDown = new Vector3(1, 1, 1).normalize();
const octRight = new Vector3(1, -1, 0).normalize();
const octForward = new Vector3().crossVectors(octDown, octRight).normalize();
const mOctInv = new Matrix4().makeBasis(octRight, octDown, octForward).transpose();
const INITIAL_QUATERNION_OCT = new Quaternion().setFromRotationMatrix(mWorld.clone().multiply(mOctInv));
const INITIAL_POSITION_OCT = new Vector3(0, OCT_INRADIUS, 0);

export const octahedron: PolyhedronDefinition = {
  id: 'octahedron',
  name: 'Octahedron',
  faceCount: 8,
  vertexCount: 6,

  // Geometry
  vertices: [
    new Vector3(OCTAHEDRON_RADIUS, 0, 0),
    new Vector3(-OCTAHEDRON_RADIUS, 0, 0),
    new Vector3(0, OCTAHEDRON_RADIUS, 0),
    new Vector3(0, -OCTAHEDRON_RADIUS, 0),
    new Vector3(0, 0, OCTAHEDRON_RADIUS),
    new Vector3(0, 0, -OCTAHEDRON_RADIUS),
  ],
  faceCenters: OCT_FACE_CENTERS,

  // Metrics
  inradius: OCT_INRADIUS,
  circumradius: OCTAHEDRON_RADIUS,
  dihedralAngle: OCT_DIHEDRAL_ANGLE,
  rollAngle: OCT_ROLL_ANGLE,
  edgeLength: EDGE_LENGTH,

  // Visual styling
  facePalette: OCT_FACE_PALETTE,
  faceLabelSize: 0.3,
  vertexSphereRadius: 0.08,

  // Initial state
  initialPosition: INITIAL_POSITION_OCT,
  initialQuaternion: INITIAL_QUATERNION_OCT,

  // Lattice configuration
  latticeType: 'triangular',
  movementSectors: 6,
  sectorAngle: Math.PI / 3,

  // Methods - Core geometry
  getVertices() {
    return this.vertices;
  },

  // getFaces implementation (from turtle.ts lines 42-53)
  getFaces(): FaceData[] {
    const R = OCTAHEDRON_RADIUS;
    return OCT_FACE_CENTERS.map((normal, i) => {
      const n = normal.clone().normalize();
      const v1 = new Vector3(Math.sign(normal.x) * R, 0, 0);
      const v2 = new Vector3(0, Math.sign(normal.y) * R, 0);
      const v3 = new Vector3(0, 0, Math.sign(normal.z) * R);
      const cp = new Vector3().subVectors(v2, v1).cross(new Vector3().subVectors(v3, v1));
      // Ensure CCW winding
      const vertices = cp.dot(n) < 0 ? [v1, v3, v2] : [v1, v2, v3];
      return {
        index: i + 1,
        center: n.clone().multiplyScalar(OCT_INRADIUS),
        normal: n,
        vertices
      };
    });
  },

  getBottomVertexCount() {
    return 3;
  },

  // Methods - Visual rendering
  // Octahedron vertex coloring: by axis (lines 351-353 in Simulation.tsx)
  getVertexColor(index: number): string {
    const colors = [
      VERTEX_COLORS[0], // X axis (red)
      VERTEX_COLORS[0], // -X axis (red)
      VERTEX_COLORS[1], // Y axis (green)
      VERTEX_COLORS[1], // -Y axis (green)
      VERTEX_COLORS[2], // Z axis (blue)
      VERTEX_COLORS[2], // -Z axis (blue)
    ];
    return colors[index];
  },

  // Octahedron face coloring: 2-color checkerboard (lines 337-339 in Simulation.tsx)
  getFaceColor(faceIndex: number): string {
    const normal = OCT_FACE_CENTERS[faceIndex];
    const negatives = (normal.x < 0 ? 1 : 0) + (normal.y < 0 ? 1 : 0) + (normal.z < 0 ? 1 : 0);
    const color = negatives % 2 === 0 ? new Color(OCT_FACE_PALETTE[0]) : new Color(OCT_FACE_PALETTE[1]);
    return `#${color.getHexString()}`;
  },

  // Methods - Floor lattice
  // Octahedron uses 3-color vertex palette on triangular lattice (Floor.tsx lines 76-78)
  getLatticeVertexColor(i: number, j: number): string {
    const colorIdx = (((2 + 2*i + j) % 3) + 3) % 3;
    const palette = [VERTEX_COLORS[0], VERTEX_COLORS[1], VERTEX_COLORS[2]];
    return palette[colorIdx];
  },

  // Methods - Orientation and movement
  // Octahedron uses 60° sectors (6 directions) (App.tsx lines 44-48)
  getOrientationLabel(delta: number): string {
    const sector = Math.round(delta / 60) % 6;
    let label = 'X';
    if (sector === 0 || sector === 3) label = 'X';
    else if (sector === 2 || sector === 5) label = 'Y';
    else if (sector === 4 || sector === 1) label = 'Z';
    return label;
  },

  // getMoveData for hexagonal/triangular lattice (constants.ts lines 143-156)
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
