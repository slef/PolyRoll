import { Vector3, Quaternion } from 'three';
import { ShapeType, PathSegment, PathResult, TurtleState, TurtleCommand, EdgeCrossing, EdgeRoll } from '../types';
import { getPolyhedron, FaceData } from '../polyhedra';

export function parseCommands(text: string): TurtleCommand[] {
    const lines = text.split('\n');
    const cmds: TurtleCommand[] = [];
    lines.forEach((line, lineIdx) => {
        const parts = line.trim().toLowerCase().split(/\s+/);
        if (parts.length < 2) return;
        const cmd = parts[0];
        const val = parseFloat(parts[1]);
        const lineNumber = lineIdx + 1; // 1-based
        if (cmd === 'start' && parts.length >= 3) {
            cmds.push({ type: 'start', value: [parseFloat(parts[1]), parseFloat(parts[2])], lineNumber });
        } else if (['fd', 'bk', 'lt', 'rt'].includes(cmd)) {
            cmds.push({ type: cmd as any, value: isNaN(val) ? 0 : val, lineNumber });
        }
    });
    return cmds;
}

function offsetPoint(pos: Vector3, face: FaceData): Vector3 {
    return pos.clone().add(face.normal.clone().multiplyScalar(0.015));
}

/**
 * Find the adjacent face across a given edge.
 */
export function getAdjacentFace(
    faces: FaceData[],
    currentFace: FaceData,
    edgeV1: Vector3,
    edgeV2: Vector3
): FaceData | null {
    return faces.find(f =>
        f.index !== currentFace.index &&
        f.vertices.some(v => v.distanceTo(edgeV1) < 0.01) &&
        f.vertices.some(v => v.distanceTo(edgeV2) < 0.01)
    ) || null;
}

/**
 * Cross an edge from one face to another.
 * Updates heading via rotation and returns the new face.
 */
function crossEdge(
    state: TurtleState,
    fromFace: FaceData,
    toFace: FaceData,
    edgeV1: Vector3,
    edgeV2: Vector3
): void {
    const edgeAxis = edgeV2.clone().sub(edgeV1).normalize();
    const angle = fromFace.normal.angleTo(toFace.normal);
    const cross = new Vector3().crossVectors(fromFace.normal, toFace.normal);
    const rotationSign = cross.dot(edgeAxis) > 0 ? 1 : -1;
    const rotation = new Quaternion().setFromAxisAngle(edgeAxis, angle * rotationSign);

    state.heading.applyQuaternion(rotation);
    state.faceIndex = toFace.index;

    // Nudge position slightly into the new face
    const inwards = new Vector3().crossVectors(toFace.normal, edgeAxis).normalize();
    const toCenter = toFace.center.clone().sub(state.pos);
    if (inwards.dot(toCenter) < 0) inwards.negate();
    state.pos.add(inwards.multiplyScalar(0.001));
}

export function generatePath(shape: ShapeType, commands: TurtleCommand[]): PathResult {
    const definition = getPolyhedron(shape);
    const faces = definition.getFaces();

    // Always start on Face 1
    const startFace = faces.find((f: FaceData) => f.index === 1);

    if (!startFace) {
        return { segments: [], edgeRolls: [] };
    }

    // Initial Heading: Point towards the midpoint of the first edge.
    // With atan2 sorting, edge 0 is consistent and aligns with lattice for cubes.
    const midPointFirstEdge = new Vector3().addVectors(startFace.vertices[0], startFace.vertices[1]).multiplyScalar(0.5);
    const initialHeading = new Vector3().subVectors(midPointFirstEdge, startFace.center).normalize();

    let state: TurtleState = {
        faceIndex: startFace.index,
        pos: startFace.center.clone(),
        heading: initialHeading.clone()
    };

    const segments: PathSegment[] = [];
    const edgeRolls: EdgeRoll[] = [];
    let currentPath: Vector3[] = [offsetPoint(state.pos, startFace)];
    let error: PathResult['error'] = undefined;

    for (let cmdIndex = 0; cmdIndex < commands.length; cmdIndex++) {
        const cmd = commands[cmdIndex];

        if (cmd.type === 'start') {
            const [x, y] = cmd.value as [number, number];
            // 'start' resets to Face 1
            const f = startFace;
            const right = initialHeading.clone().cross(f.normal).normalize();

            state.pos.copy(f.center).add(initialHeading.clone().multiplyScalar(x)).add(right.multiplyScalar(y));
            state.faceIndex = f.index;
            state.heading.copy(initialHeading);

            if (currentPath.length > 1) segments.push({ points: [...currentPath] });
            currentPath = [offsetPoint(state.pos, f)];
        } else if (cmd.type === 'lt' || cmd.type === 'rt') {
            const angle = (cmd.value as number) * (Math.PI / 180);
            const rotateAngle = cmd.type === 'lt' ? angle : -angle;
            const f = faces.find(face => face.index === state.faceIndex);
            if (f) state.heading.applyAxisAngle(f.normal, rotateAngle);
        } else if (cmd.type === 'fd' || cmd.type === 'bk') {
            const dist = cmd.type === 'fd' ? (cmd.value as number) : -(cmd.value as number);
            const moveError = moveTurtle(state, dist, faces, currentPath, edgeRolls);
            if (moveError) {
                error = { message: moveError, lineNumber: cmd.lineNumber };
                break; // Stop processing further commands
            }
        }
    }

    if (currentPath.length > 1) segments.push({ points: currentPath });

    return { segments, edgeRolls, error };
}

