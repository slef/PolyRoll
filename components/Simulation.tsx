import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Matrix4, Group, Color } from 'three';
import { Text, useCursor, Line } from '@react-three/drei';
import { 
    OCT_ROLL_ANGLE,
    ICO_ROLL_ANGLE,
    CUBE_ROLL_ANGLE,
    OCTAHEDRON_RADIUS,
    OCT_INRADIUS,
    ICO_INRADIUS,
    CUBE_INRADIUS,
    TRIANGLE_SIDE,
    EDGE_LENGTH,
    getMoveData,
    OCT_FACE_CENTERS,
    OCT_FACE_PALETTE,
    ICO_FACE_PALETTE,
    CUBE_FACE_PALETTE,
    CUBE_FACE_CENTERS,
    CUBE_VERTICES,
    VERTEX_COLORS,
    ICO_VERTICES_RAW,
    ICO_INDICES,
    ICO_FACE_CENTERS,
    ICO_FACE_COLORS_INDICES,
    ICO_VERTEX_COLORS_INDICES
} from '../constants';
import { RollTarget, ShapeType, PathSegment } from '../types';

interface SimulationProps {
  shape: ShapeType;
  position: Vector3;
  quaternion: Quaternion;
  pathSegments?: PathSegment[];
  flatPathSegments?: PathSegment[];
  onRollComplete: (newPos: Vector3, newQuat: Quaternion, moveLabel: string, delta: {u: number, v: number}, faceIndex: number) => void;
}

const getVertexColorIdx = (v: Vector3) => {
    const sX = Math.sign(v.x);
    const sY = Math.sign(v.y);
    const sZ = Math.sign(v.z);
    return Math.floor((sX + sY + sZ + 3) / 2) % 2;
};

