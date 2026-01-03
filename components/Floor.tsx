import React, { useMemo } from 'react';
import { TRIANGLE_SIDE, EDGE_LENGTH, GRID_COLOR_1, GRID_COLOR_2 } from '../constants';
import { Color, DoubleSide, InstancedMesh, Object3D } from 'three';
import { ShapeType } from '../types';
import { getPolyhedron } from '../polyhedra';

interface FloorProps {
    shape: ShapeType;
}

export const Floor: React.FC<FloorProps> = ({ shape }) => {
  const definition = getPolyhedron(shape);
  const latticeType = definition.latticeType;

  return (
    <group position={[0, -0.005, 0]}>
        {latticeType === 'square' ? <SquareFloorMesh /> : <TriangularFloorMesh />}
        <LatticeVertices shape={shape} />
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[0.1, 0.15, 32]} />
            <meshBasicMaterial color="#3b82f6" opacity={0.8} transparent depthTest={false} />
        </mesh>
    </group>
  );
};

const LatticeVertices: React.FC<{ shape: ShapeType }> = ({ shape }) => {
    const { positions, colors } = useMemo(() => {
        const posArray: number[] = [];
        const colArray: number[] = [];
        const definition = getPolyhedron(shape);

        if (definition.latticeType === 'square') {
            const size = EDGE_LENGTH;
            const count = 12;
            // Align lattice vertices perfectly with cube corners.
            // Cubes are centered at (i*size, j*size).
            // Vertices of a cube at (0,0) are at (+-size/2, +-size/2).
            // Thus, the global set of vertices are at (k * size + size/2).
            // We use i, j indices such that i=0, j=0 gives vertex (-size/2, -size/2)
            for (let i = -count; i <= count; i++) {
                for (let j = -count; j <= count; j++) {
                    const vx = i * size - size/2;
                    const vz = j * size - size/2;
                    posArray.push(vx, 0.005, vz);

                    const colorHex = definition.getLatticeVertexColor(i, j);
                    const c = new Color(colorHex);
                    colArray.push(c.r, c.g, c.b);
                }
            }
        } else {
            const side = TRIANGLE_SIDE;
            const height = side * Math.sqrt(3) / 2;
            const rows = 12, cols = 12;
            const uniquePoints = new Map<string, {x: number, z: number, i: number, j: number}>();
            const originZ = -2 * height / 3;
            const addPoint = (x: number, z: number) => {
                const key = `${x.toFixed(3)},${z.toFixed(3)}`;
                if(uniquePoints.has(key)) return;
                const j = Math.round((z - originZ) / height);
                const i = Math.round((x - j * (side / 2)) / side);
                uniquePoints.set(key, {x, z, i, j});
            };
            for (let r = -rows; r <= rows; r++) {
                for (let c = -cols; c <= cols; c++) {
                    const zBase = r * height;
                    const xBase = c * side + (Math.abs(r) % 2 === 1 ? side / 2 : 0);
                    addPoint(xBase, zBase - (2/3) * height);
                    addPoint(xBase + side/2, zBase + (1/3) * height);
                    addPoint(xBase - side/2, zBase + (1/3) * height);
                }
            }
            uniquePoints.forEach(pt => {
                posArray.push(pt.x, 0.005, pt.z);
                const colorHex = definition.getLatticeVertexColor(pt.i, pt.j);
                const c = new Color(colorHex);
                colArray.push(c.r, c.g, c.b);
            });
        }

        return { positions: new Float32Array(posArray), colors: new Float32Array(colArray) };
    }, [shape]);

    const meshRef = React.useRef<InstancedMesh>(null);
    React.useLayoutEffect(() => {
        if(!meshRef.current) return;
        const tempObj = new Object3D();
        const count = positions.length / 3;
        for(let i=0; i<count; i++) {
            tempObj.position.set(positions[i*3], positions[i*3+1], positions[i*3+2]);
            tempObj.updateMatrix();
            meshRef.current.setMatrixAt(i, tempObj.matrix);
            meshRef.current.setColorAt(i, new Color(colors[i*3], colors[i*3+1], colors[i*3+2]));
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }, [positions, colors]);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, positions.length / 3]} receiveShadow>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial roughness={0.5} metalness={0.1} />
        </instancedMesh>
    );
};

