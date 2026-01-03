import { Vector3, Quaternion, Color } from 'three';
import { PolyhedronDefinition, FaceData } from './PolyhedronDefinition';
import { VERTEX_COLORS } from '../constants';

// Cube-specific constants (from constants.ts)
const EDGE_LENGTH = 1.0;
const CUBE_INRADIUS = EDGE_LENGTH / 2;
const CUBE_ROLL_ANGLE = Math.PI / 2;

/**
 * Standard Right-Handed Casino Die Mapping:
 * Opposite faces sum to 7.
 * If 1 is Bottom (Down) and 2 is Front (Forward), then 3 is Left.
 */
const CUBE_FACE_CENTERS = [
  new Vector3(0, -1, 0), // Face 1 (Down/Bottom at start)
  new Vector3(0, 0, 1),  // Face 2 (Forward/Front)
  new Vector3(-1, 0, 0), // Face 3 (Left)
  new Vector3(1, 0, 0),  // Face 4 (Right, opposite 3)
  new Vector3(0, 0, -1), // Face 5 (Backward/Back, opposite 2)
  new Vector3(0, 1, 0)   // Face 6 (Up/Top, opposite 1)
];

const CUBE_VERTICES = [
  new Vector3(-1,-1,-1), new Vector3(1,-1,-1), new Vector3(1,1,-1), new Vector3(-1,1,-1),
  new Vector3(-1,-1,1), new Vector3(1,-1,1), new Vector3(1,1,1), new Vector3(-1,1,1)
].map(v => v.multiplyScalar(EDGE_LENGTH / 2));

const CUBE_FACE_PALETTE = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'];

// Initial orientation (identity quaternion from constants.ts line 105)
const INITIAL_QUATERNION_CUBE = new Quaternion().setFromAxisAngle(new Vector3(1,0,0), 0);
const INITIAL_POSITION_CUBE = new Vector3(0, CUBE_INRADIUS, 0);

// Vertex color indexing function (from Simulation.tsx lines 40-45)
const getVertexColorIdx = (v: Vector3) => {
  const sX = Math.sign(v.x);
  const sY = Math.sign(v.y);
  const sZ = Math.sign(v.z);
  return Math.floor((sX + sY + sZ + 3) / 2) % 2;
};