function moveTurtle(state: TurtleState, distance: number, faces: FaceData[], currentPath: Vector3[], edgeRolls: EdgeRoll[]): string | null {
    let remaining = Math.abs(distance);
    const sign = Math.sign(distance);

    let iterations = 0;
    const MAX_ITERATIONS = 100;

    while (remaining > 0.0001 && iterations < MAX_ITERATIONS) {
        iterations++;
        const moveHeading = state.heading.clone().multiplyScalar(sign);
        const f = faces.find(face => face.index === state.faceIndex);
        if (!f) break;

        // Find closest vertex and edge intersections
        const vertexHit = findVertexHit(f, state.pos, moveHeading);
        const edgeHit = findEdgeHit(f, state.pos, moveHeading);

        // VERTEX CROSSING: hit vertex before edge - stop the path
        if (vertexHit && vertexHit.t <= (edgeHit?.t ?? Infinity) && vertexHit.t < remaining) {
            // Move to vertex and stop
            state.pos.add(moveHeading.clone().multiplyScalar(vertexHit.t));
            currentPath.push(offsetPoint(state.pos, f));
            return 'Path reached a vertex';
        }
        // EDGE CROSSING: normal edge hit
        else if (edgeHit && edgeHit.t < remaining) {
            state.pos.add(moveHeading.clone().multiplyScalar(edgeHit.t));
            currentPath.push(offsetPoint(state.pos, f));
            remaining -= edgeHit.t;

            const v1 = f.vertices[edgeHit.edgeIndex];
            const v2 = f.vertices[(edgeHit.edgeIndex + 1) % f.vertices.length];

            const neighbor = getAdjacentFace(faces, f, v1, v2);
            if (neighbor) {
                // Record the edge roll before crossing
                edgeRolls.push({
                    faceIndex: f.index,
                    toFaceIndex: neighbor.index,
                    edgeIndex: edgeHit.edgeIndex,
                    sequence: edgeRolls.length
                });

                crossEdge(state, f, neighbor, v1, v2);
                currentPath.push(offsetPoint(state.pos, neighbor));
            } else {
                return null;
            }
        }
        // No crossing - move freely within face
        else {
            state.pos.add(moveHeading.clone().multiplyScalar(remaining));
            currentPath.push(offsetPoint(state.pos, f));
            remaining = 0;
        }
    }

    return null;
}

/**
 * Find the closest vertex hit along the movement path.
 */
function findVertexHit(
    face: FaceData,
    pos: Vector3,
    heading: Vector3
): { t: number; vertex: Vector3; index: number } | null {
    const VERTEX_THRESHOLD = 0.05;
    let best: { t: number; vertex: Vector3; index: number } | null = null;

    for (let i = 0; i < face.vertices.length; i++) {
        const vertex = face.vertices[i];
        const toVertex = vertex.clone().sub(pos);
        const projLen = toVertex.dot(heading);

        if (projLen > 0) {
            const closestPoint = pos.clone().add(heading.clone().multiplyScalar(projLen));
            const dist = closestPoint.distanceTo(vertex);

            if (dist < VERTEX_THRESHOLD && (!best || projLen < best.t)) {
                best = { t: projLen, vertex, index: i };
            }
        }
    }
    return best;
}

/**
 * Find the closest edge intersection along the movement path.
 */