export const Simulation: React.FC<SimulationProps> = ({ shape, position, quaternion, pathSegments = [], flatPathSegments = [], onRollComplete }) => {
  const meshRef = useRef<Group>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [targets, setTargets] = useState<RollTarget[]>([]);

  const rollStartPos = useRef(new Vector3());
  const rollStartQuat = useRef(new Quaternion());
  const rollAxis = useRef(new Vector3());
  const rollPivot = useRef(new Vector3());
  const rollProgress = useRef(0);
  const ROLL_DURATION = 0.4;
  const pendingMove = useRef<{label: string, delta: {u: number, v: number}} | null>(null);

  const rollAngle = shape === 'octahedron' ? OCT_ROLL_ANGLE : shape === 'cube' ? CUBE_ROLL_ANGLE : ICO_ROLL_ANGLE;
  const faceCenters = shape === 'octahedron' ? OCT_FACE_CENTERS : shape === 'cube' ? CUBE_FACE_CENTERS : ICO_FACE_CENTERS;

  useEffect(() => {
    if (!isRolling && meshRef.current) {
        meshRef.current.position.copy(position);
        meshRef.current.quaternion.copy(quaternion);
        updateTargets(position, quaternion);
    }
  }, [position, quaternion, isRolling, shape]);

  const updateTargets = (pos: Vector3, quat: Quaternion) => {
    const matrix = new Matrix4().compose(pos, quat, new Vector3(1, 1, 1));
    let localVertices: Vector3[] = [];

    if (shape === 'octahedron') {
        localVertices = [
            new Vector3(1, 0, 0), new Vector3(-1, 0, 0), 
            new Vector3(0, 1, 0), new Vector3(0, -1, 0), 
            new Vector3(0, 0, 1), new Vector3(0, 0, -1)
        ].map(v => v.multiplyScalar(OCTAHEDRON_RADIUS));
    } else if (shape === 'cube') {
        localVertices = CUBE_VERTICES;
    } else {
        localVertices = ICO_VERTICES_RAW;
    }

    const worldVertices = localVertices.map(v => v.clone().applyMatrix4(matrix));
    const sorted = [...worldVertices].map((v, i) => ({ v, i })).sort((a, b) => a.v.y - b.v.y);
    const groundCount = shape === 'cube' ? 4 : 3;
    const bottomVertices = sorted.slice(0, groundCount).map(item => item.v);

    const newTargets: RollTarget[] = [];
    const edges: {start: Vector3, end: Vector3}[] = [];
    
    if (shape === 'cube') {
        for(let i=0; i<4; i++) {
            for(let j=i+1; j<4; j++) {
                if(bottomVertices[i].distanceTo(bottomVertices[j]) < EDGE_LENGTH * 1.05) {
                    edges.push({start: bottomVertices[i], end: bottomVertices[j]});
                }
            }
        }
    } else {
        edges.push({ start: bottomVertices[0], end: bottomVertices[1] });
        edges.push({ start: bottomVertices[1], end: bottomVertices[2] });
        edges.push({ start: bottomVertices[2], end: bottomVertices[0] });
    }

    edges.forEach((edge) => {
        const pivot = new Vector3().addVectors(edge.start, edge.end).multiplyScalar(0.5);
        const currentFloorCenter = new Vector3(pos.x, 0, pos.z);
        const toPivot = new Vector3().subVectors(pivot, currentFloorCenter); 
        const rollDirection = toPivot.clone().normalize();
        const axis = new Vector3(0, 1, 0).cross(rollDirection).normalize();
        const targetCenter = new Vector3().addVectors(currentFloorCenter, toPivot.clone().multiplyScalar(2));
        
        newTargets.push({
            axis,
            point: pivot,
            targetCenter,
            directionAngle: Math.atan2(toPivot.z, toPivot.x)
        });
    });

    setTargets(newTargets);
  };

  const calculateFaceIndex = (quat: Quaternion) => {
    let bestDot = -1;
    let faceIndex = 0;
    faceCenters.forEach((local, idx) => {
        const worldNormal = local.clone().normalize().applyQuaternion(quat);
        const dot = worldNormal.dot(new Vector3(0, -1, 0)); 
        if (dot > bestDot) {
            bestDot = dot;
            faceIndex = idx;
        }
    });
    return faceIndex + 1;
  };

  const handleRoll = (target: RollTarget) => {
    if (isRolling || !meshRef.current) return;
    setIsRolling(true);
    const { label, delta } = getMoveData(target.directionAngle, shape === 'cube');
    pendingMove.current = { label, delta };
    rollStartPos.current.copy(meshRef.current.position);
    rollStartQuat.current.copy(meshRef.current.quaternion);
    rollAxis.current.copy(target.axis);
    rollPivot.current.copy(target.point);
    rollProgress.current = 0;
  };

  useFrame((state, delta) => {
    if (isRolling && meshRef.current) {
        rollProgress.current += delta / ROLL_DURATION;
        if (rollProgress.current >= 1) rollProgress.current = 1;

        const t = rollProgress.current;
        const easedT = t * (2 - t);
        const angle = easedT * rollAngle;
        const qRot = new Quaternion().setFromAxisAngle(rollAxis.current, angle);
        const newQuat = qRot.clone().multiply(rollStartQuat.current);
        const vecToCenter = new Vector3().subVectors(rollStartPos.current, rollPivot.current);
        vecToCenter.applyQuaternion(qRot);
        const newPos = new Vector3().addVectors(rollPivot.current, vecToCenter);
        
        meshRef.current.position.copy(newPos);
        meshRef.current.quaternion.copy(newQuat);
        
        if (rollProgress.current === 1) {
            setIsRolling(false);
            const finalFace = calculateFaceIndex(newQuat);
            if (pendingMove.current) {
                onRollComplete(newPos, newQuat, pendingMove.current.label, pendingMove.current.delta, finalFace);
            }
        }
    }
  });

  return (
    <group>
        <group ref={meshRef} position={position} quaternion={quaternion}>
            {shape === 'octahedron' ? <OctahedronMesh /> : shape === 'cube' ? <CubeMesh /> : <IcosahedronMesh />}
            {pathSegments.map((segment, i) => (
                <Line
                    key={`mesh-path-${i}`}
                    points={segment.points}
                    color="#00008B"
                    lineWidth={5}
                    transparent
                    opacity={1}
                    depthTest={true}
                />
            ))}
        </group>
        {flatPathSegments.map((segment, i) => (
            <Line
                key={`flat-path-${i}`}
                points={segment.points}
                color="#8B0000"
                lineWidth={5}
                transparent
                opacity={0.8}
                depthTest={true}
            />
        ))}
        {!isRolling && targets.map((target, i) => (
            <InteractionZone key={i} target={target} isSquare={shape === 'cube'} onClick={() => handleRoll(target)} />
        ))}
    </group>
  );
};

