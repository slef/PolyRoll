import { Vector3, Quaternion, Matrix4, Color } from 'three';
import { PolyhedronDefinition, FaceData } from './PolyhedronDefinition';
import { VERTEX_COLORS } from '../constants';

const EDGE_LENGTH = 1.0;
const phi = (1 + Math.sqrt(5)) / 2;
const invPhi = 1 / phi;

// Raw dodecahedron vertices have edge length 2/phi.
// Scale by phi/2 to get edge length 1.0.
const dodScale = phi / 2;

const DOD_VERTICES_RAW = [
  // 8 cube vertices (±1, ±1, ±1)
  [ 1,  1,  1], [ 1,  1, -1], [ 1, -1,  1], [ 1, -1, -1],
  [-1,  1,  1], [-1,  1, -1], [-1, -1,  1], [-1, -1, -1],
  // 4 on XY plane (0, ±phi, ±1/phi)
  [0,  phi,  invPhi], [0,  phi, -invPhi], [0, -phi,  invPhi], [0, -phi, -invPhi],
  // 4 on XZ plane (±phi, 0, ±1/phi) — but standard form is (±1/phi, 0, ±phi)
  [ invPhi, 0,  phi], [-invPhi, 0,  phi], [ invPhi, 0, -phi], [-invPhi, 0, -phi],
  // 4 on YZ plane (±phi, ±1/phi, 0)
  [ phi,  invPhi, 0], [ phi, -invPhi, 0], [-phi,  invPhi, 0], [-phi, -invPhi, 0],
].map(v => new Vector3(v[0] * dodScale, v[1] * dodScale, v[2] * dodScale));

// 12 pentagonal faces (vertex indices, CCW when viewed from outside)
// Each face connects 5 vertices that form a regular pentagon
const DOD_FACE_INDICES = [
  [0, 12, 2, 17, 16],   // face 1
  [0, 16, 1, 9, 8],     // face 2
  [0, 8, 4, 13, 12],    // face 3
  [1, 16, 17, 3, 14],   // face 4
  [1, 14, 5, 9],        // placeholder - will be fixed
  [2, 12, 13, 6, 10],   // face 6
  [2, 10, 11, 3, 17],   // face 7
  [4, 8, 9, 5, 18],     // face 8
  [4, 18, 19, 6, 13],   // face 9
  [3, 11, 7, 15, 14],   // face 10
  [5, 14, 15, 19, 18],  // face 11
  [6, 19, 15, 7, 11],   // face 12 — but with vertex 10
];

// Actually, let me compute faces algorithmically from adjacency
function computeFaces(): number[][] {
  const eps = 0.01;
  const expectedEdge = EDGE_LENGTH;

  // Build adjacency: which vertices are connected by an edge
  const adj: Set<number>[] = Array.from({length: 20}, () => new Set());
  for (let i = 0; i < 20; i++) {
    for (let j = i + 1; j < 20; j++) {
      const d = DOD_VERTICES_RAW[i].distanceTo(DOD_VERTICES_RAW[j]);
      if (Math.abs(d - expectedEdge) < eps) {
        adj[i].add(j);
        adj[j].add(i);
      }
    }
  }

  // Find all pentagonal faces: cycles of 5 vertices where each consecutive pair is adjacent
  const faces: number[][] = [];
  const faceSet = new Set<string>();

  for (let start = 0; start < 20; start++) {
    for (const v1 of adj[start]) {
      for (const v2 of adj[v1]) {
        if (v2 === start) continue;
        for (const v3 of adj[v2]) {
          if (v3 === start || v3 === v1) continue;
          for (const v4 of adj[v3]) {
            if (v4 === start || v4 === v1 || v4 === v2) continue;
            if (!adj[v4].has(start)) continue;
            // Found a 5-cycle: start, v1, v2, v3, v4
            const face = [start, v1, v2, v3, v4];
            // Check coplanarity: all 5 should be on the same plane
            const center = new Vector3();
            face.forEach(i => center.add(DOD_VERTICES_RAW[i].clone()));
            center.divideScalar(5);
            const n = new Vector3().crossVectors(
              new Vector3().subVectors(DOD_VERTICES_RAW[v1], DOD_VERTICES_RAW[start]),
              new Vector3().subVectors(DOD_VERTICES_RAW[v2], DOD_VERTICES_RAW[start])
            ).normalize();
            let coplanar = true;
            for (const vi of face) {
              const dot = Math.abs(new Vector3().subVectors(DOD_VERTICES_RAW[vi], DOD_VERTICES_RAW[start]).dot(n));
              if (dot > eps) { coplanar = false; break; }
            }
            if (!coplanar) continue;

            // Canonical key to avoid duplicates
            const sorted = [...face].sort((a, b) => a - b);
            const key = sorted.join(',');
            if (faceSet.has(key)) continue;
            faceSet.add(key);

            // Ensure CCW winding (normal points outward = away from origin)
            const outward = center.clone().normalize();
            if (n.dot(outward) < 0) face.reverse();
            // Re-check after reversal
            const n2 = new Vector3().crossVectors(
              new Vector3().subVectors(DOD_VERTICES_RAW[face[1]], DOD_VERTICES_RAW[face[0]]),
              new Vector3().subVectors(DOD_VERTICES_RAW[face[2]], DOD_VERTICES_RAW[face[0]])
            ).normalize();
            if (n2.dot(outward) < 0) face.reverse();

            faces.push(face);
          }
        }
      }
    }
  }

  return faces;
}

const DOD_FACES = computeFaces();

// Compute face centers
const DOD_FACE_CENTERS: Vector3[] = DOD_FACES.map(face => {
  const center = new Vector3();
  face.forEach(i => center.add(DOD_VERTICES_RAW[i].clone()));
  center.divideScalar(5);
  return center;
});