function findEdgeHit(
    face: FaceData,
    pos: Vector3,
    heading: Vector3
): { t: number; edgeIndex: number } | null {
    let best: { t: number; edgeIndex: number } | null = null;

    for (let i = 0; i < face.vertices.length; i++) {
        const v1 = face.vertices[i];
        const v2 = face.vertices[(i + 1) % face.vertices.length];
        const edgeDir = v2.clone().sub(v1).normalize();
        const edgeOutNormal = new Vector3().crossVectors(edgeDir, face.normal).normalize();

        const denominator = heading.dot(edgeOutNormal);
        if (denominator > 0.0001) {
            const distToPlane = pos.clone().sub(v1).dot(edgeOutNormal);
            const t = -distToPlane / denominator;

            if (t > -0.0001 && (!best || t < best.t)) {
                best = { t, edgeIndex: i };
            }
        }
    }
    return best;
}

export function extractEdgeCrossings(shape: ShapeType, segments: PathSegment[]): EdgeCrossing[] {
    const definition = getPolyhedron(shape);
    const faces = definition.getFaces();
    const crossings: EdgeCrossing[] = [];

    // Special handling for doubly covered polygons (degenerate polyhedra)
    const isDoublyCovered = definition.faceCount === 2 && Math.abs(definition.dihedralAngle) < 0.01;

    if (isDoublyCovered) {
        // For DC polygons, detect when the path crosses polygon edges
        // Face 1 and Face 2 share the same vertices (in opposite winding order)
        const face1 = faces[0];
        const face2 = faces[1];

        // Track current face (starts on Face 1)
        let currentFace = face1;

        segments.forEach((segment, segmentIndex) => {
            for (let i = 0; i < segment.points.length - 1; i++) {
                const p1 = segment.points[i];
                const p2 = segment.points[i + 1];

                // Build edge list from CURRENT face (not always Face 1)
                const currentFaceEdges: Array<{v1: Vector3, v2: Vector3, edgeIndex: number}> = [];
                for (let edgeIdx = 0; edgeIdx < currentFace.vertices.length; edgeIdx++) {
                    const v1 = currentFace.vertices[edgeIdx];
                    const v2 = currentFace.vertices[(edgeIdx + 1) % currentFace.vertices.length];
                    currentFaceEdges.push({ v1, v2, edgeIndex: edgeIdx });
                }

                // Check if line segment (p1, p2) crosses any edge of the CURRENT face
                for (const edge of currentFaceEdges) {
                    if (lineSegmentsIntersect2D(p1, p2, edge.v1, edge.v2)) {
                        const nextFace = currentFace.index === 1 ? face2 : face1;

                        crossings.push({
                            fromFaceIndex: currentFace.index,
                            toFaceIndex: nextFace.index,
                            edgeIndex: edge.edgeIndex,
                            crossingPoint: p2.clone(),
                            segmentIndex,
                            pointIndexInSegment: i + 1
                        });

                        // Flip to the other face
                        currentFace = nextFace;
                        break; // Only record one crossing per line segment
                    }
                }
            }
        });
    } else {
        // Standard 3D polyhedra: detect face transitions
        segments.forEach((segment, segmentIndex) => {
            for (let i = 0; i < segment.points.length - 1; i++) {
                const p1 = segment.points[i];
                const p2 = segment.points[i + 1];

                // Determine which faces these points belong to
                const face1 = findClosestFace(p1, faces);
                const face2 = findClosestFace(p2, faces);

                if (face1 && face2 && face1.index !== face2.index) {
                    // Found a face transition - find the shared edge
                    const sharedEdge = findSharedEdge(face1, face2);
                    if (sharedEdge) {
                        // Find which edge index of face1 contains these vertices
                        let edgeIndex = -1;
                        for (let ei = 0; ei < face1.vertices.length; ei++) {
                            const v1 = face1.vertices[ei];
                            const v2 = face1.vertices[(ei + 1) % face1.vertices.length];

                            // Check if this edge matches the shared edge (either direction)
                            const matchesForward = v1.distanceTo(sharedEdge.v1) < 0.01 && v2.distanceTo(sharedEdge.v2) < 0.01;
                            const matchesReverse = v1.distanceTo(sharedEdge.v2) < 0.01 && v2.distanceTo(sharedEdge.v1) < 0.01;

                            if (matchesForward || matchesReverse) {
                                edgeIndex = ei;
                                break;
                            }
                        }

                        if (edgeIndex >= 0) {
                            crossings.push({
                                fromFaceIndex: face1.index,
                                toFaceIndex: face2.index,
                                edgeIndex,
                                crossingPoint: p2.clone(),
                                segmentIndex,
                                pointIndexInSegment: i + 1
                            });
                        }
                    }
                }
            }
        });
    }

    return crossings;
}

