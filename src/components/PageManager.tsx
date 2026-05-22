import { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { RotateCw, Trash2, Merge, Scissors, X, GripVertical } from 'lucide-react'
import { PageInfo } from '../types'

interface MergePage {
  id: string
  thumb: string
  source: 'current' | number  // 'current' or file index
  pageIndex: number            // original page index in source PDF
  fileName: string
}

interface Props {
  pdfBytes: Uint8Array
  pages: PageInfo[]
  currentPage: number
  onPageSelect: (p: number) => void
  onRotate: (i: number, d: number) => void
  onDelete: (i: number) => void
  onMergeOrdered: (orderedPages: { source: 'current' | number; pageIndex: number }[], files: File[]) => void
  onSplit: (indices: number[]) => void
}

export default function PageManager({ pdfBytes, pages, currentPage, onPageSelect, onRotate, onDelete, onSplit, onMergeOrdered }: Props) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const [sel, setSel] = useState<number[]>([])
  const fi = useRef<HTMLInputElement>(null)
  const [mergePages, setMergePages] = useState<MergePage[] | null>(null)
  const [mergeFiles, setMergeFiles] = useState<File[]>([])
  const [mergeLoading, setMergeLoading] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  useEffect(() => {
    pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise.then(async pdf => {
      const t: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const vp = page.getViewport({ scale: 0.3 })
        const c = document.createElement('canvas')
        c.width = vp.width; c.height = vp.height
        await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
        t.push(c.toDataURL())
      }
      setThumbs(t)
    })
  }, [pdfBytes])

  const handleMergeFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setMergeLoading(true)
    try {
      // Start with current doc pages
      const allPages: MergePage[] = thumbs.map((thumb, i) => ({
        id: `current-${i}`,
        thumb,
        source: 'current' as const,
        pageIndex: i,
        fileName: 'Current Document',
      }))

      // Add pages from each incoming file
      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx]
        const arrBuf = await file.arrayBuffer()
        const bytes = new Uint8Array(arrBuf)
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const vp = page.getViewport({ scale: 0.25 })
          const c = document.createElement('canvas')
          c.width = vp.width; c.height = vp.height
          await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
          allPages.push({
            id: `file${fIdx}-${i - 1}`,
            thumb: c.toDataURL(),
            source: fIdx,
            pageIndex: i - 1,
            fileName: file.name,
          })
        }
      }
      setMergePages(allPages)
      setMergeFiles(files)
    } catch {
      setMergePages(null)
    }
    setMergeLoading(false)
    if (fi.current) fi.current.value = ''
  }, [thumbs])

  const removeMergePage = (idx: number) => {
    setMergePages(prev => prev ? prev.filter((_, i) => i !== idx) : null)
  }

  const onDragStart = (idx: number) => {
    setDragIdx(idx)
  }

  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDropIdx(idx)
  }

  const onDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null)
      setDropIdx(null)
      return
    }
    setMergePages(prev => {
      if (!prev) return null
      const arr = [...prev]
      const [moved] = arr.splice(dragIdx, 1)
      arr.splice(targetIdx, 0, moved)
      return arr
    })
    setDragIdx(null)
    setDropIdx(null)
  }

  const onDragEnd = () => {
    setDragIdx(null)
    setDropIdx(null)
  }

  const confirmMerge = () => {
    if (!mergePages || mergePages.length === 0) return
    const ordered = mergePages.map(p => ({ source: p.source, pageIndex: p.pageIndex }))
    onMergeOrdered(ordered, mergeFiles)
    setMergePages(null)
    setMergeFiles([])
  }

  return (
    <>
      <div className="w-64 bg-slate-850 border-r border-slate-700 flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-700 font-medium text-sm">Page Manager</div>
        <div className="flex gap-2 p-2 border-b border-slate-700">
          <button onClick={() => fi.current?.click()} className="flex-1 p-1.5 bg-slate-700 rounded text-xs hover:bg-slate-600 flex items-center justify-center gap-1">
            <Merge size={14} />Merge
          </button>
          <button
            onClick={() => { onSplit(sel.length ? sel : pages.map((_, i) => i)); setSel([]) }}
            className="flex-1 p-1.5 bg-slate-700 rounded text-xs hover:bg-slate-600 flex items-center justify-center gap-1"
          >
            <Scissors size={14} />Split
          </button>
        </div>
        <input ref={fi} type="file" accept=".pdf" multiple className="hidden" onChange={handleMergeFiles} />
        <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
          {thumbs.map((src, i) => (
            <div key={i} onClick={() => onPageSelect(i + 1)} className={`relative border-2 rounded p-1 cursor-pointer transition-colors ${currentPage === i + 1 ? 'border-blue-500' : 'border-transparent hover:border-slate-600'}`}>
              <img src={src} className="w-full" alt={`Page ${i + 1}`} draggable={false} />
              <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">{i + 1}</div>
              <div className="absolute top-1 right-1 flex gap-1">
                <button onClick={e => { e.stopPropagation(); onRotate(i, 90) }} className="p-1 bg-black/60 rounded hover:bg-black/80"><RotateCw size={12} /></button>
                <button onClick={e => { e.stopPropagation(); onDelete(i) }} className="p-1 bg-red-600/80 rounded hover:bg-red-600"><Trash2 size={12} /></button>
              </div>
              <input
                type="checkbox"
                checked={sel.includes(i)}
                onChange={e => { e.stopPropagation(); setSel(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i)) }}
                className="absolute top-1 left-1"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Merge Preview Modal */}
      {(mergePages !== null || mergeLoading) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col border border-slate-600">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
              <div>
                <h3 className="font-semibold text-lg">Merge Preview</h3>
                <p className="text-xs text-slate-400 mt-0.5">Drag pages to reorder. Click × to remove.</p>
              </div>
              <button onClick={() => { setMergePages(null); setMergeFiles([]) }} className="p-1 hover:bg-slate-700 rounded"><X size={20} /></button>
            </div>

            {mergeLoading ? (
              <div className="flex-1 flex items-center justify-center p-12">
                <div className="text-slate-400">Loading pages...</div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-3">
                  {mergePages?.map((mp, idx) => (
                    <div
                      key={mp.id}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragOver={e => onDragOver(e, idx)}
                      onDrop={e => onDrop(e, idx)}
                      onDragEnd={onDragEnd}
                      className={`relative border-2 rounded cursor-grab active:cursor-grabbing transition-all group
                        ${dragIdx === idx ? 'opacity-30 scale-95' : ''}
                        ${dropIdx === idx && dragIdx !== idx ? 'border-blue-400 ring-2 ring-blue-400/30' : 'border-slate-600'}
                        ${mp.source === 'current' ? 'bg-slate-700/30' : 'bg-indigo-900/20'}`}
                    >
                      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-0.5 py-0.5 z-10">
                        <GripVertical size={12} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <button
                          onClick={e => { e.stopPropagation(); removeMergePage(idx) }}
                          className="w-4 h-4 flex items-center justify-center bg-red-600/80 rounded-full text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                        >
                          ×
                        </button>
                      </div>
                      <img src={mp.thumb} className="w-full" alt={`Page`} draggable={false} />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] px-1 py-0.5 text-center truncate">
                        <span className={mp.source === 'current' ? 'text-green-400' : 'text-blue-400'}>
                          {mp.source === 'current' ? 'Current' : mp.fileName.slice(0, 12)}
                        </span>
                        <span className="text-slate-400 ml-1">p{mp.pageIndex + 1}</span>
                      </div>
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] font-bold px-1.5 rounded-b">
                        {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!mergeLoading && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700">
                <span className="text-xs text-slate-400">
                  {mergePages?.length ?? 0} pages total
                  {mergePages && ` • ${mergePages.filter(p => p.source === 'current').length} current`}
                  {mergePages && ` • ${mergePages.filter(p => p.source !== 'current').length} incoming`}
                </span>
                <div className="flex gap-3">
                  <button onClick={() => { setMergePages(null); setMergeFiles([]) }} className="px-4 py-2 text-sm rounded bg-slate-700 hover:bg-slate-600">Cancel</button>
                  <button
                    onClick={confirmMerge}
                    disabled={!mergePages?.length}
                    className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 font-medium"
                  >
                    Merge ({mergePages?.length} pages)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
