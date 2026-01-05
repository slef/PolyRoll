import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Matrix4, Group, Color } from 'three';
import * as THREE from 'three';
import { Text, useCursor, Line } from '@react-three/drei';
import { TRIANGLE_SIDE, EDGE_LENGTH } from '../constants';
import { RollTarget, ShapeType, PathSegment, EdgeCrossing } from '../types';
import { getPolyhedron, PolyhedronDefinition } from '../polyhedra';

interface SimulationProps {
  shape: ShapeType;
  position: Vector3;
  quaternion: Quaternion;
  pathSegments?: PathSegment[];
  flatPathSegments?: PathSegment[];
  rollAnimationCrossings?: EdgeCrossing[];
  onRollComplete: (newPos: Vector3, newQuat: Quaternion, moveLabel: string, delta: {u: number, v: number}, faceIndex: number) => void;
  onRollAnimationComplete?: () => void;
}

export const Simulation: React.FC<SimulationProps> = ({
  shape,
  position,
  quaternion,
  pathSegments = [],
  flatPathSegments = [],
  rollAnimationCrossings = [],
  onRollComplete,
  onRollAnimationComplete
}) => {
  const meshRef = useRef<Group>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [targets, setTargets] = useState<RollTarget[]>([]);

  // Animation state for roll animation mode
  const [isRollAnimating, setIsRollAnimating] = useState(false);
  const [currentCrossingIndex, setCurrentCrossingIndex] = useState(0);
  const [animatedPathSegments, setAnimatedPathSegments] = useState<PathSegment[]>([]);
  const [animatedFlatPathSegments, setAnimatedFlatPathSegments] = useState<PathSegment[]>([]);

  const rollStartPos = useRef(new Vector3());
  const rollStartQuat = useRef(new Quaternion());
  const rollAxis = useRef(new Vector3());
  const rollPivot = useRef(new Vector3());
  const rollProgress = useRef(0);
  const ROLL_DURATION = 0.4;
  const ROLL_ANIMATION_DURATION = 1.0; // 1 second per roll for animation mode
  const pendingMove = useRef<{label: string, delta: {u: number, v: number}} | null>(null);

  // Get polyhedron definition from registry
  const definition = getPolyhedron(shape);
  const rollAngle = definition.rollAngle;
  const faceCenters = definition.faceCenters;

  // Start roll animation when crossings are provided
  useEffect(() => {
    if (rollAnimationCrossings && rollAnimationCrossings.length > 0) {
      setIsRollAnimating(true);
      setCurrentCrossingIndex(0);
      // Show full paths during animation
      setAnimatedPathSegments(pathSegments);
      setAnimatedFlatPathSegments(flatPathSegments);
    }
  }, [rollAnimationCrossings]);

  // Trigger next roll in animation sequence
  useEffect(() => {
    if (isRollAnimating && !isRolling && currentCrossingIndex < rollAnimationCrossings.length) {
      // Start the next roll after a brief delay
      const timer = setTimeout(() => {
        const crossing = rollAnimationCrossings[currentCrossingIndex];
        triggerRollForCrossing(crossing);
      }, 100);
      return () => clearTimeout(timer);
    } else if (isRollAnimating && !isRolling && currentCrossingIndex >= rollAnimationCrossings.length) {
      // Animation complete
      setIsRollAnimating(false);
      if (onRollAnimationComplete) {
        onRollAnimationComplete();
      }
    }
  }, [isRollAnimating, isRolling, currentCrossingIndex, rollAnimationCrossings]);

  useEffect(() => {
    if (!isRolling && !isRollAnimating && meshRef.current) {
        meshRef.current.position.copy(position);
        meshRef.current.quaternion.copy(quaternion);
        updateTargets(position, quaternion);
    }
  }, [position, quaternion, isRolling, isRollAnimating, shape]);

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

  const initiateRoll = (axis: Vector3, pivot: Vector3, moveData?: {label: string, delta: {u: number, v: number}}) => {
    if (!meshRef.current) return;

    setIsRolling(true);
    rollStartPos.current.copy(meshRef.current.position);
    rollStartQuat.current.copy(meshRef.current.quaternion);
    rollAxis.current.copy(axis);
    rollPivot.current.copy(pivot);
    rollProgress.current = 0;
    pendingMove.current = moveData || null;
  };

  const triggerRollForCrossing = (crossing: EdgeCrossing) => {
    if (!meshRef.current) return;

    // We need to find which edge on the bottom face corresponds to this crossing
    // Get the current world vertices
    const matrix = new Matrix4().compose(
      meshRef.current.position,
      meshRef.current.quaternion,
      new Vector3(1, 1, 1)
    );
    const localVertices = definition.getVertices();
    const worldVertices = localVertices.map(v => v.clone().applyMatrix4(matrix));

    // Transform the crossing edge vertices to world space to find matching bottom vertices
    const worldEdge1 = crossing.edgeVertex1.clone().applyMatrix4(matrix);
    const worldEdge2 = crossing.edgeVertex2.clone().applyMatrix4(matrix);

    // Find which bottom vertices match this edge
    const sorted = [...worldVertices].map((v, i) => ({ v, i })).sort((a, b) => a.v.y - b.v.y);
    const groundCount = definition.getBottomVertexCount();
    const bottomVertices = sorted.slice(0, groundCount).map(item => item.v);

    // Find the two bottom vertices that match the crossing edge
    let matchingBottomVerts: Vector3[] = [];
    for (const bv of bottomVertices) {
      if (bv.distanceTo(worldEdge1) < 0.01 || bv.distanceTo(worldEdge2) < 0.01) {
        matchingBottomVerts.push(bv);
      }
    }

    if (matchingBottomVerts.length >= 2) {
      // Use the same logic as handleRoll
      const pivot = new Vector3().addVectors(matchingBottomVerts[0], matchingBottomVerts[1]).multiplyScalar(0.5);
      const currentFloorCenter = new Vector3(meshRef.current.position.x, 0, meshRef.current.position.z);
      const toPivot = new Vector3().subVectors(pivot, currentFloorCenter);
      const rollDirection = toPivot.clone().normalize();
      const axis = new Vector3(0, 1, 0).cross(rollDirection).normalize();

      initiateRoll(axis, pivot);
    }
  };

  const handleRoll = (target: RollTarget) => {
    if (isRolling || isRollAnimating || !meshRef.current) return;
    const { label, delta } = definition.getMoveData(target.directionAngle);
    initiateRoll(target.axis, target.point, { label, delta });
  };

  useFrame((_state, delta) => {
    if (isRolling && meshRef.current) {
        const duration = isRollAnimating ? ROLL_ANIMATION_DURATION : ROLL_DURATION;
        rollProgress.current += delta / duration;
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

            if (isRollAnimating) {
              // In animation mode, just advance to next crossing
              // The paths are already fully rendered, just the polyhedron moves
              setCurrentCrossingIndex(prev => prev + 1);
            } else {
              // Regular roll mode
              const finalFace = calculateFaceIndex(newQuat);
              if (pendingMove.current) {
                  onRollComplete(newPos, newQuat, pendingMove.current.label, pendingMove.current.delta, finalFace);
              }
            }
        }
    }
  });

  const displayPathSegments = isRollAnimating ? animatedPathSegments : pathSegments;
  const displayFlatPathSegments = isRollAnimating ? animatedFlatPathSegments : flatPathSegments;

  return (
    <group>
        <group ref={meshRef} position={position} quaternion={quaternion}>
            <PolyhedronMesh definition={definition} />
            {displayPathSegments.map((segment, i) => (
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
        {displayFlatPathSegments.map((segment, i) => (
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
        {!isRolling && !isRollAnimating && targets.map((target, i) => (
            <InteractionZone key={i} target={target} latticeType={definition.latticeType} onClick={() => handleRoll(target)} />
        ))}
    </group>
  );
};

// Unified PolyhedronMesh component
const PolyhedronMesh: React.FC<{ definition: PolyhedronDefinition }> = ({ definition }) => {
  // Compute faces for both geometry and labels
  const faces = useMemo(() => definition.getFaces(), [definition]);

  const geometry = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];

    faces.forEach((face) => {
      const faceColor = new Color(definition.getFaceColor(face.index - 1));
      const verts = face.vertices;

      // Triangulate: split into triangles using fan triangulation
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
      } else {
        // N-gon (n > 4): fan triangulation from vertex 0
        // Creates triangles: (0,1,2), (0,2,3), (0,3,4), ..., (0,n-2,n-1)
        for (let i = 1; i < verts.length - 1; i++) {
          pos.push(verts[0].x, verts[0].y, verts[0].z);
          col.push(faceColor.r, faceColor.g, faceColor.b);
          pos.push(verts[i].x, verts[i].y, verts[i].z);
          col.push(faceColor.r, faceColor.g, faceColor.b);
          pos.push(verts[i + 1].x, verts[i + 1].y, verts[i + 1].z);
          col.push(faceColor.r, faceColor.g, faceColor.b);
        }
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    return geom;
  }, [faces, definition]);

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
      {faces.map((face, i) => {
        const normal = face.normal.clone().normalize();
        // Position label slightly beyond face center along normal
        const pos = face.center.clone().add(normal.clone().multiplyScalar(0.01));
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
              {face.index}
            </Text>
          </group>
        );
      })}
    </group>
  );
};

const InteractionZone: React.FC<{ target: RollTarget; latticeType: 'square' | 'triangular' | 'hexagonal'; onClick: () => void }> = ({ target, latticeType, onClick }) => {
    const [hovered, setHover] = useState(false);
    useCursor(hovered);

    return (
        <group position={target.targetCenter}>
            <mesh
                rotation={[-Math.PI / 2, 0, latticeType === 'square' ? target.directionAngle : target.directionAngle + Math.PI]}
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                onPointerOver={() => setHover(true)}
                onPointerOut={() => setHover(false)}
            >
                {latticeType === 'square' ? (
                    <planeGeometry args={[EDGE_LENGTH * 0.95, EDGE_LENGTH * 0.95]} />
                ) : latticeType === 'hexagonal' ? (
                    <circleGeometry args={[EDGE_LENGTH * 0.95, 6]} />
                ) : (
                    <circleGeometry args={[(TRIANGLE_SIDE / Math.sqrt(3)) * 0.95, 3]} />
                )}
                <meshBasicMaterial color={hovered ? "#fbbf24" : "#ffffff"} transparent opacity={hovered ? 0.6 : 0.0} depthWrite={false} side={2} />
            </mesh>
        </group>
    );
}