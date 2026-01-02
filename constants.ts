
import { Vector3, Quaternion, Matrix4 } from 'three';

// --- SHARED CONFIG ---
export const EDGE_LENGTH = 1.0;
export const TRIANGLE_SIDE = EDGE_LENGTH;
export const TRIANGLE_HEIGHT = (TRIANGLE_SIDE * Math.sqrt(3)) / 2;

// --- OCTAHEDRON CONFIG ---
// For edge length 'a', circumradius R = a / sqrt(2), inradius r = a / sqrt(6)
export const OCTAHEDRON_RADIUS = EDGE_LENGTH / Math.sqrt(2); 
export const OCT_INRADIUS = EDGE_LENGTH / Math.sqrt(6);
export const OCT_DIHEDRAL_ANGLE = Math.acos(-1 / 3);
export const OCT_ROLL_ANGLE = Math.PI - OCT_DIHEDRAL_ANGLE;

// --- CUBE CONFIG ---
export const CUBE_INRADIUS = EDGE_LENGTH / 2;
export const CUBE_ROLL_ANGLE = Math.PI / 2;
/**
 * Standard Right-Handed Casino Die Mapping:
 * Opposite faces sum to 7. 
 * If 1 is Bottom (Down) and 2 is Front (Forward), then 3 is Left.
 */
export const CUBE_FACE_CENTERS = [
    new Vector3(0, -1, 0), // Face 1 (Down/Bottom at start)
    new Vector3(0, 0, 1),  // Face 2 (Forward/Front)
    new Vector3(-1, 0, 0), // Face 3 (Left)
    new Vector3(1, 0, 0),  // Face 4 (Right, opposite 3)
    new Vector3(0, 0, -1), // Face 5 (Backward/Back, opposite 2)
    new Vector3(0, 1, 0)   // Face 6 (Up/Top, opposite 1)
];
export const CUBE_VERTICES = [
    new Vector3(-1,-1,-1), new Vector3(1,-1,-1), new Vector3(1,1,-1), new Vector3(-1,1,-1),
    new Vector3(-1,-1,1), new Vector3(1,-1,1), new Vector3(1,1,1), new Vector3(-1,1,1)
].map(v => v.multiplyScalar(EDGE_LENGTH / 2));

// --- ICOSAHEDRON CONFIG ---
const phi = (1 + Math.sqrt(5)) / 2;
// Raw vertices (0, +-1, +-phi) have edge length 2. Scale by 0.5 for unit edge length.
const icoScale = 0.5;
export const ICO_VERTICES_RAW = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
].map(v => new Vector3(v[0], v[1], v[2]).multiplyScalar(icoScale));

export const ICO_INDICES = [
    0, 11, 5,  0, 5, 1,  0, 1, 7,  0, 7, 10,  0, 10, 11,
    1, 5, 9,   5, 11, 4, 11, 10, 2, 10, 7, 6,  7, 1, 8,
    3, 9, 4,   3, 4, 2,  3, 2, 6,  3, 6, 8,   3, 8, 9,
    4, 9, 5,   2, 4, 11, 6, 2, 10, 8, 6, 7,   9, 8, 1
];

// For edge length 'a', inradius r = (a * phi^2) / (2 * sqrt(3))
export const ICO_INRADIUS = (phi * phi * EDGE_LENGTH) / (2 * Math.sqrt(3));
export const ICO_DIHEDRAL_ANGLE = Math.acos(-Math.sqrt(5) / 3); 
export const ICO_ROLL_ANGLE = Math.PI - ICO_DIHEDRAL_ANGLE;

export const ICO_FACE_CENTERS: Vector3[] = [];
for (let i = 0; i < ICO_INDICES.length; i += 3) {
    const a = ICO_VERTICES_RAW[ICO_INDICES[i]];
    const b = ICO_VERTICES_RAW[ICO_INDICES[i+1]];
    const c = ICO_VERTICES_RAW[ICO_INDICES[i+2]];
    const center = new Vector3().addVectors(a, b).add(c).divideScalar(3);
    ICO_FACE_CENTERS.push(center);
}

// Fixed missing exported members ICO_FACE_COLORS_INDICES and ICO_VERTEX_COLORS_INDICES
export const ICO_FACE_COLORS_INDICES = [
    0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3
];