// Metrics
const DOD_DIHEDRAL_ANGLE = 2 * Math.atan(phi); // ~116.565°
const DOD_ROLL_ANGLE = Math.PI - DOD_DIHEDRAL_ANGLE; // ~63.435°
const DOD_INRADIUS = (EDGE_LENGTH / 2) * Math.sqrt((25 + 11 * Math.sqrt(5)) / 10);

// Face coloring: proper 4-coloring via greedy graph coloring on face adjacency
const DOD_FACE_PALETTE = ['#c084fc', '#fef08a', '#f472b6', '#86efac'];

function computeFaceColorIndices(): number[] {
  // Build face adjacency: two faces are adjacent if they share an edge (2 vertices)
  const faceAdj: Set<number>[] = Array.from({length: 12}, () => new Set());
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      const shared = DOD_FACES[i].filter(v => DOD_FACES[j].includes(v));
      if (shared.length >= 2) {
        faceAdj[i].add(j);
        faceAdj[j].add(i);
      }
    }
  }
  // 4-coloring via backtracking (greedy can fail on 5-regular graphs)
  const colors = new Array(12).fill(-1);
  function solve(f: number): boolean {
    if (f === 12) return true;
    for (let c = 0; c < 4; c++) {
      let ok = true;
      for (const nb of faceAdj[f]) {
        if (colors[nb] === c) { ok = false; break; }
      }
      if (ok) {
        colors[f] = c;
        if (solve(f + 1)) return true;
      }
    }
    colors[f] = -1;
    return false;
  }
  solve(0);
  return colors;
}

const DOD_FACE_COLOR_INDICES = computeFaceColorIndices();

// Vertex coloring: cycle through available colors
const DOD_VERTEX_COLOR_INDICES = [
  0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3
];

// Initial orientation: align face 0 to point downward
const dodFace0Normal = DOD_FACE_CENTERS[0].clone().normalize();
const dodFace0Vertex0 = DOD_VERTICES_RAW[DOD_FACES[0][0]].clone();
const dodFace0Center = DOD_FACE_CENTERS[0];
const dodVToVert = new Vector3().subVectors(dodFace0Vertex0, dodFace0Center).normalize();
const dodSourceDown = dodFace0Normal;
const dodSourceBack = dodVToVert;
const dodSourceRight = new Vector3().crossVectors(dodSourceDown, dodSourceBack).normalize();
const dodMSource = new Matrix4().makeBasis(dodSourceRight, dodSourceDown, dodSourceBack);
const dodTargetDown = new Vector3(0, -1, 0);
const dodTargetBack = new Vector3(0, 0, -1);
const dodTargetRight = new Vector3().crossVectors(dodTargetDown, dodTargetBack).normalize();
const dodMTarget = new Matrix4().makeBasis(dodTargetRight, dodTargetDown, dodTargetBack);
const INITIAL_QUATERNION_DOD = new Quaternion().setFromRotationMatrix(
  dodMTarget.multiply(dodMSource.transpose())
);
const INITIAL_POSITION_DOD = new Vector3(0, DOD_INRADIUS, 0);

export const dodecahedron: PolyhedronDefinition = {
  id: 'dodecahedron',
  name: 'Dodecahedron',
  faceCount: 12,
  vertexCount: 20,

  vertices: DOD_VERTICES_RAW,
  faceIndices: DOD_FACES,
  faceCenters: DOD_FACE_CENTERS,

  inradius: DOD_INRADIUS,
  dihedralAngle: DOD_DIHEDRAL_ANGLE,
  rollAngle: DOD_ROLL_ANGLE,
  edgeLength: EDGE_LENGTH,

  facePalette: DOD_FACE_PALETTE,
  faceColorIndices: DOD_FACE_COLOR_INDICES,
  vertexColorIndices: DOD_VERTEX_COLOR_INDICES,
  faceLabelSize: 0.2,
  vertexSphereRadius: 0.07,

  initialPosition: INITIAL_POSITION_DOD,
  initialQuaternion: INITIAL_QUATERNION_DOD,

  latticeType: 'none',
  movementSectors: 5,
  sectorAngle: (2 * Math.PI) / 5,

  getVertices() {
    return this.vertices;
  },

  getFaces(): FaceData[] {
    return DOD_FACES.map((faceVerts, i) => {
      const vertices = faceVerts.map(idx => DOD_VERTICES_RAW[idx]);
      const center = DOD_FACE_CENTERS[i].clone();
      const normal = center.clone().normalize();
      return { index: i + 1, center, normal, vertices };
    });
  },

  getBottomVertexCount() {
    return 5;
  },

  getVertexColor(index: number): string {
    return VERTEX_COLORS[DOD_VERTEX_COLOR_INDICES[index] % VERTEX_COLORS.length];
  },

  getFaceColor(faceIndex: number): string {
    const palette = DOD_FACE_PALETTE.map(c => new Color(c));
    const color = palette[DOD_FACE_COLOR_INDICES[faceIndex % 12]];
    return `#${color.getHexString()}`;
  },

  getLatticeVertexColor(_i: number, _j: number): string {
    return '#cbd5e1';
  },

  getOrientationLabel(delta: number): string {
    const sector = Math.round(delta / 72) % 5;
    return ['A', 'B', 'C', 'D', 'E'][sector];
  },

  getMoveData(angle: number): { label: string; delta: { u: number; v: number } } {
    let a = angle % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    const sector = Math.round(a / (2 * Math.PI / 5)) % 5;
    return { label: `E${sector + 1}`, delta: { u: 0, v: 0 } };
  },
};