const CubeMesh = () => {
    const yellowPoints = useMemo(() => {
        const points: Vector3[] = [];
        const edges = [
            [0, 1], [1, 2], [2, 3], [3, 0], // Bottom (-z)
            [4, 5], [5, 6], [6, 7], [7, 4], // Top (+z)
            [0, 4], [1, 5], [2, 6], [3, 7]  // Vertical
        ];

        CUBE_FACE_CENTERS.forEach((center) => {
            const normal = center.clone().normalize();
            const facePos = center.clone().multiplyScalar(CUBE_INRADIUS);
            const faceVertIndices: number[] = [];
            CUBE_VERTICES.forEach((v, idx) => {
                if (v.dot(normal) > 0.1) faceVertIndices.push(idx);
            });

            edges.forEach(([i, j]) => {
                if (faceVertIndices.includes(i) && faceVertIndices.includes(j)) {
                    [[i, j], [j, i]].forEach(([startIdx, endIdx]) => {
                        const start = CUBE_VERTICES[startIdx];
                        const end = CUBE_VERTICES[endIdx];
                        if (getVertexColorIdx(start) === 1 && getVertexColorIdx(end) === 0) {
                            const vStart = start.clone().sub(facePos);
                            const vEnd = end.clone().sub(facePos);
                            const cross = new Vector3().crossVectors(vStart, vEnd);
                            if (cross.dot(normal) > 0) {
                                const mid = new Vector3().addVectors(start, end).multiplyScalar(0.5);
                                const toCenter = new Vector3().subVectors(facePos, mid);
                                points.push(mid.clone().add(toCenter.multiplyScalar(0.5)));
                            }
                        }
                    });
                }
            });
        });
        return points;
    }, []);

    return (
        <group>
            {CUBE_FACE_CENTERS.map((normal, i) => {
                const pos = normal.clone().multiplyScalar(CUBE_INRADIUS);
                const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
                return (
                    <group key={i}>
                        <mesh position={pos} quaternion={quat} castShadow receiveShadow>
                            <planeGeometry args={[EDGE_LENGTH, EDGE_LENGTH]} />
                            <meshStandardMaterial color={CUBE_FACE_PALETTE[i]} roughness={0.5} />
                        </mesh>
                        <group position={normal.clone().multiplyScalar(CUBE_INRADIUS * 1.01)} quaternion={quat}>
                            <Text fontSize={0.3} color="white" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">
                                {i + 1}
                            </Text>
                        </group>
                    </group>
                );
            })}
            {CUBE_VERTICES.map((v, i) => (
                <mesh key={i} position={v} castShadow>
                    <sphereGeometry args={[0.07, 16, 16]} />
                    <meshStandardMaterial color={VERTEX_COLORS[getVertexColorIdx(v)]} roughness={0.2} metalness={0.2} />
                </mesh>
            ))}
            {yellowPoints.map((p, i) => (
                <mesh key={`yp-${i}`} position={p}>
                    <sphereGeometry args={[0.045, 12, 12]} />
                    <meshBasicMaterial color="#facc15" />
                </mesh>
            ))}
        </group>
    );
};

const IcosahedronMesh = () => {
    const { positions, colors } = useMemo(() => {
        const pos: number[] = [], col: number[] = [];
        const palette = ICO_FACE_PALETTE.map(c => new Color(c));
        for (let i = 0; i < ICO_INDICES.length; i += 3) {
            const i1 = ICO_INDICES[i], i2 = ICO_INDICES[i+1], i3 = ICO_INDICES[i+2];
            const v1 = ICO_VERTICES_RAW[i1], v2 = ICO_VERTICES_RAW[i2], v3 = ICO_VERTICES_RAW[i3];
            pos.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
            const faceIdx = i / 3;
            const c = palette[ICO_FACE_COLORS_INDICES[faceIdx]];
            for(let k=0; k<3; k++) col.push(c.r, c.g, c.b);
        }
        return { positions: new Float32Array(pos), colors: new Float32Array(col) };
    }, []);

    return (
        <group>
            <mesh castShadow receiveShadow>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={positions.length/3} array={positions} itemSize={3} />
                    <bufferAttribute attach="attributes-color" count={colors.length/3} array={colors} itemSize={3} />
                </bufferGeometry>
                <meshStandardMaterial vertexColors roughness={0.5} />
            </mesh>
            {ICO_VERTICES_RAW.map((v, i) => (
                <mesh key={`v-${i}`} position={v} castShadow>
                    <sphereGeometry args={[0.07, 16, 16]} />
                    <meshStandardMaterial color={VERTEX_COLORS[ICO_VERTEX_COLORS_INDICES[i]]} roughness={0.2} metalness={0.2} />
                </mesh>
            ))}
            {ICO_FACE_CENTERS.map((vec, i) => {
                 const normal = vec.clone().normalize();
                 const pos = normal.clone().multiplyScalar(ICO_INRADIUS * 1.01);
                 const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
                 return (
                     <group key={i} position={pos} quaternion={quaternion}>
                        <Text fontSize={0.2} color="white" anchorX="center" anchorY="middle" outlineWidth={0.015} outlineColor="#000000">{i + 1}</Text>
                     </group>
                 )
            })}
        </group>
    );
};