export const ICO_VERTEX_COLORS_INDICES = [
    0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5
];

// --- COLOR PALETTES ---
export const GRID_COLOR_1 = '#c084fc'; // Light Purple (changed from #7e22ce)
export const GRID_COLOR_2 = '#fef08a'; // Pale Yellow
export const GRID_COLOR_3 = '#f472b6'; // Pink
export const GRID_COLOR_4 = '#bae6fd'; // Sky Blue
export const OCT_FACE_PALETTE = [GRID_COLOR_1, GRID_COLOR_2];
export const ICO_FACE_PALETTE = [GRID_COLOR_1, GRID_COLOR_2, GRID_COLOR_3, GRID_COLOR_4];
export const CUBE_FACE_PALETTE = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'];

export const VERTEX_COLORS = [
    '#ef4444', // 0: Red
    '#22c55e', // 1: Green
    '#3b82f6', '#f97316', '#eab308', '#a855f7',
];

// --- INITIAL ORIENTATIONS ---
const wDown = new Vector3(0, -1, 0), wRight = new Vector3(1, 0, 0), wForward = new Vector3(0, 0, 1);
const mWorld = new Matrix4().makeBasis(wRight, wDown, wForward);

// OCTAHEDRON
const octDown = new Vector3(1, 1, 1).normalize(); 
const octRight = new Vector3(1, -1, 0).normalize();
const octForward = new Vector3().crossVectors(octDown, octRight).normalize();
const mOctInv = new Matrix4().makeBasis(octRight, octDown, octForward).transpose();
export const INITIAL_QUATERNION_OCT = new Quaternion().setFromRotationMatrix(mWorld.clone().multiply(mOctInv));
export const INITIAL_POSITION_OCT = new Vector3(0, OCT_INRADIUS, 0);

// CUBE
export const INITIAL_QUATERNION_CUBE = new Quaternion().setFromAxisAngle(new Vector3(1,0,0), 0);
export const INITIAL_POSITION_CUBE = new Vector3(0, CUBE_INRADIUS, 0);

// ICOSAHEDRON
const icoFace0Normal = ICO_FACE_CENTERS[0].clone().normalize();
const icoFace0Vertex0 = ICO_VERTICES_RAW[ICO_INDICES[0]].clone();
const icoFace0Center = ICO_FACE_CENTERS[0];
const icoVToVert = new Vector3().subVectors(icoFace0Vertex0, icoFace0Center).normalize();
const sourceDown = icoFace0Normal;
const sourceBack = icoVToVert; 
const sourceRight = new Vector3().crossVectors(sourceDown, sourceBack).normalize();
const mSource = new Matrix4().makeBasis(sourceRight, sourceDown, sourceBack);
const targetDown = new Vector3(0, -1, 0), targetBack = new Vector3(0, 0, -1); 
const targetRight = new Vector3().crossVectors(targetDown, targetBack).normalize();
const mTarget = new Matrix4().makeBasis(targetRight, targetDown, targetBack);
export const INITIAL_QUATERNION_ICO = new Quaternion().setFromRotationMatrix(mTarget.multiply(mSource.transpose()));
export const INITIAL_POSITION_ICO = new Vector3(0, ICO_INRADIUS, 0);

// --- OCTAHEDRON HELPERS ---
export const OCT_FACE_CENTERS = [
  new Vector3(1,1,1), new Vector3(-1,1,1), new Vector3(1,-1,1), new Vector3(1,1,-1),
  new Vector3(-1,-1,1), new Vector3(-1,1,-1), new Vector3(1,-1,-1), new Vector3(-1,-1,-1)
];

// --- UTILS ---
export const getMoveData = (angle: number, isSquare: boolean = false) => {
    let a = angle % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;

    if (isSquare) {
        const sector = Math.round(a / (Math.PI / 2)) % 4;
        switch (sector) {
            case 0: return { label: '+X', delta: { u: 1, v: 0 } };
            case 1: return { label: '+Z', delta: { u: 0, v: 1 } };
            case 2: return { label: '-X', delta: { u: -1, v: 0 } };
            case 3: return { label: '-Z', delta: { u: 0, v: -1 } };
            default: return { label: '?', delta: { u: 0, v: 0 } };
        }
    } else {
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
    }
}
