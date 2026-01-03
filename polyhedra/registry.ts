import { ShapeType } from '../types';
import { PolyhedronDefinition } from './PolyhedronDefinition';
import { octahedron } from './octahedron';
import { cube } from './cube';
import { icosahedron } from './icosahedron';

export const POLYHEDRA: Record<ShapeType, PolyhedronDefinition> = {
  octahedron,
  cube,
  icosahedron,
};

export function getPolyhedron(shape: ShapeType): PolyhedronDefinition {
  return POLYHEDRA[shape];
}
