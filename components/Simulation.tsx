import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Matrix4, Group, Color } from 'three';
import * as THREE from 'three';
import { Text, useCursor, Line } from '@react-three/drei';
import { TRIANGLE_SIDE, EDGE_LENGTH } from '../constants';
import { RollTarget, ShapeType, PathSegment } from '../types';
import { getPolyhedron, PolyhedronDefinition } from '../polyhedra';

interface SimulationProps {
  shape: ShapeType;
  position: Vector3;
  quaternion: Quaternion;
  pathSegments?: PathSegment[];
  flatPathSegments?: PathSegment[];
  onRollComplete: (newPos: Vector3, newQuat: Quaternion, moveLabel: string, delta: {u: number, v: number}, faceIndex: number) => void;
}

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

  // Get polyhedron definition from registry
  const definition = getPolyhedron(shape);
  const rollAngle = definition.rollAngle;
  const faceCenters = definition.faceCenters;

  useEffect(() => {
    if (!isRolling && meshRef.current) {
        meshRef.current.position.copy(position);
        meshRef.current.quaternion.copy(quaternion);
        updateTargets(position, quaternion);
    }
  }, [position, quaternion, isRolling, shape]);

  const updateTargets = (pos: Vector3, quat: Quaternion) => {
    const matrix = new Matrix4().compose(pos, quat, new Vector3(1, 1, 1));
    const localVertices = definition.getVertices();

    const worldVertices = localVertices.map(v => v.clone().applyMatrix4(matrix));
    const sorted = [...worldVertices].map((v, i) => ({ v, i })).sort((a, b) => a.v.y - b.v.y);
    const groundCount = definition.getBottomVertexCount();
    const bottomVertices = sorted.slice(0, groundCount).map(item => item.v);

    const newTargets: RollTarget[] = [];
    const edges: {start: Vector3, end: Vector3}[] = [];

    if (groundCount === 4) {
        // Cube: 4 bottom vertices
        for(let i=0; i<4; i++) {
            for(let j=i+1; j<4; j++) {
                if(bottomVertices[i].distanceTo(bottomVertices[j]) < EDGE_LENGTH * 1.05) {
                    edges.push({start: bottomVertices[i], end: bottomVertices[j]});
                }
            }
        }
    } else {
        // Triangular base (octahedron, icosahedron): 3 bottom vertices
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
    const { label, delta } = definition.getMoveData(target.directionAngle);
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
            <PolyhedronMesh definition={definition} />
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
            <InteractionZone key={i} target={target} isSquare={definition.latticeType === 'square'} onClick={() => handleRoll(target)} />
        ))}
    </group>
  );
};

// Unified PolyhedronMesh component
const PolyhedronMesh: React.FC<{ definition: PolyhedronDefinition }> = ({ definition }) => {
  const geometry = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const faces = definition.getFaces();

    faces.forEach((face) => {
      const faceColor = new Color(definition.getFaceColor(face.index - 1));
      const verts = face.vertices;

      // Triangulate: split into triangles
      if (verts.length === 3) {
        // Already a triangle
        verts.forEach((v) => {
          pos.push(v.x, v.y, v.z);
          col.push(faceColor.r, faceColor.g, faceColor.b);
        });
      } else if (verts.length === 4) {
        // Quad: split into 2 triangles (0,1,2) and (0,2,3)
        const triangleVerts = [verts[0], verts[1], verts[2], verts[0], verts[2], verts[3]];
        triangleVerts.forEach((v) => {
          if (v) {
            pos.push(v.x, v.y, v.z);
            col.push(faceColor.r, faceColor.g, faceColor.b);
          }
        });
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    return geom;
  }, [definition]);

  // Get yellow points for cube (if available)
  const yellowPoints = definition.getYellowPoints?.() || [];

  return (
    <group>
      {/* Main mesh */}
      <mesh castShadow receiveShadow geometry={geometry}>
        <meshStandardMaterial vertexColors roughness={0.5} />
      </mesh>

      {/* Vertices */}
      {definition.vertices.map((v, i) => (
        <mesh key={`v-${i}`} position={v} castShadow>
          <sphereGeometry args={[definition.vertexSphereRadius, 16, 16]} />
          <meshStandardMaterial color={definition.getVertexColor(i)} roughness={0.2} metalness={0.2} />
        </mesh>
      ))}

      {/* Yellow points (cube only) */}
      {yellowPoints.map((p, i) => (
        <mesh key={`yp-${i}`} position={p}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      ))}

      {/* Face labels */}
      {definition.faceCenters.map((vec, i) => {
        const normal = vec.clone().normalize();
        const pos = normal.clone().multiplyScalar(definition.inradius * 1.01);
        const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
        return (
          <group key={i} position={pos} quaternion={quaternion}>
            <Text
              fontSize={definition.faceLabelSize}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={definition.faceLabelSize === 0.2 ? 0.015 : 0.02}
              outlineColor="#000000"
            >
              {i + 1}
            </Text>
          </group>
        );
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