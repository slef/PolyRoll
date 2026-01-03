import { ShapeType } from '../types';
import { PolyhedronDefinition } from './PolyhedronDefinition';
import { octahedron } from './octahedron';
import { cube } from './cube';
import { icosahedron } from './icosahedron';
import { tetrahedron } from './tetrahedron';

export const POLYHEDRA: Record<ShapeType, PolyhedronDefinition> = {
  octahedron,
  cube,
  icosahedron,
  tetrahedron,
};

export function getPolyhedron(shape: ShapeType): PolyhedronDefinition {
  return POLYHEDRA[shape];
}
