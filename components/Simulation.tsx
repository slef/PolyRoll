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
    const faces = definition.getFaces();

    // Transform all faces to world space
    const worldFaces = faces.map(face => ({
      ...face,
      center: face.center.clone().applyMatrix4(matrix),
      normal: face.normal.clone().applyQuaternion(quat),
      vertices: face.vertices.map(v => v.clone().applyMatrix4(matrix))
    }));

    // Find the bottom face (face with normal pointing most downward)
    let bottomFaceIndex = 0;
    let bestDot = -1;
    worldFaces.forEach((face, idx) => {
      const dot = face.normal.dot(new Vector3(0, -1, 0));
      if (dot > bestDot) {
        bestDot = dot;
        bottomFaceIndex = idx;
      }
    });

    const bottomFace = worldFaces[bottomFaceIndex];
    const bottomFaceVertexCount = bottomFace.vertices.length;

    const newTargets: RollTarget[] = [];

    // For each edge of the bottom face, find the adjacent face and create interaction zone
    for (let i = 0; i < bottomFaceVertexCount; i++) {
      const nextI = (i + 1) % bottomFaceVertexCount;
      const edgeV1 = bottomFace.vertices[i];
      const edgeV2 = bottomFace.vertices[nextI];

      // Find which face shares this edge (excluding the bottom face)
      let adjacentFace = null;
      for (const face of worldFaces) {
        if (face.index === bottomFace.index) continue;

        // Check if this face contains both edge vertices
        let hasV1 = false, hasV2 = false;
        for (const fv of face.vertices) {
          if (fv.distanceTo(edgeV1) < 0.001) hasV1 = true;
          if (fv.distanceTo(edgeV2) < 0.001) hasV2 = true;
        }
        if (hasV1 && hasV2) {
          adjacentFace = face;
          break;
        }
      }

      if (!adjacentFace) continue;

      // Calculate roll parameters
      const pivot = new Vector3().addVectors(edgeV1, edgeV2).multiplyScalar(0.5);
      const currentFloorCenter = new Vector3(pos.x, 0, pos.z);
      const toPivot = new Vector3().subVectors(pivot, currentFloorCenter);
      const rollDirection = toPivot.clone().normalize();
      const axis = new Vector3(0, 1, 0).cross(rollDirection).normalize();

      // Create interaction zone: project adjacent face vertices to ground after roll
      const rollAngle = definition.rollAngle;
      const rollQuat = new Quaternion().setFromAxisAngle(axis, rollAngle);

      const zoneVertices: Vector3[] = adjacentFace.vertices.map(v => {
        // Rotate vertex around pivot by roll angle
        const relative = v.clone().sub(pivot);
        relative.applyQuaternion(rollQuat);
        const rotated = relative.add(pivot);
        // Project to ground
        return new Vector3(rotated.x, 0, rotated.z);
      });

      const targetCenter = new Vector3().addVectors(currentFloorCenter, toPivot.clone().multiplyScalar(2));

      newTargets.push({
        axis,
        point: pivot,
        targetCenter,
        directionAngle: Math.atan2(toPivot.z, toPivot.x),
        zoneVertices
      });
    }

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

    // Detect doubly covered polygons (2 faces with opposite normals at same location)
    const isDoublyCovered = definition.faceCount === 2 &&
                            Math.abs(definition.dihedralAngle) < 0.01;
    const VISUAL_OFFSET = 0.002;

    faces.forEach((face) => {
      const faceColor = new Color(definition.getFaceColor(face.index - 1));
      let verts = face.vertices;

      // Apply visual offset for doubly covered polygons to prevent z-fighting
      if (isDoublyCovered) {
        const offset = face.index === 1 ? -VISUAL_OFFSET : VISUAL_OFFSET;
        verts = verts.map(v => new Vector3(v.x, v.y + offset, v.z));
      }

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

        // Apply visual offset for doubly covered polygons
        const isDoublyCovered = definition.faceCount === 2 && Math.abs(definition.dihedralAngle) < 0.01;
        const VISUAL_OFFSET = 0.002;
        let center = face.center.clone();
        if (isDoublyCovered) {
          const offset = face.index === 1 ? -VISUAL_OFFSET : VISUAL_OFFSET;
          center.y += offset;
        }

        // Position label slightly beyond face center along normal
        const pos = center.add(normal.clone().multiplyScalar(0.01));
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

    // If custom zone vertices are provided, use them to create a custom shape
    const customGeometry = useMemo(() => {
        if (!target.zoneVertices || target.zoneVertices.length < 3) return null;

        const shape = new THREE.Shape();

        // Zone vertices are in world coords on ground (y=0)
        // ShapeGeometry is created in XY plane, then rotated to lie flat
        // When rotating -90° around X: shape(x,y) -> world(x, 0, -y)
        // So we use (vertex.x, -vertex.z) to get correct world position
        shape.moveTo(target.zoneVertices[0].x, -target.zoneVertices[0].z);

        for (let i = 1; i < target.zoneVertices.length; i++) {
            shape.lineTo(target.zoneVertices[i].x, -target.zoneVertices[i].z);
        }

        shape.closePath();

        const geom = new THREE.ShapeGeometry(shape);
        return geom;
    }, [target.zoneVertices]);

    if (customGeometry) {
        // Custom geometry: render at origin (vertices already in world coords)
        return (
            <mesh
                geometry={customGeometry}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.01, 0]}
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                onPointerOver={() => setHover(true)}
                onPointerOut={() => setHover(false)}
            >
                <meshBasicMaterial color={hovered ? "#fbbf24" : "#ffffff"} transparent opacity={hovered ? 0.6 : 0.0} depthWrite={false} side={2} />
            </mesh>
        );
    }

    // Default geometry: simple shapes centered at targetCenter
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