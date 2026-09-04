import { Vector3, Quaternion } from 'three';
import { ShapeType } from '../types';
import type { TameSurfaceData, CornerClass } from './tameData';

export interface FaceData {
  index: number;
  center: Vector3;
  normal: Vector3;
  vertices: Vector3[];
}

/** A piece of a tiling cell painted on a face of a tame polyhedron (local coordinates). */
export interface SurfaceCell {
  faceIndex: number;      // 1-based
  vertices: Vector3[];    // convex polygon, CCW from outside
  normal: Vector3;        // outward normal of the face
  front: boolean;         // orientation class of the cell (front/back sheet)
}

/** A tiling corner lying on the surface that is not a vertex of the polyhedron. */
export interface SurfaceMark {
  position: Vector3;
  cls: CornerClass;
  color: string;
}

export interface PolyhedronDefinition {
  id: ShapeType;
  name: string;
  faceCount: number;
  vertexCount: number;

  // Geometry
  vertices: Vector3[];
  faceIndices?: number[][];  // Optional: for indexed geometry (icosahedron)
  faceCenters: Vector3[];

  // Metrics
  inradius: number;
  circumradius?: number;
  dihedralAngle: number;
  rollAngle: number;
  edgeLength: number;

  // Visual styling
  facePalette: string[];
  vertexColorIndices?: number[];
  faceColorIndices?: number[];
  faceLabelSize: number;        // Font size for face labels (0.2 or 0.3)
  vertexSphereRadius: number;    // Radius for vertex spheres (0.07 or 0.08)

  // Initial state
  initialPosition: Vector3;
  initialQuaternion: Quaternion;

  // Lattice configuration
  // 'cell' = one of the three rolling tessellations of tame polyhedra (see `tame.cell`)
  latticeType: 'square' | 'triangular' | 'hexagonal' | 'none' | 'cell';
  movementSectors: number;       // 4 for square, 6 for triangular, 3/4/6 for doubly covered
  sectorAngle: number;           // π/2 for square, π/3 for triangular, 2π/k for doubly covered

  // Methods - Core geometry
  getVertices(): Vector3[];
  getFaces(): FaceData[];
  getBottomVertexCount(): number; // 4 for cube, 3 for others

  // Methods - Visual rendering
  getVertexColor(index: number): string;
  getFaceColor(faceIndex: number): string;
  getYellowPoints?(): Vector3[];  // Optional: only for cube

  // Methods - Floor lattice
  getLatticeVertexColor(i: number, j: number): string;

  // Methods - Orientation and movement
  getOrientationLabel(deltaAngle: number): string;  // X, Y, or Z
  // edgeVertexIndices: the (0-based) vertex indices of the edge rolled over, when known
  getMoveData(angle: number, edgeVertexIndices?: [number, number]): { label: string; delta: { u: number; v: number } };

  // Tame polyhedra (bounded overlap thickness): enumeration data and cell decoration
  tame?: TameSurfaceData;
  showVertexLabels?: boolean;
  getSurfaceCells?(): SurfaceCell[];
  getSurfaceMarks?(): SurfaceMark[];

  // Methods - Interaction zones (for highlighting rollable targets)
  // Optional: Custom interaction zone calculation
  // If not provided, uses generic algorithm: find adjacent face and project to ground
  getInteractionZoneVertices?(bottomVertexIndices: number[]): Vector3[];

  // Helper method to find which face shares a given edge (pair of vertex indices)
  // Returns the face index (0-based) or -1 if not found
  findAdjacentFace?(vertexIndex1: number, vertexIndex2: number, excludeFaceIndex: number): number;
}