export const cube: PolyhedronDefinition = {
  id: 'cube',
  name: 'Cube',
  faceCount: 6,
  vertexCount: 8,

  // Geometry
  vertices: CUBE_VERTICES,
  faceCenters: CUBE_FACE_CENTERS,

  // Metrics
  inradius: CUBE_INRADIUS,
  dihedralAngle: Math.PI / 2,
  rollAngle: CUBE_ROLL_ANGLE,
  edgeLength: EDGE_LENGTH,

  // Visual styling
  facePalette: CUBE_FACE_PALETTE,
  faceLabelSize: 0.3,
  vertexSphereRadius: 0.07,

  // Initial state
  initialPosition: INITIAL_POSITION_CUBE,
  initialQuaternion: INITIAL_QUATERNION_CUBE,

  // Lattice configuration
  latticeType: 'square',
  movementSectors: 4,
  sectorAngle: Math.PI / 2,

  // Methods - Core geometry
  getVertices() {
    return this.vertices;
  },

  // getFaces implementation (from turtle.ts lines 20-41)
  getFaces(): FaceData[] {
    return CUBE_FACE_CENTERS.map((c, i) => {
      const normal = c.clone().normalize();
      // Robust sorting using ATAN2 around the face normal
      const center = c.clone().multiplyScalar(CUBE_INRADIUS);
      const faceVerts = CUBE_VERTICES.filter(v => v.dot(normal) > 0.1);

      // Create a local coordinate system for the face
      const up = Math.abs(normal.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
      const tangent = new Vector3().crossVectors(normal, up).normalize();
      const bitangent = new Vector3().crossVectors(normal, tangent).normalize();

      const sorted = [...faceVerts].sort((a, b) => {
        const da = a.clone().sub(center);
        const db = b.clone().sub(center);
        const angleA = Math.atan2(da.dot(bitangent), da.dot(tangent));
        const angleB = Math.atan2(db.dot(bitangent), db.dot(tangent));
        return angleA - angleB;
      });

      return { index: i + 1, center, normal, vertices: sorted };
    });
  },

  getBottomVertexCount() {
    return 4;
  },

  // Methods - Visual rendering
  // Cube vertex coloring: by parity function (Simulation.tsx line 276)
  getVertexColor(index: number): string {
    const v = CUBE_VERTICES[index];
    const colorIdx = getVertexColorIdx(v);
    return VERTEX_COLORS[colorIdx];
  },

  // Cube face coloring: 6 unique colors (Simulation.tsx line 263)
  getFaceColor(faceIndex: number): string {
    return CUBE_FACE_PALETTE[faceIndex];
  },

  // Yellow points calculation (from Simulation.tsx lines 216-252)
  getYellowPoints(): Vector3[] {
    const points: Vector3[] = [];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Bottom (-z)
      [4, 5], [5, 6], [6, 7], [7, 4], // Top (+z)
      [0, 4], [1, 5], [2, 6], [3, 7]  // Vertical
    ];

    CUBE_FACE_CENTERS.forEach((center) => {
      const normal = center.clone().normalize();
      const facePos = center.clone().multiplyScalar(CUBE_INRADIUS);
      const faceVertIndices: number[] = [];
      CUBE_VERTICES.forEach((v, idx) => {
        if (v.dot(normal) > 0.1) faceVertIndices.push(idx);
      });

      edges.forEach(([i, j]) => {
        if (faceVertIndices.includes(i) && faceVertIndices.includes(j)) {
          [[i, j], [j, i]].forEach(([startIdx, endIdx]) => {
            const start = CUBE_VERTICES[startIdx];
            const end = CUBE_VERTICES[endIdx];
            if (getVertexColorIdx(start) === 1 && getVertexColorIdx(end) === 0) {
              const vStart = start.clone().sub(facePos);
              const vEnd = end.clone().sub(facePos);
              const cross = new Vector3().crossVectors(vStart, vEnd);
              if (cross.dot(normal) > 0) {
                const mid = new Vector3().addVectors(start, end).multiplyScalar(0.5);
                const toCenter = new Vector3().subVectors(facePos, mid);
                points.push(mid.clone().add(toCenter.multiplyScalar(0.5)));
              }
            }
          });
        }
      });
    });
    return points;
  },

  // Methods - Floor lattice
  // Cube uses 2-color checkerboard on square lattice (Floor.tsx lines 46-47)
  getLatticeVertexColor(i: number, j: number): string {
    const colorIdx = (Math.abs(i + j) % 2);
    return VERTEX_COLORS[colorIdx];
  },

  // Methods - Orientation and movement
  // Cube uses 90° sectors (4 directions) (App.tsx lines 40-42)
  getOrientationLabel(delta: number): string {
    const sector = Math.round(delta / 90) % 4;
    return sector === 0 || sector === 2 ? 'X' : 'Z';
  },

  // getMoveData for square lattice (constants.ts lines 134-143)
  getMoveData(angle: number): { label: string; delta: { u: number; v: number } } {
    let a = angle % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;

    const sector = Math.round(a / (Math.PI / 2)) % 4;
    switch (sector) {
      case 0: return { label: '+X', delta: { u: 1, v: 0 } };
      case 1: return { label: '+Z', delta: { u: 0, v: 1 } };
      case 2: return { label: '-X', delta: { u: -1, v: 0 } };
      case 3: return { label: '-Z', delta: { u: 0, v: -1 } };
      default: return { label: '?', delta: { u: 0, v: 0 } };
    }
  },
};
