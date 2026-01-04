import { Vector3, Quaternion } from 'three';

export type ShapeType = 'octahedron' | 'icosahedron' | 'cube' | 'tetrahedron';

export interface GameState {
  isRolling: boolean;
  score: number;
  currentFace: number; // The label of the face currently touching the ground
  position: Vector3;
  quaternion: Quaternion;
}

export interface RollTarget {
  axis: Vector3; // The edge axis to rotate around
  point: Vector3; // The midpoint of the edge (pivot point)
  targetCenter: Vector3; // The center of the target tile
  directionAngle: number; // Angle for the helper arrow
}

export interface HistoryStep {
  position: Vector3;
  quaternion: Quaternion;
  faceIndex: number;
  orientation: string; // "X", "Y", or "Z"
  coordinate: { u: number; v: number }; // Axial coordinates (Basis 0 deg and 120 deg) or Standard (X, Y)
  moveLabel: string; // "+X", "-Y", etc.
  moveIndex: number;
  shape: ShapeType;
}

export interface PathSegment {
  points: Vector3[]; // 3D local points relative to polyhedron center
}

export interface PathResult {
  segments: PathSegment[];
  error?: {
    message: string;
    lineNumber: number; // 1-based line number in source
  };
}

export interface TurtleState {
  faceIndex: number;
  pos: Vector3;
  heading: Vector3;
}

export interface TurtleCommand {
  type: 'start' | 'fd' | 'bk' | 'lt' | 'rt';
  value: number | [number, number];
  lineNumber: number; // 1-based line number in source
}

export interface EdgeCrossing {
  fromFaceIndex: number;
  toFaceIndex: number;
  edgeVertex1: Vector3;
  edgeVertex2: Vector3;
  crossingPoint: Vector3;
  segmentIndex: number; // which segment this crossing belongs to
  pointIndexInSegment: number; // where in the segment this crossing occurs
}
