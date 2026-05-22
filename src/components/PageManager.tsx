import { useState, useEffect, useRef } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { RotateCw, Trash2, Merge, Scissors } from 'lucide-react'
import { PageInfo } from '../types'

interface Props {
  pdfBytes: Uint8Array
  pages: PageInfo[]
  currentPage: number
  onPageSelect: (p: number) => void
  onRotate: (i: number, d: number) => void
  onDelete: (i: number) => void
  onMerge: (files: File[]) => void
  onSplit: (indices: number[]) => void
}

export default function PageManager({ pdfBytes, pages, currentPage, onPageSelect, onRotate, onDelete, onMerge, onSplit }: Props) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const [sel, setSel] = useState<number[]>([])
  const fi = useRef<HTMLInputElement>(null)

  useEffect(() => {
    pdfjs.getDocument({data:pdfBytes}).promise.then(async pdf => {
      const t: string[] = []
      for (let i=1;i<=pdf.numPages;i++) {
        const page = await pdf.getPage(i)
        const vp = page.getViewport({scale:0.3})
        const c = document.createElement('canvas')
        c.width = vp.width; c.height = vp.height
        await page.render({canvasContext:c.getContext('2d')!, viewport:vp}).promise
        t.push(c.toDataURL())
      }
      setThumbs(t)
    })
  }, [pdfBytes])

  return (
    <div className="w-64 bg-slate-850 border-r border-slate-700 flex flex-col shrink-0">
      <div className="p-3 border-b border-slate-700 font-medium">Page Manager</div>
      <div className="flex gap-2 p-2 border-b border-slate-700">
        <button onClick={()=>fi.current?.click()} className="flex-1 p-1 bg-slate-700 rounded text-xs hover:bg-slate-600"><Merge size={14} className="inline mr-1"/>Merge</button>
        <button onClick={()=>{onSplit(sel.length?sel:pages.map((_,i)=>i));setSel([])}} className="flex-1 p-1 bg-slate-700 rounded text-xs hover:bg-slate-600"><Scissors size={14} className="inline mr-1"/>Split</button>
      </div>
      <input ref={fi} type="file" accept=".pdf" multiple className="hidden" onChange={e=>{const f=Array.from(e.target.files||[]);if(f.length)onMerge(f)}}/>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {thumbs.map((src,i)=> (
          <div key={i} onClick={()=>onPageSelect(i+1)} className={`relative border-2 rounded p-1 cursor-pointer ${currentPage===i+1?'border-blue-500':'border-transparent hover:border-slate-600'}`}>
            <img src={src} className="w-full" alt={`Page ${i+1}`} draggable={false}/>
            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 rounded">{i+1}</div>
            <div className="absolute top-1 right-1 flex gap-1">
              <button onClick={e=>{e.stopPropagation();onRotate(i,90)}} className="p-1 bg-black/60 rounded hover:bg-black/80"><RotateCw size={12}/></button>
              <button onClick={e=>{e.stopPropagation();onDelete(i)}} className="p-1 bg-red-600/80 rounded hover:bg-red-600"><Trash2 size={12}/></button>
            </div>
            <input type="checkbox" checked={sel.includes(i)} onChange={e=>{e.stopPropagation();setSel(prev=>e.target.checked?[...prev,i]:prev.filter(x=>x!==i))}} className="absolute top-1 left-1"/>
          </div>
        ))}
      </div>
    </div>
  )
}
