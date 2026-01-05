# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PolyRoll is a 3D interactive simulation for rolling polyhedra (octahedron, cube, icosahedron, tetrahedron, and doubly covered polygons) on geometric surfaces (triangular, square, hexagonal lattices). It features turtle graphics that can draw paths on polyhedral surfaces with automatic face-to-face traversal.

## Development Commands

```bash
# Install dependencies
npm install

# Run development server (localhost:3000)
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

## Architecture

### Polyhedra System (Configuration-Based Architecture)

The codebase uses a **configuration-based architecture** where each polyhedron is defined as a self-contained configuration object implementing the `PolyhedronDefinition` interface. This makes adding new polyhedra straightforward (~100 lines vs 150-200 lines scattered across 6 files).

**Key components:**
- **[polyhedra/PolyhedronDefinition.ts](polyhedra/PolyhedronDefinition.ts)**: Core interface defining all polyhedron properties and methods
- **[polyhedra/registry.ts](polyhedra/registry.ts)**: Central registry with `getPolyhedron(shape)` function
- **Individual definitions**: [octahedron.ts](polyhedra/octahedron.ts), [cube.ts](polyhedra/cube.ts), [icosahedron.ts](polyhedra/icosahedron.ts), [tetrahedron.ts](polyhedra/tetrahedron.ts), [doublyCoveredKGon.ts](polyhedra/doublyCoveredKGon.ts)

**PolyhedronDefinition interface includes:**
- Geometry: `vertices`, `faceCenters`, `inradius`, `rollAngle`, `edgeLength`
- Visual styling: `facePalette`, `faceLabelSize`, `vertexSphereRadius`
- Initial state: `initialPosition`, `initialQuaternion`
- Lattice config: `latticeType` ('square' | 'triangular' | 'hexagonal'), `movementSectors`, `sectorAngle`
- Methods for rendering: `getVertices()`, `getFaces()`, `getVertexColor()`, `getFaceColor()`
- Methods for movement: `getMoveData()`, `getOrientationLabel()`
- Methods for floor: `getLatticeVertexColor()`

**Benefits:**
- Single unified mesh renderer instead of 3 separate components
- No shape-specific conditionals in components
- Adding new polyhedra: ~100 lines in one file instead of modifying 6 files

### Core State Management

The application state lives in [App.tsx](App.tsx), which manages:
- **History System**: Array of `HistoryStep` objects tracking position, quaternion, face index, orientation, and coordinates for each move
- **Shape Switching**: Maintains separate calibration angles for each polyhedron type to ensure consistent orientation tracking
- **Turtle Graphics State**: Manages command input and generates both 3D surface paths and 2D planar paths

### Key Mathematical Concepts

**Coordinate Systems:**
- Each polyhedron uses axial/grid coordinates (u, v) to track position on the surface
- Cubes use standard X/Z coordinates; triangular faces (octahedron/icosahedron) use 60/120-degree basis
- World position is separate from grid coordinates - the polyhedron can roll across the grid

**Initial Orientations:**
- Each polyhedron definition specifies `initialQuaternion` and `initialPosition`
- Face 1 always starts touching the ground (down orientation)
- Calibration angles computed at startup ensure consistent orientation labeling (X/Y/Z) across all rotations

**Face Orientation Tracking:**
- The `getFaceOrientation` function in [App.tsx](App.tsx:23-51) determines which grid axis (X, Y, or Z) is "up" relative to the current face
- Uses calibration angles to maintain consistent labeling regardless of polyhedron rotation
- Critical for turtle graphics to know which direction is "forward" on each face

### Component Structure

**[components/Simulation.tsx](components/Simulation.tsx)** (180+ lines)
- Uses polyhedron registry to get shape-specific data via `getPolyhedron(shape)`
- Renders polyhedron using unified `PolyhedronMesh` component (works for all shapes)
- Calculates rollable targets (clickable zones) based on bottom vertices/edges
- Animates rolling motion using quaternion rotation around edge axis
- Renders turtle graphics paths (blue = on surface, red = flat plane)

**[components/Floor.tsx](components/Floor.tsx)** (180+ lines)
- Uses `definition.latticeType` to determine grid type ('square' or 'triangular')
- Generates infinite procedural grid matching the polyhedron's geometry
- Implements vertex coloring via `definition.getLatticeVertexColor(i, j)`
- Uses instanced rendering for performance

**[components/TurtleConsole.tsx](components/TurtleConsole.tsx)**
- Collapsible side panel with syntax-highlighted editor
- Line numbers synchronized with scroll position
- Displays command syntax reference

### Turtle Graphics System

**[utils/turtle.ts](utils/turtle.ts)** (300+ lines)
- `parseCommands`: Parses turtle command strings into structured commands
- `generatePath`: Generates 3D path segments on the polyhedron surface
  - Starts on Face 1 with heading toward first edge midpoint
  - Detects edge crossings using plane intersection math
  - Rotates heading vector when crossing to adjacent face
  - Handles wrapping around polyhedron by tracking face transitions
- `generateFlatPath`: Generates equivalent 2D path on XZ plane for comparison
- Key algorithm: Edge crossing detection uses outward-facing edge normals and ray-plane intersection

**Face Data Structure:**
- Each face has: index, center position, normal vector, and ordered vertices (CCW winding)
- Vertices sorted using atan2 for consistent edge ordering
- Neighbor faces found by shared edge vertices

### Constants and Geometry

**[constants.ts](constants.ts)** now contains only shared constants:
- `EDGE_LENGTH`, `TRIANGLE_SIDE`, `TRIANGLE_HEIGHT`: Shared geometry constants
- `GRID_COLOR_1`, `GRID_COLOR_2`: Floor grid colors
- `VERTEX_COLORS`: Shared vertex color palette

**Shape-specific geometry** is now encapsulated in polyhedron definitions:
- Each definition includes: edge lengths, inradii, dihedral angles, roll angles
- Face centers and vertex positions in local coordinates
- Initial quaternions computed from rotation matrices
- Face and vertex color palettes
- Movement and orientation methods

### Important Implementation Details

**Rolling Animation:**
1. User clicks interaction zone → `handleRoll` captures target
2. `useFrame` hook interpolates from start to final position over `ROLL_DURATION` (0.4s)
3. Rotation uses quaternion around edge axis, position updates by rotating vector from pivot
4. After roll completes, calculates new face index by comparing face normals to world down vector
5. Calls `onRollComplete` with new state → App.tsx adds to history

**Turtle Path Edge Crossing:**
- When moving forward, checks all edges of current face for intersection
- Finds closest edge using ray-plane intersection (heading · edge_normal)
- On crossing: rotates heading vector using quaternion around shared edge axis
- Small nudge perpendicular to edge prevents getting stuck on boundary
- Safety counter (MAX_ITERATIONS) prevents infinite loops

**Shape Switching:**
- Resets history to initial state for new shape
- Clears turtle graphics paths
- Updates current step index to 0
- Each shape maintains its own calibration angle

## File Organization

- Root contains main [App.tsx](App.tsx), [index.tsx](index.tsx), [types.ts](types.ts), [constants.ts](constants.ts)
- `polyhedra/` contains polyhedron definitions and registry
  - [PolyhedronDefinition.ts](polyhedra/PolyhedronDefinition.ts): Core interface
  - [octahedron.ts](polyhedra/octahedron.ts), [cube.ts](polyhedra/cube.ts), [icosahedron.ts](polyhedra/icosahedron.ts): Shape configurations
  - [registry.ts](polyhedra/registry.ts): Central registry with `getPolyhedron()` function
- `components/` contains React Three Fiber components
- `utils/` contains pure computation functions (turtle graphics)
- TypeScript with JSX configured via [tsconfig.json](tsconfig.json)
- Path alias `@/*` maps to root directory
- Vite config sets base URL to `/PolyRoll/` for GitHub Pages deployment

## Tech Stack Notes

- React 19.2 with Three.js 0.182 via React Three Fiber
- Drei provides helpers: OrbitControls, Text, Environment, ContactShadows, Line, useCursor
- Tailwind CSS (imported via CDN in index.html, not via build process)
- No test framework configured
- Vite dev server runs on port 3000, bound to 0.0.0.0

## Common Modifications

**Adding a new polyhedron (simplified with registry system):**
1. Add shape type to `ShapeType` union in [types.ts](types.ts)
2. Create new file `polyhedra/yourshape.ts` implementing `PolyhedronDefinition` interface (~100 lines)
   - Define geometry: `vertices`, `faceCenters`, `inradius`, `rollAngle`
   - Set visual styling: `facePalette`, `faceLabelSize`, `vertexSphereRadius`
   - Specify lattice config: `latticeType`, `movementSectors`, `sectorAngle`
   - Implement methods: `getFaces()`, `getVertexColor()`, `getFaceColor()`, `getMoveData()`, `getOrientationLabel()`, `getLatticeVertexColor()`
3. Add to registry in [polyhedra/registry.ts](polyhedra/registry.ts)
4. Add to shape selector buttons in [App.tsx](App.tsx:123-129)

**Example: Adding a tetrahedron**
```typescript
// polyhedra/tetrahedron.ts
export const tetrahedron: PolyhedronDefinition = {
  id: 'tetrahedron',
  name: 'Tetrahedron',
  faceCount: 4,
  vertexCount: 4,
  vertices: [ /* 4 vertices */ ],
  faceCenters: [ /* 4 face centers */ ],
  inradius: EDGE_LENGTH / (2 * Math.sqrt(6)),
  rollAngle: Math.PI - Math.acos(1/3),
  latticeType: 'triangular',
  movementSectors: 6,
  sectorAngle: Math.PI / 3,
  // ... implement all required methods
};

// polyhedra/registry.ts
import { tetrahedron } from './tetrahedron';
export const POLYHEDRA = {
  octahedron, cube, icosahedron,
  tetrahedron, // ONE LINE
};
```

No changes needed in Simulation.tsx, Floor.tsx, or App.tsx (except button addition)!

**Modifying turtle commands:**
1. Add command type to `TurtleCommand` interface in [types.ts](types.ts)
2. Update parser in [utils/turtle.ts](utils/turtle.ts:68-83)
3. Handle command in `generatePath` and `generateFlatPath` functions
4. Update syntax guide in [TurtleConsole.tsx](components/TurtleConsole.tsx:85-102)

## Implementation Gotchas

**TypeScript Type Exports**: Use `export type` for interfaces in barrel exports
```typescript
// polyhedra/index.ts
export type { PolyhedronDefinition, FaceData } from './PolyhedronDefinition';
```

**WebGL Geometry**: For custom geometry, use imperative Three.js API instead of JSX
```typescript
const geom = new THREE.BufferGeometry();
geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
```

**Face Triangulation**: WebGL only renders triangles. Quads must be split: `[0,1,2,3] → [0,1,2], [0,2,3]`
