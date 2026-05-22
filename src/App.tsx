import { useState, useRef, useCallback } from 'react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist'
import { Tool, Annotation, PageInfo } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href

import Toolbar from './components/Toolbar'
import PdfViewer from './components/PdfViewer'
import PageManager from './components/PageManager'
import EditorPanel from './components/EditorPanel'
import SignatureModal from './components/SignatureModal'
import { mergeOrderedPdfs, splitPdf, rotatePage, deletePage, burnAnnotations } from './utils/pdfUtils'

function App() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [tool, setTool] = useState<Tool>('select')
  const [scale, setScale] = useState(1.5)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [fontSize, setFontSize] = useState(16)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [showPageManager, setShowPageManager] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [showSigModal, setShowSigModal] = useState(false)
  const [sigPendingPos, setSigPendingPos] = useState<{x:number,y:number} | null>(null)
  const [history, setHistory] = useState<Annotation[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      setPdfBytes(new Uint8Array(bytes))
      const loaded = await PDFDocument.load(new Uint8Array(bytes))
      setPdfDoc(loaded)
      setNumPages(loaded.getPageCount())
      setCurrentPage(1)
      setAnnotations([])
      setPages(loaded.getPages().map((p: { getWidth: () => number; getHeight: () => number; getRotation: () => { angle: number } }, i: number) => ({
        index: i,
        width: p.getWidth(),
        height: p.getHeight(),
        rotation: p.getRotation().angle,
        scale: 1,
      })))
      setFileKey(k => k + 1)
    } catch (err) {
      setError('Failed to load PDF: ' + (err as Error).message)
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!pdfDoc || !pdfBytes) return
    try {
      let saved: Uint8Array
      if (annotations.length > 0) {
        saved = await burnAnnotations(new Uint8Array(pdfBytes), annotations, scale)
      } else {
        const doc = await PDFDocument.load(new Uint8Array(pdfBytes))
        saved = await doc.save()
      }
      const blob = new Blob([new Uint8Array(saved)], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'edited.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError('Failed to save PDF: ' + (err as Error).message)
    }
  }, [pdfDoc, pdfBytes, annotations, scale])

  const handleMergeOrdered = useCallback(async (
    orderedPages: { source: 'current' | number; pageIndex: number }[],
    files: File[]
  ) => {
    if (!pdfBytes) return
    const result = await mergeOrderedPdfs(new Uint8Array(pdfBytes), orderedPages, files)
    const resultCopy = new Uint8Array(result)
    setPdfBytes(resultCopy)
    const loaded = await PDFDocument.load(new Uint8Array(result))
    setPdfDoc(loaded)
    setNumPages(loaded.getPageCount())
    setCurrentPage(1)
    setAnnotations([])
    setPages(loaded.getPages().map((p: any, i: number) => ({
      index: i,
      width: p.getWidth(),
      height: p.getHeight(),
      rotation: p.getRotation().angle,
      scale: 1,
    })))
  }, [pdfBytes])

  const handleSplit = useCallback(async (pageIndices: number[]) => {
    if (!pdfBytes) return
    const result = await splitPdf(new Uint8Array(pdfBytes), pageIndices)
    const resultCopy = new Uint8Array(result)
    setPdfBytes(resultCopy)
    const loaded = await PDFDocument.load(new Uint8Array(result))
    setPdfDoc(loaded)
    setNumPages(loaded.getPageCount())
    setAnnotations([])
  }, [pdfBytes])

  const handleRotate = useCallback(async (pageIndex: number, degrees: number) => {
    if (!pdfBytes) return
    const result = await rotatePage(new Uint8Array(pdfBytes), pageIndex, degrees)
    const resultCopy = new Uint8Array(result)
    setPdfBytes(resultCopy)
    const loaded = await PDFDocument.load(new Uint8Array(result))
    setPdfDoc(loaded)
    setNumPages(loaded.getPageCount())
    setPages(prev => prev.map((p, i) => i === pageIndex ? { ...p, rotation: (p.rotation + degrees) % 360 } : p))
  }, [pdfBytes])

  const handleDeletePage = useCallback(async (pageIndex: number) => {
    if (!pdfBytes) return
    const result = await deletePage(new Uint8Array(pdfBytes), pageIndex)
    const resultCopy = new Uint8Array(result)
    setPdfBytes(resultCopy)
    const loaded = await PDFDocument.load(new Uint8Array(result))
    setPdfDoc(loaded)
    setNumPages(loaded.getPageCount())
    if (currentPage > loaded.getPageCount()) setCurrentPage(loaded.getPageCount())
    setPages(prev => prev.filter((_, i) => i !== pageIndex).map((p, i) => ({ ...p, index: i })))
    setAnnotations(prev => prev.filter(a => a.pageIndex !== pageIndex).map(a => a.pageIndex > pageIndex ? { ...a, pageIndex: a.pageIndex - 1 } as Annotation : a))
  }, [pdfBytes, currentPage])

  const pushHistory = useCallback((next: Annotation[]) => {
    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1)
      return [...sliced, next]
    })
    setHistoryIndex(prev => prev + 1)
    setAnnotations(next)
  }, [historyIndex])

  const addAnnotation = useCallback((annotation: Annotation) => {
    setAnnotations(prev => {
      const next = [...prev, annotation]
      pushHistory(next)
      return next
    })
  }, [pushHistory])

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const next = prev.filter(a => ('id' in a ? a.id : '') !== id)
      pushHistory(next)
      return next
    })
  }, [pushHistory])

  const undo = useCallback(() => {
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    setAnnotations(history[newIndex])
  }, [history, historyIndex])

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    setAnnotations(history[newIndex])
  }, [history, historyIndex])

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pdfBytes) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const id = Date.now().toString()
        const annotation: Annotation = {
          id, type: 'image', imageData: reader.result as string,
          x: 50, y: 50, width: Math.min(img.width, 200),
          height: Math.min(img.height, 200) * (Math.min(img.width, 200) / img.width),
          pageIndex: currentPage - 1, timestamp: Date.now(),
        }
        addAnnotation(annotation)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }, [pdfBytes, currentPage, addAnnotation])

  const handleSignatureSave = useCallback((dataUrl: string) => {
    const id = Date.now().toString()
    const img = new Image()
    img.onload = () => {
      addAnnotation({
        id, type: 'signature', imageData: dataUrl,
        x: sigPendingPos?.x ?? 100, y: sigPendingPos?.y ?? 100,
        width: 150, height: 60,
        pageIndex: currentPage - 1, timestamp: Date.now(),
      })
      setSigPendingPos(null)
    }
    img.src = dataUrl
  }, [addAnnotation, currentPage, sigPendingPos])

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, numPages)))
  }, [numPages])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-900 text-white">
      <Toolbar
        tool={tool}
        setTool={(t) => {
          if (t === 'signature') {
            setTool('select')
            setShowSigModal(true)
          } else if (t === 'image') {
            setTool('select')
            imageInputRef.current?.click()
          } else {
            setTool(t)
          }
        }}
        onFileUpload={() => fileInputRef.current?.click()}
        onSave={handleSave}
        onTogglePageManager={() => setShowPageManager(v => !v)}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        hasDoc={!!pdfDoc}
      />
      <input
        key={fileKey}
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
      <SignatureModal
        open={showSigModal}
        onClose={() => { setShowSigModal(false); setSigPendingPos(null) }}
        onSave={handleSignatureSave}
      />

      <div className="flex flex-1 overflow-hidden">
        {showPageManager && pdfBytes && (
          <PageManager
            pdfBytes={pdfBytes}
            pages={pages}
            currentPage={currentPage}
            onPageSelect={goToPage}
            onRotate={handleRotate}
            onDelete={handleDeletePage}
            onMergeOrdered={handleMergeOrdered}
            onSplit={handleSplit}
          />
        )}

        <div className="flex-1 flex overflow-hidden">
          <div
            className="flex-1 overflow-auto bg-slate-800 flex justify-center p-4 scrollbar-thin"
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDrop={e => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file && file.type === 'application/pdf') {
                const dt = new DataTransfer()
                dt.items.add(file)
                const input = document.createElement('input')
                input.type = 'file'
                input.files = dt.files
                handleFileUpload({ target: input } as unknown as React.ChangeEvent<HTMLInputElement>)
              }
            }}
          >
            {error && pdfBytes && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
                {error}
                <button onClick={() => setError(null)} className="ml-3 font-bold">×</button>
              </div>
            )}
            {pdfBytes ? (
              <PdfViewer
                pdfBytes={pdfBytes}
                currentPage={currentPage}
                numPages={numPages}
                tool={tool}
                scale={scale}
                annotations={annotations}
                onAddAnnotation={addAnnotation}
                onRemoveAnnotation={removeAnnotation}
                color={color}
                strokeWidth={strokeWidth}
                fontSize={fontSize}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400">
                <div className="text-6xl mb-4">📄</div>
                <p className="text-lg mb-2">No PDF loaded</p>
                {error && (
                  <p className="text-red-400 text-sm mb-2 max-w-md text-center">{error}</p>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
                >
                  Open PDF File
                </button>
                <p className="text-xs text-slate-500 mt-3">or drag and drop a PDF here</p>
              </div>
            )}
          </div>

          <EditorPanel
            tool={tool}
            color={color}
            setColor={setColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
            fontSize={fontSize}
            setFontSize={setFontSize}
            scale={scale}
            setScale={setScale}
            currentPage={currentPage}
            numPages={numPages}
            onPageChange={goToPage}
            annotations={annotations}
            onRemoveAnnotation={removeAnnotation}
          />
        </div>
      </div>
    </div>
  )
}

export default App
