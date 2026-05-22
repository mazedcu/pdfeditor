import { useRef, useState } from 'react'
import { X, Check, Trash2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (dataUrl: string) => void
}

export default function SignatureModal({ open, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  if (!open) return null

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: clientX - r.left, y: clientY - r.top }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDrawing(true)
    const p = getPos(e)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const p = getPos(e)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.lineTo(p.x, p.y)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  const end = () => {
    setIsDrawing(false)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
  }

  const clear = () => {
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
  }

  const save = () => {
    const dataUrl = canvasRef.current!.toDataURL('image/png')
    onSave(dataUrl)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-4 w-[420px] shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-white">Draw Signature</span>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded"><X size={18}/></button>
        </div>
        <canvas
          ref={canvasRef}
          width={380}
          height={160}
          className="bg-white rounded border border-slate-600 cursor-crosshair w-full"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        <div className="flex gap-2 mt-3">
          <button onClick={clear} className="flex-1 p-2 bg-slate-700 hover:bg-slate-600 rounded text-sm flex items-center justify-center gap-1">
            <Trash2 size={14}/> Clear
          </button>
          <button onClick={save} className="flex-1 p-2 bg-blue-600 hover:bg-blue-500 rounded text-sm flex items-center justify-center gap-1">
            <Check size={14}/> Apply
          </button>
        </div>
      </div>
    </div>
  )
}
