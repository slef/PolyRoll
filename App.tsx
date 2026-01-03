import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { Simulation } from './components/Simulation';
import { Floor } from './components/Floor';
import { TurtleConsole } from './components/TurtleConsole';
import { Info, Rotate3d, Target, History, ChevronRight } from 'lucide-react';
import { HistoryStep, ShapeType, PathSegment, EdgeCrossing } from './types';
import { Vector3, Quaternion } from 'three';
import { parseCommands, generatePath, generateFlatPath, extractEdgeCrossings } from './utils/turtle';
import { getPolyhedron } from './polyhedra';

export default function App() {
  const [currentShape, setCurrentShape] = useState<ShapeType>('octahedron');
  const [turtleCommands, setTurtleCommands] = useState<string>('start 0 0\nfd 1.0\nrt 90\nfd 1.0\nrt 90\nfd 1.0\nrt 90\nfd 1.0');
  const [pathSegments, setPathSegments] = useState<PathSegment[]>([]);
  const [flatPathSegments, setFlatPathSegments] = useState<PathSegment[]>([]);
  const [rollAnimationCrossings, setRollAnimationCrossings] = useState<EdgeCrossing[]>([]);

  const getFaceOrientation = useCallback((quat: Quaternion, faceIndex: number, shape: ShapeType, initialCalibrationAngle?: number): {label: string, rawAngle: number} => {
    const definition = getPolyhedron(shape);
    const centers = definition.faceCenters;
    const maxFaces = definition.faceCount;

    if (faceIndex < 1 || faceIndex > maxFaces) return { label: '?', rawAngle: 0 };
    const localNormal = centers[faceIndex - 1].clone().normalize();
    const textLocalQuat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), localNormal);
    const textWorldQuat = quat.clone().multiply(textLocalQuat);
    const textUpWorld = new Vector3(0, 1, 0).applyQuaternion(textWorldQuat);

    let angle = Math.atan2(textUpWorld.z, textUpWorld.x) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    const calib = initialCalibrationAngle ?? angle;
    let delta = angle - calib;
    if (delta < 0) delta += 360;

    return { label: definition.getOrientationLabel(delta), rawAngle: angle };
  }, []);

  const createInitialHistory = (shape: ShapeType): HistoryStep[] => {
      const definition = getPolyhedron(shape);
      return [{
        position: definition.initialPosition.clone(),
        quaternion: definition.initialQuaternion.clone(),
        faceIndex: 1,
        orientation: 'X',
        coordinate: { u: 0, v: 0 },
        moveLabel: "START",
        moveIndex: 0,
        shape: shape
    }];
  };

  const [history, setHistory] = useState<HistoryStep[]>(() => createInitialHistory('octahedron'));
  const [calibAngles] = useState<{octahedron: number, icosahedron: number, cube: number}>(() => {
      const octDef = getPolyhedron('octahedron');
      const icoDef = getPolyhedron('icosahedron');
      const cubeDef = getPolyhedron('cube');
      const oct = getFaceOrientation(octDef.initialQuaternion, 1, 'octahedron');
      const ico = getFaceOrientation(icoDef.initialQuaternion, 1, 'icosahedron');
      const cub = getFaceOrientation(cubeDef.initialQuaternion, 1, 'cube');
      return { octahedron: oct.rawAngle, icosahedron: ico.rawAngle, cube: cub.rawAngle };
  });

  const changeShape = (shape: ShapeType) => {
      if (shape === currentShape) return;
      setCurrentShape(shape);
      const newHistory = createInitialHistory(shape);
      setHistory(newHistory);
      setCurrentStepIndex(0);
      setPathSegments([]);
      setFlatPathSegments([]);
  };
  
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = history[currentStepIndex];
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollLeft = historyRef.current.scrollWidth;
  }, [history.length]);

  const handleRollComplete = (newPos: Vector3, newQuat: Quaternion, moveLabel: string, delta: {u: number, v: number}, faceIndex: number) => {
    const prevStep = history[currentStepIndex];
    const { label: orientationLabel } = getFaceOrientation(newQuat, faceIndex, currentShape, calibAngles[currentShape]);
    const newStep: HistoryStep = {
        position: newPos,
        quaternion: newQuat,
        faceIndex: faceIndex,
        orientation: orientationLabel,
        coordinate: { u: prevStep.coordinate.u + delta.u, v: prevStep.coordinate.v + delta.v },
        moveLabel: moveLabel,
        moveIndex: currentStepIndex + 1,
        shape: currentShape
    };
    const newHistory = [...history.slice(0, currentStepIndex + 1), newStep];
    setHistory(newHistory);
    setCurrentStepIndex(newHistory.length - 1);
  };

  const jumpToStep = (index: number) => {
    if (history[index].shape !== currentShape) setCurrentShape(history[index].shape);
    setCurrentStepIndex(index);
  };

  const handleRunCommands = () => {
      const parsed = parseCommands(turtleCommands);
      const segments = generatePath(currentShape, parsed);
      const flatSegments = generateFlatPath(currentShape, parsed);
      setPathSegments(segments);
      setFlatPathSegments(flatSegments);
  };

  const handleRollAnimation = () => {
      // Reset to initial position
      const initialHistory = createInitialHistory(currentShape);
      setHistory(initialHistory);
      setCurrentStepIndex(0);

      // Parse commands and generate path
      const parsed = parseCommands(turtleCommands);
      const segments = generatePath(currentShape, parsed);
      const flatSegments = generateFlatPath(currentShape, parsed);

      // Set the full paths (Simulation will progressively reveal them)
      setPathSegments(segments);
      setFlatPathSegments(flatSegments);

      // Extract edge crossings from the path
      const crossings = extractEdgeCrossings(currentShape, segments);

      // Trigger the roll animation
      setRollAnimationCrossings(crossings);
  };

  const handleRollAnimationComplete = () => {
      // Animation finished, clear the crossings
      setRollAnimationCrossings([]);
  };

  return (
    <div className="w-full h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
      <header className="absolute top-0 left-0 w-full p-6 z-10 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Rotate3d className="text-indigo-600" /> PolyRoll
                </h1>
                <div className="flex bg-slate-100 rounded-lg p-1 mt-3 gap-1">
                    {(['octahedron', 'icosahedron', 'cube'] as ShapeType[]).map(s => (
                        <button key={s} onClick={() => changeShape(s)}
                            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold transition-all capitalize ${currentShape === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex gap-2">
                <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200 w-32 tracking-tight">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase text-slate-400">Face</span>
                        <Target size={14} className="text-slate-400" />
                    </div>
                    <div className="text-2xl font-black text-indigo-600 flex items-baseline gap-1">
                        <span>#{currentStep.faceIndex}</span>
                        <span className="text-sm font-bold text-slate-400">({currentStep.orientation})</span>
                    </div>
                </div>
                <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200 min-w-[8rem]">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase text-slate-400">Position</span>
                    </div>
                    <div className="text-lg font-mono font-bold text-slate-700">({currentStep.coordinate.u}, {currentStep.coordinate.v})</div>
                </div>
            </div>
        </div>
        <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200 max-w-sm pointer-events-auto">
             <div className="flex items-start gap-3">
                <Info className="text-indigo-500 mt-1 shrink-0" size={20} />
                <div className="text-xs text-slate-600 space-y-2">
                    <p><strong>Controls:</strong> Click highlighted zones to roll.</p>
                    <p><strong>Turtle Graphics:</strong> Use the side console to draw. Blue line: on surface. Red line: on plane.</p>
                </div>
             </div>
        </div>
      </header>

      <TurtleConsole
        commands={turtleCommands}
        onCommandsChange={setTurtleCommands}
        onRun={handleRunCommands}
        onRoll={handleRollAnimation}
      />

      <div className="absolute inset-0 z-0">
        <Canvas shadows camera={{ position: [0, 5, 8], fov: 45 }}>
          <color attach="background" args={['#f1f5f9']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
          <Environment preset="city" />
          <group>
             <Simulation
                shape={currentShape}
                position={currentStep.position}
                quaternion={currentStep.quaternion}
                pathSegments={pathSegments}
                flatPathSegments={flatPathSegments}
                rollAnimationCrossings={rollAnimationCrossings}
                onRollComplete={handleRollComplete}
                onRollAnimationComplete={handleRollAnimationComplete}
             />
             <Floor shape={currentShape} />
             <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={15} blur={2.5} far={2} resolution={512} color="#475569" />
          </group>
          <OrbitControls minPolarAngle={0} maxPolarAngle={Math.PI / 2 - 0.1} enablePan={true} maxDistance={20} minDistance={3} />
        </Canvas>
      </div>

      <div className="absolute bottom-0 left-0 w-full p-4 z-10 pointer-events-none">
         <div className="bg-white/90 backdrop-blur-md border-t border-slate-200 shadow-xl pointer-events-auto flex items-center h-20 overflow-hidden rounded-xl">
             <div className="bg-slate-50 h-full px-4 flex flex-col items-center justify-center border-r border-slate-200 shrink-0">
                 <History className="text-slate-400" size={18} />
                 <span className="text-[10px] font-bold text-slate-500 uppercase mt-1">Steps</span>
             </div>
             <div ref={historyRef} className="flex items-center overflow-x-auto h-full px-2 scrollbar-thin scrollbar-thumb-slate-300 gap-2 w-full">
                {history.map((step, idx) => (
                    <button key={idx} onClick={() => jumpToStep(idx)}
                        className={`flex flex-col justify-center px-4 py-1.5 rounded-lg border transition-all shrink-0 h-14 ${idx === currentStepIndex ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-100' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                    >
                        <div className="flex items-center justify-between w-full gap-2">
                            <span className={`text-xs font-bold ${idx === currentStepIndex ? 'text-indigo-600' : 'text-slate-700'}`}>{step.moveLabel}</span>
                            {idx < history.length - 1 && <ChevronRight size={12} className="text-slate-300" />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                             <span className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200">{step.coordinate.u},{step.coordinate.v}</span>
                             <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${idx === currentStepIndex ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>#{step.faceIndex}</span>
                        </div>
                    </button>
                ))}
                <div className="w-4 shrink-0" />
             </div>
         </div>
      </div>
    </div>
  );
}