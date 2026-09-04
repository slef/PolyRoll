import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { ShapeType } from '../types';
import { TAME_SURFACES, getPolyhedron } from '../polyhedra';

interface MenuItem {
  id: ShapeType;
  label: string;
  sub: string;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const BUILTIN_GROUPS: MenuGroup[] = [
  {
    title: 'Regular polyhedra',
    items: [
      { id: 'tetrahedron', label: 'Tetrahedron', sub: 'triangular lattice, 4 colours' },
      { id: 'cube', label: 'Cube', sub: 'square lattice' },
      { id: 'octahedron', label: 'Octahedron', sub: 'triangular lattice' },
      { id: 'icosahedron', label: 'Icosahedron', sub: 'triangular lattice' },
      { id: 'dodecahedron', label: 'Dodecahedron', sub: 'blank floor, face stamps' },
    ],
  },
  {
    title: 'Doubly covered polygons',
    items: [
      { id: 'dcTriangle', label: 'DC Triangle', sub: 'triangular lattice' },
      { id: 'dcSquare', label: 'DC Square', sub: 'square lattice' },
      { id: 'dcHexagon', label: 'DC Hexagon', sub: 'hexagonal lattice' },
    ],
  },
];

function buildTameGroups(): MenuGroup[] {
  const byK = new Map<number, MenuItem[]>();
  for (const s of TAME_SURFACES) {
    const kind = s.flat ? 'flat' : (s.description || 'solid');
    const sub = `cell ${s.cell} · ${kind} · ${s.angles.join(' ')}°`;
    if (!byK.has(s.K)) byK.set(s.K, []);
    byK.get(s.K)!.push({ id: s.id, label: s.display, sub });
  }
  return [...byK.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([K, items]) => ({ title: `Tame polyhedra · thickness K = ${K}`, items }));
}

export const ALL_GROUPS: MenuGroup[] = [...BUILTIN_GROUPS, ...buildTameGroups()];

export function shapeLabel(shape: ShapeType): string {
  for (const g of ALL_GROUPS) for (const it of g.items) if (it.id === shape) return it.label;
  return getPolyhedron(shape).name;
}

interface ShapeMenuProps {
  current: ShapeType;
  onSelect: (shape: ShapeType) => void;
}

export const ShapeMenu: React.FC<ShapeMenuProps> = ({ current, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_GROUPS;
    return ALL_GROUPS
      .map(g => ({
        title: g.title,
        items: g.items.filter(it =>
          it.label.toLowerCase().includes(q) ||
          it.sub.toLowerCase().includes(q) ||
          g.title.toLowerCase().includes(q) ||
          String(it.id).toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.items.length > 0);
  }, [query]);

  const currentItem = ALL_GROUPS.flatMap(g => g.items).find(it => it.id === current);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-left"
      >
        <div className="min-w-0">
          <div className="text-sm font-bold text-indigo-600 truncate">{currentItem?.label ?? current}</div>
          {currentItem && <div className="text-[10px] text-slate-500 truncate">{currentItem.sub}</div>}
        </div>
        <ChevronDown size={16} className={`text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-[22rem] bg-white rounded-xl shadow-2xl border border-slate-200 z-30 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search shapes (e.g. K = 7, prism, (2,3,6))"
              className="flex-1 text-sm bg-transparent focus:outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>
          <div className="overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-slate-300">
            {groups.map(g => (
              <div key={g.title}>
                <div className="sticky top-0 bg-slate-50/95 backdrop-blur px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 border-y border-slate-100">
                  {g.title}
                </div>
                {g.items.map(it => (
                  <button
                    key={it.id}
                    onClick={() => { onSelect(it.id); setOpen(false); setQuery(''); }}
                    className={`w-full text-left px-3 py-1.5 flex flex-col hover:bg-indigo-50 transition-colors ${it.id === current ? 'bg-indigo-50' : ''}`}
                  >
                    <span className={`text-sm font-semibold ${it.id === current ? 'text-indigo-600' : 'text-slate-700'}`}>{it.label}</span>
                    <span className="text-[10px] text-slate-500 truncate">{it.sub}</span>
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && <div className="px-3 py-4 text-xs text-slate-400">No shapes match.</div>}
          </div>
        </div>
      )}
    </div>
  );
};
