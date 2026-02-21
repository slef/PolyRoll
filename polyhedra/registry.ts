import { ShapeType } from '../types';
import { PolyhedronDefinition } from './PolyhedronDefinition';
import { octahedron } from './octahedron';
import { cube } from './cube';
import { icosahedron } from './icosahedron';
import { tetrahedron } from './tetrahedron';
import { dcTriangle, dcSquare, dcHexagon } from './doublyCoveredKGon';
import { dodecahedron } from './dodecahedron';

export const POLYHEDRA: Record<ShapeType, PolyhedronDefinition> = {
  octahedron,
  cube,
  icosahedron,
  tetrahedron,
  dodecahedron,
  dcTriangle,
  dcSquare,
  dcHexagon,
};

export function getPolyhedron(shape: ShapeType): PolyhedronDefinition {
  return POLYHEDRA[shape];
}