// Helper function to check if two 2D line segments intersect (ignoring Y coordinate)
function lineSegmentsIntersect2D(p1: Vector3, p2: Vector3, v1: Vector3, v2: Vector3): boolean {
    // Project to XZ plane
    const x1 = p1.x, z1 = p1.z;
    const x2 = p2.x, z2 = p2.z;
    const x3 = v1.x, z3 = v1.z;
    const x4 = v2.x, z4 = v2.z;

    const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return false; // Parallel or coincident

    const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / denom;

    return t > 0 && t <= 1 && u > 0 && u <= 1;
}

function findClosestFace(point: Vector3, faces: FaceData[]): FaceData | null {
    let closestFace: FaceData | null = null;
    let minDist = Infinity;

    faces.forEach(face => {
        const dist = point.distanceTo(face.center);
        if (dist < minDist) {
            minDist = dist;
            closestFace = face;
        }
    });

    return closestFace;
}

function findSharedEdge(face1: FaceData, face2: FaceData): { v1: Vector3, v2: Vector3 } | null {
    for (let i = 0; i < face1.vertices.length; i++) {
        const v1 = face1.vertices[i];
        const v2 = face1.vertices[(i + 1) % face1.vertices.length];

        // Check if face2 has both vertices
        const hasV1 = face2.vertices.some(v => v.distanceTo(v1) < 0.01);
        const hasV2 = face2.vertices.some(v => v.distanceTo(v2) < 0.01);

        if (hasV1 && hasV2) {
            return { v1, v2 };
        }
    }
    return null;
}

export function generateFlatPath(shape: ShapeType, commands: TurtleCommand[]): PathSegment[] {
    const definition = getPolyhedron(shape);
    const faces = definition.getFaces();
    const startFace = faces.find((f: FaceData) => f.index === 1);
    if (!startFace) return [];

    // Calculate the same local heading as in the 3D path
    const midPointFirstEdge = new Vector3().addVectors(startFace.vertices[0], startFace.vertices[1]).multiplyScalar(0.5);
    const localHeading = new Vector3().subVectors(midPointFirstEdge, startFace.center).normalize();

    // Determine the initial orientation of the polyhedron
    const quat = definition.initialQuaternion.clone();

    // Transform local heading to world space. 
    // Since Face 1 is initially on the floor (pointing down), this heading will be in the XZ plane.
    const worldHeading = localHeading.clone().applyQuaternion(quat).normalize();
    const worldNormal = new Vector3(0, -1, 0); // Face 1 normal in world space (Down)

    // Start slightly above the floor
    const startPos = new Vector3(0, 0.02, 0);
    
    let state = {
        pos: startPos.clone(),
        heading: worldHeading.clone()
    };

    const segments: PathSegment[] = [];
    let currentPath: Vector3[] = [state.pos.clone()];

    commands.forEach(cmd => {
        if (cmd.type === 'start') {
             const [x, y] = cmd.value as [number, number];
             
             // Reset heading for 'start' command, matching 3D logic
             state.heading = worldHeading.clone();
             const right = state.heading.clone().cross(worldNormal).normalize(); 

             state.pos.copy(startPos)
                .add(state.heading.clone().multiplyScalar(x))
                .add(right.multiplyScalar(y));

             if (currentPath.length > 0) segments.push({ points: [...currentPath] });
             currentPath = [state.pos.clone()];

        } else if (cmd.type === 'lt' || cmd.type === 'rt') {
            const val = cmd.value as number;
            // Rotate around the world normal (Down) to match the face orientation
            const angle = (cmd.type === 'lt' ? val : -val) * Math.PI / 180;
            state.heading.applyAxisAngle(worldNormal, angle);
        } else if (cmd.type === 'fd' || cmd.type === 'bk') {
            const dist = cmd.type === 'fd' ? (cmd.value as number) : -(cmd.value as number);
            state.pos.add(state.heading.clone().multiplyScalar(dist));
            currentPath.push(state.pos.clone());
        }
    });
    
    if (currentPath.length > 0) segments.push({ points: currentPath });
    return segments;
}