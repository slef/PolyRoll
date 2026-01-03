import { Vector3, Quaternion } from 'three';
import { ShapeType } from '../types';

export interface FaceData {
  index: number;
  center: Vector3;
  normal: Vector3;
  vertices: Vector3[];
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
  latticeType: 'square' | 'triangular';
  movementSectors: number;       // 4 for square, 6 for triangular
  sectorAngle: number;           // π/2 for square, π/3 for triangular

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
  getMoveData(angle: number): { label: string; delta: { u: number; v: number } };
}