const SquareFloorMesh = () => {
    const { positions, colors, normals } = useMemo(() => {
        const posArray = [];
        const colArray = [];
        const size = EDGE_LENGTH;
        const count = 12;
        const color1 = new Color(GRID_COLOR_1);
        const color2 = new Color(GRID_COLOR_2);

        for (let i = -count; i < count; i++) {
            for (let j = -count; j < count; j++) {
                const color = (Math.abs(i + j) % 2 === 0) ? color1 : color2;
                // Shift by -size/2 so that the tile (0,0) is centered at (0,0)
                // This makes the vertices of tile(0,0) land at (+-size/2, +-size/2)
                const x = i * size - size/2, z = j * size - size/2;
                // Quad as two triangles
                posArray.push(x, 0, z, x + size, 0, z, x + size, 0, z + size);
                posArray.push(x, 0, z, x + size, 0, z + size, x, 0, z + size);
                for(let k=0; k<6; k++) colArray.push(color.r, color.g, color.b);
            }
        }
        const normArray = new Float32Array(posArray.length);
        for(let i=0; i<normArray.length; i+=3) { normArray[i]=0; normArray[i+1]=1; normArray[i+2]=0; }
        return { positions: new Float32Array(posArray), colors: new Float32Array(colArray), normals: normArray };
    }, []);

    return (
        <mesh receiveShadow frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
                <bufferAttribute attach="attributes-normal" count={normals.length / 3} array={normals} itemSize={3} />
            </bufferGeometry>
            <meshStandardMaterial vertexColors roughness={0.8} metalness={0.0} side={DoubleSide} />
        </mesh>
    );
}

const TriangularFloorMesh = () => {
    const { positions, colors, normals } = useMemo(() => {
        const posArray = [], colArray = [];
        const side = TRIANGLE_SIDE, height = side * Math.sqrt(3) / 2; 
        const rows = 12, cols = 12;
        const color1 = new Color(GRID_COLOR_1), color2 = new Color(GRID_COLOR_2);
        for (let r = -rows; r <= rows; r++) {
            for (let c = -cols; c <= cols; c++) {
                const zBase = r * height, xBase = c * side + (Math.abs(r) % 2 === 1 ? side / 2 : 0);
                const cx = xBase, cz = zBase;
                const v1x = cx, v1z = cz - (2/3) * height, v2x = cx + side/2, v2z = cz + (1/3) * height, v3x = cx - side/2, v3z = cz + (1/3) * height; 
                posArray.push(v1x, 0, v1z, v2x, 0, v2z, v3x, 0, v3z);
                colArray.push(color1.r, color1.g, color1.b, color1.r, color1.g, color1.b, color1.r, color1.g, color1.b);
                const pfx1 = v3x, pfz1 = v3z, pfx2 = v2x, pfz2 = v2z, pfx3 = cx, pfz3 = v2z + height;
                posArray.push(pfx1, 0, pfz1, pfx2, 0, pfz2, pfx3, 0, pfz3);
                colArray.push(color2.r, color2.g, color2.b, color2.r, color2.g, color2.b, color2.r, color2.g, color2.b);
            }
        }
        const normArray = new Float32Array(posArray.length);
        for(let i=0; i<normArray.length; i+=3) { normArray[i] = 0; normArray[i+1] = 1; normArray[i+2] = 0; }
        return { positions: new Float32Array(posArray), colors: new Float32Array(colArray), normals: normArray };
    }, []);
    return (
        <mesh receiveShadow frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
                <bufferAttribute attach="attributes-normal" count={normals.length / 3} array={normals} itemSize={3} />
            </bufferGeometry>
            <meshStandardMaterial vertexColors roughness={0.8} metalness={0.0} side={DoubleSide} />
        </mesh>
    );
};