const OctahedronMesh = () => {
    const { positions, colors } = useMemo(() => {
        const pos: number[] = [], col: number[] = [];
        const c1 = new Color(OCT_FACE_PALETTE[0]), c2 = new Color(OCT_FACE_PALETTE[1]);
        OCT_FACE_CENTERS.forEach((normal, i) => {
            const negatives = (normal.x < 0 ? 1 : 0) + (normal.y < 0 ? 1 : 0) + (normal.z < 0 ? 1 : 0);
            const color = negatives % 2 === 0 ? c1 : c2;
            const R = OCTAHEDRON_RADIUS;
            const v1 = new Vector3(Math.sign(normal.x) * R, 0, 0), v2 = new Vector3(0, Math.sign(normal.y) * R, 0), v3 = new Vector3(0, 0, Math.sign(normal.z) * R);
            const e1 = new Vector3().subVectors(v2, v1), e2 = new Vector3().subVectors(v3, v1), cp = new Vector3().crossVectors(e1, e2);
            if (cp.dot(normal) < 0) pos.push(v1.x, v1.y, v1.z, v3.x, v3.y, v3.z, v2.x, v2.y, v2.z);
            else pos.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
            for(let k=0; k<3; k++) col.push(color.r, color.g, color.b);
        });
        return { positions: new Float32Array(pos), colors: new Float32Array(col) };
    }, []);

    const vertices = [
        { pos: new Vector3(OCTAHEDRON_RADIUS, 0, 0), color: VERTEX_COLORS[0] }, { pos: new Vector3(-OCTAHEDRON_RADIUS, 0, 0), color: VERTEX_COLORS[0] },
        { pos: new Vector3(0, OCTAHEDRON_RADIUS, 0), color: VERTEX_COLORS[1] }, { pos: new Vector3(0, -OCTAHEDRON_RADIUS, 0), color: VERTEX_COLORS[1] },
        { pos: new Vector3(0, 0, OCTAHEDRON_RADIUS), color: VERTEX_COLORS[2] }, { pos: new Vector3(0, 0, -OCTAHEDRON_RADIUS), color: VERTEX_COLORS[2] },
    ];

    return (
        <group>
            <mesh castShadow receiveShadow>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={positions.length/3} array={positions} itemSize={3} />
                    <bufferAttribute attach="attributes-color" count={colors.length/3} array={colors} itemSize={3} />
                </bufferGeometry>
                <meshStandardMaterial vertexColors roughness={0.5} />
            </mesh>
            {vertices.map((v, i) => (
                <mesh key={`v-${i}`} position={v.pos} castShadow>
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshStandardMaterial color={v.color} roughness={0.2} metalness={0.2} />
                </mesh>
            ))}
            {OCT_FACE_CENTERS.map((vec, i) => {
                 const normal = vec.clone().normalize();
                 const pos = normal.clone().multiplyScalar(OCT_INRADIUS * 1.01);
                 const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
                 return (
                     <group key={i} position={pos} quaternion={quaternion}>
                        <Text fontSize={0.3} color="white" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">{i + 1}</Text>
                     </group>
                 )
            })}
        </group>
    );
};

const InteractionZone: React.FC<{ target: RollTarget; isSquare: boolean; onClick: () => void }> = ({ target, isSquare, onClick }) => {
    const [hovered, setHover] = useState(false);
    useCursor(hovered);

    return (
        <group position={target.targetCenter}>
            <mesh 
                rotation={[-Math.PI / 2, 0, isSquare ? target.directionAngle : target.directionAngle + Math.PI]} 
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                onPointerOver={() => setHover(true)}
                onPointerOut={() => setHover(false)}
            >
                {isSquare ? (
                    <planeGeometry args={[EDGE_LENGTH * 0.95, EDGE_LENGTH * 0.95]} />
                ) : (
                    <circleGeometry args={[(TRIANGLE_SIDE / Math.sqrt(3)) * 0.95, 3]} />
                )}
                <meshBasicMaterial color={hovered ? "#fbbf24" : "#ffffff"} transparent opacity={hovered ? 0.6 : 0.0} depthWrite={false} side={2} />
            </mesh>
        </group>
    );
}