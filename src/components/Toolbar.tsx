import {
  MousePointer2, Move, Type, Pen, Highlighter, Eraser,
  Square, Circle, Minus, ArrowRight, Pencil, Image as ImageIcon,
  Upload, Download, LayoutGrid, Undo2, Redo2
} from 'lucide-react'
import { Tool } from '../types'

interface ToolbarProps {
  tool: Tool
  setTool: (t: Tool) => void
  onFileUpload: () => void
  onSave: () => void
  onTogglePageManager: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  hasDoc: boolean
}

const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={20} />, label: 'Select' },
  { id: 'object', icon: <Move size={20} />, label: 'Object' },
  { id: 'text', icon: <Type size={20} />, label: 'Text' },
  { id: 'draw', icon: <Pen size={20} />, label: 'Draw' },
  { id: 'highlight', icon: <Highlighter size={20} />, label: 'Highlight' },
  { id: 'eraser', icon: <Eraser size={20} />, label: 'Eraser' },
  { id: 'rectangle', icon: <Square size={20} />, label: 'Rectangle' },
  { id: 'circle', icon: <Circle size={20} />, label: 'Circle' },
  { id: 'line', icon: <Minus size={20} />, label: 'Line' },
  { id: 'arrow', icon: <ArrowRight size={20} />, label: 'Arrow' },
  { id: 'signature', icon: <Pencil size={20} />, label: 'Signature' },
  { id: 'image', icon: <ImageIcon size={20} />, label: 'Image' },
]

export default function Toolbar({ tool, setTool, onFileUpload, onSave, onTogglePageManager, onUndo, onRedo, canUndo, canRedo, hasDoc }: ToolbarProps) {
  return (
    <div className="h-14 bg-slate-850 border-b border-slate-700 flex items-center px-3 gap-1 shrink-0">
      <div className="flex items-center gap-2 mr-4">
        <span className="font-bold text-lg text-blue-400">PDF Editor Pro</span>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={onFileUpload} className="p-2 hover:bg-slate-700 rounded transition-colors" title="Open PDF">
          <Upload size={18} />
        </button>
        <button onClick={onSave} disabled={!hasDoc} className="p-2 hover:bg-slate-700 rounded transition-colors disabled:opacity-40" title="Save PDF">
          <Download size={18} />
        </button>
        <button onClick={onTogglePageManager} disabled={!hasDoc} className="p-2 hover:bg-slate-700 rounded transition-colors disabled:opacity-40" title="Page Manager">
          <LayoutGrid size={18} />
        </button>
      </div>

      <div className="w-px h-8 bg-slate-700 mx-2" />

      <div className="flex items-center gap-1">
        {tools.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`p-2 rounded transition-colors ${tool === t.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="w-px h-8 bg-slate-700 mx-2" />

      <div className="flex items-center gap-1">
        <button onClick={onUndo} disabled={!canUndo} className="p-2 hover:bg-slate-700 rounded transition-colors disabled:opacity-40" title="Undo">
          <Undo2 size={18} />
        </button>
        <button onClick={onRedo} disabled={!canRedo} className="p-2 hover:bg-slate-700 rounded transition-colors disabled:opacity-40" title="Redo">
          <Redo2 size={18} />
        </button>
      </div>
    </div>
  )
}
