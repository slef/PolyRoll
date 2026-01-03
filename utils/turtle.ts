import { Vector3, Quaternion } from 'three';
import { ShapeType, PathSegment, TurtleState, TurtleCommand, EdgeCrossing } from '../types';
import { getPolyhedron, FaceData } from '../polyhedra';

export function parseCommands(text: string): TurtleCommand[] {
    const lines = text.split('\n');
    const cmds: TurtleCommand[] = [];
    lines.forEach(line => {
        const parts = line.trim().toLowerCase().split(/\s+/);
        if (parts.length < 2) return;
        const cmd = parts[0];
        const val = parseFloat(parts[1]);
        if (cmd === 'start' && parts.length >= 3) {
            cmds.push({ type: 'start', value: [parseFloat(parts[1]), parseFloat(parts[2])] });
        } else if (['fd', 'bk', 'lt', 'rt'].includes(cmd)) {
            cmds.push({ type: cmd as any, value: isNaN(val) ? 0 : val });
        }
    });
    return cmds;
}

function offsetPoint(pos: Vector3, face: FaceData): Vector3 {
    return pos.clone().add(face.normal.clone().multiplyScalar(0.015));
}

export function generatePath(shape: ShapeType, commands: TurtleCommand[]): PathSegment[] {
    const definition = getPolyhedron(shape);
    const faces = definition.getFaces();

    // Always start on Face 1
    const startFace = faces.find((f: FaceData) => f.index === 1);

    if (!startFace) {
        return [];
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
    let currentPath: Vector3[] = [offsetPoint(state.pos, startFace)];

    commands.forEach(cmd => {
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
            moveTurtle(state, dist, faces, currentPath);
        }
    });

    if (currentPath.length > 1) segments.push({ points: currentPath });
    
    return segments;
}

function moveTurtle(state: TurtleState, distance: number, faces: FaceData[], currentPath: Vector3[]) {
    let remaining = Math.abs(distance);
    const sign = Math.sign(distance);

    // Safety counter to prevent infinite loops in corner cases
    let iterations = 0;
    const MAX_ITERATIONS = 100;

    while (remaining > 0.0001 && iterations < MAX_ITERATIONS) {
        iterations++;
        const moveHeading = state.heading.clone().multiplyScalar(sign);
        const f = faces.find(face => face.index === state.faceIndex);
        if (!f) break;

        let bestT = Infinity;
        let bestEdgeIndex = -1;

        // Check intersection with all face edges
        for (let i = 0; i < f.vertices.length; i++) {
            const v1 = f.vertices[i];
            const v2 = f.vertices[(i + 1) % f.vertices.length];
            const edgeDir = v2.clone().sub(v1).normalize();
            
            // Normal to the edge, lying in the face plane, pointing OUTWARDS.
            // Vertices are CCW, so Cross(Edge, Normal) points Outward.
            const edgeOutNormal = new Vector3().crossVectors(edgeDir, f.normal).normalize();
            
            // We want to find t > 0 such that pos + t*heading is on the edge line
            // Denominator is dot(heading, edgeNormal). If positive, we are moving towards the edge.
            const denominator = moveHeading.dot(edgeOutNormal);
            
            if (denominator > 0.0001) {
                // Plane equation: (p - v1) . edgeOutNormal = 0
                // t = - (pos - v1) . edgeOutNormal / denominator
                const distToPlane = state.pos.clone().sub(v1).dot(edgeOutNormal);
                const t = -distToPlane / denominator;
                
                // Allow slightly negative t (precision tolerance) but prioritize smallest positive
                if (t > -0.0001 && t < bestT) {
                    bestT = t;
                    bestEdgeIndex = i;
                }
            }
        }

        if (bestT < remaining) {
            // Move to edge
            state.pos.add(moveHeading.clone().multiplyScalar(bestT));
            currentPath.push(offsetPoint(state.pos, f));
            remaining -= bestT;

            const v1 = f.vertices[bestEdgeIndex];
            const v2 = f.vertices[(bestEdgeIndex + 1) % f.vertices.length];
            
            // Find neighbor sharing this edge
            const neighbor = faces.find(nf => 
                nf.index !== f.index && 
                nf.vertices.some(nv => nv.distanceTo(v1) < 0.01) && 
                nf.vertices.some(nv => nv.distanceTo(v2) < 0.01)
            );

            if (neighbor) {
                // Calculate rotation to map heading to new face
                const edgeAxis = v2.clone().sub(v1).normalize();
                const angle = f.normal.angleTo(neighbor.normal);
                
                // Determine rotation sign using cross product
                const cross = new Vector3().crossVectors(f.normal, neighbor.normal);
                const rotationSign = cross.dot(edgeAxis) > 0 ? 1 : -1;
                const rotation = new Quaternion().setFromAxisAngle(edgeAxis, angle * rotationSign);
                
                state.heading.applyQuaternion(rotation);
                state.faceIndex = neighbor.index;

                // Nudge position slightly into the new face to avoid getting stuck on the edge
                // "Inwards" vector is perpendicular to edge, in the new face plane
                const inwards = new Vector3().crossVectors(neighbor.normal, edgeAxis).normalize();
                
                // Ensure inwards points towards center
                const toCenter = neighbor.center.clone().sub(state.pos);
                if (inwards.dot(toCenter) < 0) inwards.negate();
                
                state.pos.add(inwards.multiplyScalar(0.001));
                
                // Add the start point on the new face
                currentPath.push(offsetPoint(state.pos, neighbor));
            } else {
                // No neighbor (should not happen for closed polyhedron)
                remaining = 0;
            }
        } else {
            // Move freely within face
            state.pos.add(moveHeading.clone().multiplyScalar(remaining));
            currentPath.push(offsetPoint(state.pos, f));
            remaining = 0;
        }
    }
}

export function extractEdgeCrossings(shape: ShapeType, segments: PathSegment[]): EdgeCrossing[] {
    const definition = getPolyhedron(shape);
    const faces = definition.getFaces();
    const crossings: EdgeCrossing[] = [];

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
                    crossings.push({
                        fromFaceIndex: face1.index,
                        toFaceIndex: face2.index,
                        edgeVertex1: sharedEdge.v1,
                        edgeVertex2: sharedEdge.v2,
                        crossingPoint: p2.clone(),
                        segmentIndex,
                        pointIndexInSegment: i + 1
                    });
                }
            }
        }
    });

    return crossings;
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