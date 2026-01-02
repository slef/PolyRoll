import { Vector3, Quaternion, Plane } from 'three';
import { 
    ShapeType, PathSegment, TurtleState, TurtleCommand 
} from '../types';
import { 
    CUBE_FACE_CENTERS, CUBE_VERTICES, CUBE_INRADIUS,
    OCT_FACE_CENTERS, OCTAHEDRON_RADIUS, OCT_INRADIUS,
    ICO_FACE_CENTERS, ICO_VERTICES_RAW, ICO_INDICES, ICO_INRADIUS,
    INITIAL_QUATERNION_OCT, INITIAL_QUATERNION_CUBE, INITIAL_QUATERNION_ICO
} from '../constants';

interface FaceData {
    index: number;
    center: Vector3;
    normal: Vector3;
    vertices: Vector3[];
}

function getFaces(shape: ShapeType): FaceData[] {
    if (shape === 'cube') {
        return CUBE_FACE_CENTERS.map((c, i) => {
            const normal = c.clone().normalize();
            // Robust sorting using ATAN2 around the face normal
            const center = c.clone().multiplyScalar(CUBE_INRADIUS);
            const faceVerts = CUBE_VERTICES.filter(v => v.dot(normal) > 0.1);
            
            // Create a local coordinate system for the face
            const up = Math.abs(normal.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
            const tangent = new Vector3().crossVectors(normal, up).normalize();
            const bitangent = new Vector3().crossVectors(normal, tangent).normalize();

            const sorted = [...faceVerts].sort((a, b) => {
                const da = a.clone().sub(center);
                const db = b.clone().sub(center);
                const angleA = Math.atan2(da.dot(bitangent), da.dot(tangent));
                const angleB = Math.atan2(db.dot(bitangent), db.dot(tangent));
                return angleA - angleB;
            });

            return { index: i + 1, center, normal, vertices: sorted };
        });
    } else if (shape === 'octahedron') {
        const R = OCTAHEDRON_RADIUS;
        return OCT_FACE_CENTERS.map((normal, i) => {
            const n = normal.clone().normalize();
            const v1 = new Vector3(Math.sign(normal.x) * R, 0, 0);
            const v2 = new Vector3(0, Math.sign(normal.y) * R, 0);
            const v3 = new Vector3(0, 0, Math.sign(normal.z) * R);
            const cp = new Vector3().subVectors(v2, v1).cross(new Vector3().subVectors(v3, v1));
            // Ensure CCW winding
            const vertices = cp.dot(n) < 0 ? [v1, v3, v2] : [v1, v2, v3];
            return { index: i + 1, center: n.clone().multiplyScalar(OCT_INRADIUS), normal: n, vertices };
        });
    } else {
        const faces: FaceData[] = [];
        for (let i = 0; i < ICO_INDICES.length; i += 3) {
            const v1 = ICO_VERTICES_RAW[ICO_INDICES[i]];
            const v2 = ICO_VERTICES_RAW[ICO_INDICES[i+1]];
            const v3 = ICO_VERTICES_RAW[ICO_INDICES[i+2]];
            const center = new Vector3().add(v1).add(v2).add(v3).divideScalar(3);
            const normal = center.clone().normalize();
            faces.push({ index: i / 3 + 1, center, normal, vertices: [v1, v2, v3] });
        }
        return faces;
    }
}

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
    const faces = getFaces(shape);
    
    // Always start on Face 1
    const startFace = faces.find(f => f.index === 1);

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

export function generateFlatPath(shape: ShapeType, commands: TurtleCommand[]): PathSegment[] {
    const faces = getFaces(shape);
    const startFace = faces.find(f => f.index === 1);
    if (!startFace) return [];

    // Calculate the same local heading as in the 3D path
    const midPointFirstEdge = new Vector3().addVectors(startFace.vertices[0], startFace.vertices[1]).multiplyScalar(0.5);
    const localHeading = new Vector3().subVectors(midPointFirstEdge, startFace.center).normalize();

    // Determine the initial orientation of the polyhedron
    let quat = new Quaternion();
    if (shape === 'octahedron') quat.copy(INITIAL_QUATERNION_OCT);
    else if (shape === 'cube') quat.copy(INITIAL_QUATERNION_CUBE);
    else quat.copy(INITIAL_QUATERNION_ICO);

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