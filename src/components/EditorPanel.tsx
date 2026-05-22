import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { Tool, Annotation } from '../types'

interface Props {
  tool: Tool
  color: string
  setColor: (c: string) => void
  strokeWidth: number
  setStrokeWidth: (w: number) => void
  fontSize: number
  setFontSize: (s: number) => void
  scale: number
  setScale: (s: number) => void
  currentPage: number
  numPages: number
  onPageChange: (p: number) => void
  annotations: Annotation[]
  onRemoveAnnotation: (id: string) => void
}

const colors = ['#000000','#ef4444','#22c55e','#3b82f6','#f59e0b','#a855f7','#ec4899']

export default function EditorPanel({ tool, color, setColor, strokeWidth, setStrokeWidth, fontSize, setFontSize, scale, setScale, currentPage, numPages, onPageChange, annotations, onRemoveAnnotation }: Props) {
  const pageAnns = annotations.filter(a=>a.pageIndex===currentPage-1)

  return (
    <div className="w-64 bg-slate-850 border-l border-slate-700 flex flex-col shrink-0">
      <div className="p-3 border-b border-slate-700 font-medium">Properties</div>

      <div className="p-3 border-b border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Page</span>
          <div className="flex items-center gap-1">
            <button onClick={()=>onPageChange(currentPage-1)} disabled={currentPage<=1} className="p-1 hover:bg-slate-700 rounded disabled:opacity-40"><ChevronLeft size={16}/></button>
            <span className="text-sm w-12 text-center">{currentPage}/{numPages}</span>
            <button onClick={()=>onPageChange(currentPage+1)} disabled={currentPage>=numPages} className="p-1 hover:bg-slate-700 rounded disabled:opacity-40"><ChevronRight size={16}/></button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Zoom</span>
          <div className="flex items-center gap-1">
            <button onClick={()=>setScale(Math.max(0.5,scale-0.2))} className="p-1 hover:bg-slate-700 rounded"><ZoomOut size={16}/></button>
            <span className="text-sm w-10 text-center">{Math.round(scale*100)}%</span>
            <button onClick={()=>setScale(Math.min(3,scale+0.2))} className="p-1 hover:bg-slate-700 rounded"><ZoomIn size={16}/></button>
          </div>
        </div>
      </div>

      {tool!=='select' && (
        <div className="p-3 border-b border-slate-700 space-y-3">
          <div>
            <span className="text-sm text-slate-400 block mb-2">Color</span>
            <div className="flex gap-1 flex-wrap">
              {colors.map(c=> (
                <button key={c} onClick={()=>setColor(c)} className={`w-6 h-6 rounded-full border-2 ${color===c?'border-white':'border-transparent'}`} style={{backgroundColor:c}} />
              ))}
              <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden" />
            </div>
          </div>
          {['draw','rectangle','circle','line','arrow','highlight'].includes(tool) && (
            <div>
              <span className="text-sm text-slate-400 block mb-1">Stroke Width: {strokeWidth}px</span>
              <input type="range" min={1} max={20} value={strokeWidth} onChange={e=>setStrokeWidth(Number(e.target.value))} className="w-full accent-blue-500" />
            </div>
          )}
          {tool==='text' && (
            <div>
              <span className="text-sm text-slate-400 block mb-1">Font Size: {fontSize}px</span>
              <input type="range" min={8} max={72} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} className="w-full accent-blue-500" />
            </div>
          )}
        </div>
      )}

      <div className="p-3 border-b border-slate-700 flex-1 overflow-y-auto scrollbar-thin">
        <span className="text-sm text-slate-400 block mb-2">Annotations ({pageAnns.length})</span>
        <div className="space-y-1">
          {pageAnns.map(a=> (
            <div key={'id' in a?a.id:''} className="flex items-center justify-between p-2 bg-slate-800 rounded text-sm">
              <span>{'type' in a ? (a.type==='textEdit'?'Text Edit':a.type==='text'?'Text':a.type==='drawing'?'Drawing':a.type==='highlight'?'Highlight':a.type==='shape'?'Shape':'Other') : 'Unknown'}</span>
              <button onClick={()=>onRemoveAnnotation('id' in a?a.id:'')} className="p-1 hover:bg-red-600/50 rounded"><Trash2 size={14}/></button>
            </div>
          ))}
          {pageAnns.length===0 && <span className="text-xs text-slate-500">No annotations on this page</span>}
        </div>
      </div>
    </div>
  )
}
