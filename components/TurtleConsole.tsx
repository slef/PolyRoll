import React, { useState, useRef, useEffect } from 'react';
import { Terminal, ChevronLeft, ChevronRight, Play, Trash2, HelpCircle } from 'lucide-react';

interface TurtleConsoleProps {
    commands: string;
    onCommandsChange: (newCommands: string) => void;
    onRun: () => void;
}

export const TurtleConsole: React.FC<TurtleConsoleProps> = ({ commands, onCommandsChange, onRun }) => {
    const [isOpen, setIsOpen] = useState(true);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    const syncScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    // Ensure sync happens when content changes (e.g. deleting lines)
    useEffect(() => {
        syncScroll();
    }, [commands]);

    return (
        <div className={`absolute top-20 right-4 z-20 transition-all duration-300 pointer-events-auto ${isOpen ? 'w-80' : 'w-12'}`}>
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
                <div className="bg-indigo-600 p-3.5 flex items-center justify-between text-white shrink-0">
                    <div className={`flex items-center gap-2 ${!isOpen && 'hidden'}`}>
                        <Terminal size={18} />
                        <span className="text-sm font-bold tracking-tight">Turtle Script</span>
                    </div>
                    <button 
                        onClick={() => setIsOpen(!isOpen)}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        {isOpen ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>

                {isOpen && (
                    <>
                        <div className="flex-1 p-4 flex flex-col gap-3 overflow-hidden min-h-0">
                            <div className="relative group flex-1 min-h-[20rem]">
                                <div className="absolute inset-0 bg-slate-900 rounded-xl overflow-hidden flex border border-slate-700">
                                    <div 
                                        ref={lineNumbersRef}
                                        className="w-10 bg-slate-800 text-slate-500 text-[10px] font-mono py-4 flex flex-col items-center select-none border-r border-slate-700 h-full overflow-hidden shrink-0"
                                    >
                                        {commands.split('\n').map((_, i) => (
                                            <div key={i} className="h-[1.25rem] leading-[1.25rem]">{i + 1}</div>
                                        ))}
                                    </div>
                                    <textarea
                                        ref={textareaRef}
                                        value={commands}
                                        onChange={(e) => onCommandsChange(e.target.value)}
                                        onScroll={syncScroll}
                                        spellCheck={false}
                                        placeholder={`start 0 0\nfd 1.0\nrt 90...`}
                                        className="flex-1 bg-transparent text-emerald-400 font-mono text-sm p-4 h-full focus:outline-none resize-none leading-[1.25rem] whitespace-pre overflow-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
                                    />
                                </div>
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <button 
                                        onClick={() => onCommandsChange('')}
                                        className="p-1.5 bg-slate-800 text-slate-400 hover:text-red-400 rounded-md shadow-lg border border-slate-700"
                                        title="Clear Editor"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={onRun}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98] shrink-0"
                            >
                                <Play size={18} fill="currentColor" />
                                Run Turtle
                            </button>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
                            <div className="flex items-center gap-2 text-indigo-600 mb-2">
                                <HelpCircle size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Syntax Guide</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-500 font-mono">
                                <div><b className="text-slate-800">start x y</b></div>
                                <div>Sets start origin</div>
                                <div><b className="text-slate-800">fd [d]</b></div>
                                <div>Move forward</div>
                                <div><b className="text-slate-800">bk [d]</b></div>
                                <div>Move backward</div>
                                <div><b className="text-slate-800">lt [deg]</b></div>
                                <div>Turn left</div>
                                <div><b className="text-slate-800">rt [deg]</b></div>
                                <div>Turn right</div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};