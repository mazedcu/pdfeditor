import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { Tool, Annotation, Point } from '../types'

interface TextItem {
  id: string
  str: string
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  color: string
  dir: string
  transform: number[]
}

interface ImageItem {
  id: string
  left: number
  top: number
  width: number
  height: number
  imageData: string
}

type PdfObject = (TextItem & { kind: 'text' }) | (ImageItem & { kind: 'image' })

interface Props {
  pdfBytes: Uint8Array
  currentPage: number
  numPages: number
  tool: Tool
  scale: number
  annotations: Annotation[]
  onAddAnnotation: (a: Annotation) => void
  onRemoveAnnotation: (id: string) => void
  color: string
  strokeWidth: number
  fontSize: number
}

export default function PdfViewer({ pdfBytes, currentPage, tool, scale, annotations, onAddAnnotation, onRemoveAnnotation, color, strokeWidth, fontSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [pw, setPw] = useState(0)
  const [ph, setPh] = useState(0)
  const [textItems, setTextItems] = useState<TextItem[]>([])
  const [imageItems, setImageItems] = useState<ImageItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  // Object mode state
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null)
  const [objDragPos, setObjDragPos] = useState<{ x: number; y: number } | null>(null)
  const objDragging = useRef(false)
  const objDragOffset = useRef<Point>({ x: 0, y: 0 })

  // Drawing state
  const isDrawing = useRef(false)
  const pts = useRef<Point[]>([])
  const sp = useRef<Point | null>(null)
  const [ti, setTi] = useState<{ x: number; y: number; v: boolean }>({ x: 0, y: 0, v: false })

  // Annotation select state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dragging = useRef(false)
  const dragOffset = useRef<Point>({ x: 0, y: 0 })
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

  // Deleted object IDs (objects removed in object mode)
  const [deletedObjIds, setDeletedObjIds] = useState<Set<string>>(new Set())
  // Moved objects: original id -> new position
  const [movedObjs, setMovedObjs] = useState<Map<string, { x: number; y: number }>>(new Map())

  useEffect(() => {
    pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise.then(setPdf)
  }, [pdfBytes])

  useEffect(() => {
    if (!pdf) return
    pdf.getPage(currentPage).then(async page => {
      const vp = page.getViewport({ scale })
      const c = canvasRef.current!
      c.width = vp.width
      c.height = vp.height
      setPw(vp.width)
      setPh(vp.height)
      await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise

      // Extract text items with color sampling
      const textContent = await page.getTextContent()
      const items: TextItem[] = []
      const canvasCtx = c.getContext('2d')!
      textContent.items.forEach((item, idx) => {
        if ('str' in item && item.str.trim()) {
          const t = item.transform as number[]
          const [vx, vy] = vp.convertToViewportPoint(t[4], t[5])
          const fontSizePx = Math.sqrt(t[0] * t[0] + t[1] * t[1]) * scale
          const w = (item as any).width ? (item as any).width * scale : fontSizePx * item.str.length * 0.5
          const h = fontSizePx * 1.3
          const left = vx
          const top = vy - fontSizePx * 0.85
          const width = Math.max(w, 10)

          // Sample text color from rendered canvas
          let textColor = '#000000'
          try {
            const sampleX = Math.round(left + Math.min(width, fontSizePx) * 0.3)
            const sampleY = Math.round(top + h * 0.6)
            if (sampleX > 0 && sampleX < c.width && sampleY > 0 && sampleY < c.height) {
              const pixel = canvasCtx.getImageData(sampleX, sampleY, 1, 1).data
              // Only use sampled color if not white/near-white (background)
              if (pixel[0] < 240 || pixel[1] < 240 || pixel[2] < 240) {
                textColor = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`
              }
            }
          } catch { /* fallback to black */ }

          items.push({
            id: `p${currentPage}-t${idx}`,
            str: item.str,
            left,
            top,
            width,
            height: h,
            fontSize: fontSizePx,
            color: textColor,
            dir: item.dir,
            transform: t,
          })
        }
      })
      setTextItems(items)

      // Extract images from operator list
      const images: ImageItem[] = []
      try {
        const opList = await page.getOperatorList()
        const OPS = pdfjs.OPS
        const matrixStack: number[][] = []
        let ctm = [scale, 0, 0, scale, 0, 0]

        const multiplyMatrix = (a: number[], b: number[]) => [
          a[0] * b[0] + a[2] * b[1],
          a[1] * b[0] + a[3] * b[1],
          a[0] * b[2] + a[2] * b[3],
          a[1] * b[2] + a[3] * b[3],
          a[0] * b[4] + a[2] * b[5] + a[4],
          a[1] * b[4] + a[3] * b[5] + a[5],
        ]

        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i]
          const args = opList.argsArray[i]

          if (fn === OPS.save) {
            matrixStack.push([...ctm])
          } else if (fn === OPS.restore) {
            ctm = matrixStack.pop() || [scale, 0, 0, scale, 0, 0]
          } else if (fn === OPS.transform) {
            ctm = multiplyMatrix(ctm, args as number[])
          } else if (fn === OPS.paintImageXObject) {
            const imgW = Math.abs(Math.sqrt(ctm[0] * ctm[0] + ctm[1] * ctm[1]))
            const imgH = Math.abs(Math.sqrt(ctm[2] * ctm[2] + ctm[3] * ctm[3]))
            const imgX = ctm[4]
            const imgY = ctm[5] - imgH

            if (imgW > 20 && imgH > 20) {
              // Capture image data from the rendered canvas
              const sx = Math.max(0, Math.round(imgX))
              const sy = Math.max(0, Math.round(imgY))
              const sw = Math.min(Math.round(imgW), c.width - sx)
              const sh = Math.min(Math.round(imgH), c.height - sy)
              if (sw > 0 && sh > 0) {
                const tmpCanvas = document.createElement('canvas')
                tmpCanvas.width = sw
                tmpCanvas.height = sh
                const tmpCtx = tmpCanvas.getContext('2d')!
                tmpCtx.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh)
                const dataUrl = tmpCanvas.toDataURL('image/png')
                images.push({
                  id: `p${currentPage}-img${images.length}`,
                  left: imgX,
                  top: imgY,
                  width: imgW,
                  height: imgH,
                  imageData: dataUrl,
                })
              }
            }
          }
        }
      } catch { /* ignore image extraction errors */ }
      setImageItems(images)
    })
  }, [pdf, currentPage, scale])

  // Get all pdf objects for object mode (includes textEdit annotations)
  const getPdfObjects = useCallback((): PdfObject[] => {
    const objs: PdfObject[] = []
    // Collect IDs of text items that have been edited (replaced by textEdit annotations)
    const editedIds = new Set(
      annotations
        .filter(a => a.type === 'textEdit' && a.pageIndex === currentPage - 1)
        .map(a => a.id)
    )
    // Add original text items that haven't been edited
    textItems.forEach(t => {
      if (!editedIds.has(t.id)) {
        objs.push({ ...t, kind: 'text' })
      }
    })
    // Add textEdit annotations as text objects
    annotations
      .filter(a => a.type === 'textEdit' && a.pageIndex === currentPage - 1)
      .forEach(a => {
        if (a.type === 'textEdit') {
          objs.push({
            id: a.id,
            str: a.newText,
            left: a.x,
            top: a.y,
            width: a.width,
            height: a.height,
            fontSize: a.fontSize,
            color: a.color,
            dir: 'ltr',
            transform: [],
            kind: 'text',
          })
        }
      })
    imageItems.forEach(img => objs.push({ ...img, kind: 'image' }))
    return objs
  }, [textItems, imageItems, annotations, currentPage])

  // Render annotations on overlay canvas
  useEffect(() => {
    const o = overlayRef.current
    if (!o) return
    o.width = pw
    o.height = ph
    const ctx = o.getContext('2d')!
    ctx.clearRect(0, 0, pw, ph)

    annotations.filter(a => a.pageIndex === currentPage - 1).forEach(a => {
      if (a.type === 'drawing') {
        ctx.beginPath()
        ctx.strokeStyle = a.color
        ctx.lineWidth = a.width
        a.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
        ctx.stroke()
      } else if (a.type === 'text') {
        ctx.font = `${a.fontSize}px sans-serif`
        ctx.fillStyle = a.color
        ctx.fillText(a.text, a.x, a.y)
      } else if (a.type === 'shape') {
        ctx.strokeStyle = a.color
        ctx.lineWidth = a.strokeWidth
        if (a.tool === 'rectangle') ctx.strokeRect(a.x, a.y, a.width, a.height)
        else if (a.tool === 'circle') { ctx.beginPath(); ctx.ellipse(a.x + a.width / 2, a.y + a.height / 2, Math.abs(a.width / 2), Math.abs(a.height / 2), 0, 0, Math.PI * 2); ctx.stroke() }
        else if (a.tool === 'line' || a.tool === 'arrow') { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + a.width, a.y + a.height); ctx.stroke() }
      } else if (a.type === 'highlight') {
        ctx.fillStyle = a.color
        ctx.globalAlpha = a.opacity
        ctx.fillRect(a.x, a.y, a.width, a.height)
        ctx.globalAlpha = 1
      } else if (a.type === 'textEdit') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(a.x, a.y, a.width, a.height)
        ctx.font = `${a.fontSize}px sans-serif`
        ctx.fillStyle = a.color || '#000000'
        ctx.fillText(a.newText, a.x, a.y + a.fontSize * 0.85)
      } else if (a.type === 'objectDelete') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(a.x, a.y, a.width, a.height)
      } else if (a.type === 'image' || a.type === 'signature') {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, a.x, a.y, a.width, a.height)
        img.src = a.imageData
      }
    })

    // Draw selection box for annotation select mode
    if (selectedId && tool === 'select') {
      const sel = annotations.find(a => a.id === selectedId && a.pageIndex === currentPage - 1)
      if (sel && sel.type !== 'drawing' && 'x' in sel) {
        const sx = dragPos && sel.id === selectedId ? dragPos.x : sel.x
        const sy = dragPos && sel.id === selectedId ? dragPos.y : sel.y
        const sw = 'width' in sel ? sel.width : 0
        const sh = 'height' in sel ? sel.height : 0
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 3])
        ctx.strokeRect(sx - 2, sy - 2, sw + 4, sh + 4)
        ctx.setLineDash([])
      }
    }

    // Draw object selection in object mode
    if (selectedObjId && tool === 'object') {
      const objs = getPdfObjects()
      const obj = objs.find(o => o.id === selectedObjId)
      if (obj) {
        const moved = movedObjs.get(obj.id)
        const ox = objDragPos ? objDragPos.x : (moved ? moved.x : obj.left)
        const oy = objDragPos ? objDragPos.y : (moved ? moved.y : obj.top)
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.strokeRect(ox - 3, oy - 3, obj.width + 6, obj.height + 6)
        ctx.setLineDash([])
        // Corner handles
        const handleSize = 8
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(ox - handleSize / 2, oy - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(ox + obj.width - handleSize / 2, oy - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(ox - handleSize / 2, oy + obj.height - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(ox + obj.width - handleSize / 2, oy + obj.height - handleSize / 2, handleSize, handleSize)
      }
    }
  }, [annotations, currentPage, pw, ph, selectedId, dragPos, selectedObjId, objDragPos, tool, movedObjs, getPdfObjects])

  // Keyboard handler for delete in object mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (tool === 'object' && selectedObjId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        deleteSelectedObject()
      }
      if (tool === 'select' && selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        onRemoveAnnotation(selectedId)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tool, selectedObjId, selectedId])

  const deleteSelectedObject = () => {
    if (!selectedObjId) return
    const objs = getPdfObjects()
    const obj = objs.find(o => o.id === selectedObjId)
    if (!obj) return

    const moved = movedObjs.get(obj.id)
    const ox = moved ? moved.x : obj.left
    const oy = moved ? moved.y : obj.top

    // If this is a textEdit annotation, remove that annotation first
    const isEditedText = annotations.some(a => a.type === 'textEdit' && a.id === obj.id && a.pageIndex === currentPage - 1)
    if (isEditedText) {
      onRemoveAnnotation(obj.id)
    }

    // Add white-out annotation at object position
    onAddAnnotation({
      id: `del-${Date.now()}`,
      type: 'objectDelete',
      x: ox - 2,
      y: oy - 2,
      width: obj.width + 4,
      height: obj.height + 4,
      pageIndex: currentPage - 1,
      timestamp: Date.now(),
    })

    setDeletedObjIds(prev => new Set(prev).add(selectedObjId))
    setSelectedObjId(null)
    setObjDragPos(null)
  }

  const getPos = (e: React.MouseEvent) => {
    const r = (containerRef.current || overlayRef.current!).getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const hitTest = (p: Point): Annotation | null => {
    const pageAnns = annotations.filter(a => a.pageIndex === currentPage - 1)
    for (let i = pageAnns.length - 1; i >= 0; i--) {
      const a = pageAnns[i]
      if (a.type === 'drawing') continue
      const ax = dragPos && a.id === selectedId ? dragPos.x : ('x' in a ? a.x : 0)
      const ay = dragPos && a.id === selectedId ? dragPos.y : ('y' in a ? a.y : 0)
      const aw = 'width' in a ? a.width : 0
      const ah = 'height' in a ? a.height : 0
      if (p.x >= ax && p.x <= ax + aw && p.y >= ay && p.y <= ay + ah) return a
    }
    return null
  }

  const hitTestObject = (p: Point): PdfObject | null => {
    const objs = getPdfObjects()
    for (let i = objs.length - 1; i >= 0; i--) {
      const obj = objs[i]
      if (deletedObjIds.has(obj.id)) continue
      const moved = movedObjs.get(obj.id)
      const ox = moved ? moved.x : obj.left
      const oy = moved ? moved.y : obj.top
      if (p.x >= ox && p.x <= ox + obj.width && p.y >= oy && p.y <= oy + obj.height) return obj
    }
    return null
  }

  // Mouse handlers for overlay canvas (drawing tools + select mode annotations)
  const onDown = (e: React.MouseEvent) => {
    const p = getPos(e)
    if (tool === 'select') {
      if (editingId) { setEditingId(null); return }
      const target = e.target as HTMLElement
      if (target.tagName === 'SPAN' || target.tagName === 'INPUT') return
      const hit = hitTest(p)
      if (hit && 'x' in hit) {
        setSelectedId(hit.id)
        dragging.current = true
        const ax = dragPos && hit.id === selectedId ? dragPos.x : hit.x
        const ay = dragPos && hit.id === selectedId ? dragPos.y : hit.y
        dragOffset.current = { x: p.x - ax, y: p.y - ay }
        setDragPos({ x: ax, y: ay })
        return
      }
      setSelectedId(null)
      setDragPos(null)
      return
    }
    if (tool === 'object') return // handled by object layer
    isDrawing.current = true
    sp.current = p
    if (tool === 'draw' || tool === 'eraser') pts.current = [p]
    else if (tool === 'text') { setTi({ x: p.x, y: p.y, v: true }); isDrawing.current = false }
  }

  const onMove = (e: React.MouseEvent) => {
    if (dragging.current && tool === 'select' && selectedId) {
      const p = getPos(e)
      setDragPos({ x: p.x - dragOffset.current.x, y: p.y - dragOffset.current.y })
      return
    }
    if (!isDrawing.current) return
    const p = getPos(e)
    if (tool === 'draw') {
      pts.current.push(p)
      const ctx = overlayRef.current!.getContext('2d')!
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = strokeWidth
      const ls = pts.current
      ctx.moveTo(ls[ls.length - 2].x, ls[ls.length - 2].y); ctx.lineTo(p.x, p.y); ctx.stroke()
    } else if (tool === 'eraser') {
      const ctx = overlayRef.current!.getContext('2d')!
      ctx.clearRect(p.x - 10, p.y - 10, 20, 20)
    }
  }

  const onUp = (e: React.MouseEvent) => {
    if (dragging.current && tool === 'select' && selectedId && dragPos) {
      dragging.current = false
      const ann = annotations.find(a => a.id === selectedId)
      if (ann && 'x' in ann) {
        const updated = { ...ann, x: dragPos.x, y: dragPos.y } as Annotation
        onRemoveAnnotation(selectedId)
        onAddAnnotation(updated)
      }
      setDragPos(null)
      return
    }
    if (!isDrawing.current) return
    isDrawing.current = false
    const ep = getPos(e)
    const id = Date.now().toString()
    if (tool === 'draw' && pts.current.length > 1) {
      onAddAnnotation({ id, type: 'drawing', tool: 'draw', points: pts.current, color, width: strokeWidth, pageIndex: currentPage - 1, timestamp: Date.now() })
    } else if (['rectangle', 'circle', 'line', 'arrow'].includes(tool)) {
      onAddAnnotation({ id, type: 'shape', tool: tool as 'rectangle' | 'circle' | 'line' | 'arrow', x: Math.min(sp.current!.x, ep.x), y: Math.min(sp.current!.y, ep.y), width: ep.x - sp.current!.x, height: ep.y - sp.current!.y, color, strokeWidth, pageIndex: currentPage - 1, timestamp: Date.now() })
    } else if (tool === 'highlight') {
      onAddAnnotation({ id, type: 'highlight', x: Math.min(sp.current!.x, ep.x), y: Math.min(sp.current!.y, ep.y), width: Math.abs(ep.x - sp.current!.x), height: Math.abs(ep.y - sp.current!.y), color, pageIndex: currentPage - 1, timestamp: Date.now(), opacity: 0.3 })
    }
    pts.current = []; sp.current = null
  }

  const submitText = (txt: string) => {
    if (!txt.trim()) { setTi({ ...ti, v: false }); return }
    onAddAnnotation({ id: Date.now().toString(), type: 'text', text: txt, x: ti.x, y: ti.y, pageIndex: currentPage - 1, color, fontSize, timestamp: Date.now() })
    setTi({ ...ti, v: false })
  }

  const startTextEdit = (item: TextItem) => {
    if (tool !== 'select') return
    setEditingId(item.id)
    const existing = annotations.find(a => a.type === 'textEdit' && a.id === item.id && a.pageIndex === currentPage - 1) as any
    setEditValue(existing ? existing.newText : item.str)
    requestAnimationFrame(() => {
      editRef.current?.focus()
      editRef.current?.select()
    })
  }

  const commitTextEdit = (item: TextItem) => {
    if (!editValue.trim()) { setEditingId(null); return }
    const prev = annotations.find(a => a.type === 'textEdit' && a.id === item.id && a.pageIndex === currentPage - 1)
    if (prev) onRemoveAnnotation(prev.id)
    onAddAnnotation({
      id: item.id,
      type: 'textEdit',
      originalText: item.str,
      newText: editValue,
      x: item.left,
      y: item.top,
      width: item.width,
      height: item.height,
      fontSize: item.fontSize,
      color: item.color,
      pageIndex: currentPage - 1,
      timestamp: Date.now(),
    })
    setEditingId(null)
  }

  // Object mode mouse handlers
  const onObjDown = (e: React.MouseEvent) => {
    if (tool !== 'object') return
    e.preventDefault()
    e.stopPropagation()
    const p = getPos(e)
    const hit = hitTestObject(p)
    if (hit) {
      setSelectedObjId(hit.id)
      objDragging.current = true
      const moved = movedObjs.get(hit.id)
      const ox = moved ? moved.x : hit.left
      const oy = moved ? moved.y : hit.top
      objDragOffset.current = { x: p.x - ox, y: p.y - oy }
      setObjDragPos({ x: ox, y: oy })
    } else {
      setSelectedObjId(null)
      setObjDragPos(null)
    }
  }

  const onObjMove = (e: React.MouseEvent) => {
    if (!objDragging.current || tool !== 'object') return
    const p = getPos(e)
    setObjDragPos({ x: p.x - objDragOffset.current.x, y: p.y - objDragOffset.current.y })
  }

  const onObjUp = () => {
    if (!objDragging.current || !selectedObjId) { objDragging.current = false; return }
    objDragging.current = false
    if (!objDragPos) return

    const objs = getPdfObjects()
    const obj = objs.find(o => o.id === selectedObjId)
    if (!obj) return

    const origMoved = movedObjs.get(obj.id)
    const origX = origMoved ? origMoved.x : obj.left
    const origY = origMoved ? origMoved.y : obj.top

    // Only commit if actually moved
    const dx = Math.abs(objDragPos.x - origX)
    const dy = Math.abs(objDragPos.y - origY)
    if (dx > 2 || dy > 2) {
      // If this is a textEdit annotation, remove it before re-placing
      const isEditedText = annotations.some(a => a.type === 'textEdit' && a.id === obj.id && a.pageIndex === currentPage - 1)
      if (isEditedText) {
        onRemoveAnnotation(obj.id)
      }

      // White-out original position
      onAddAnnotation({
        id: `move-del-${Date.now()}`,
        type: 'objectDelete',
        x: origX - 2,
        y: origY - 2,
        width: obj.width + 4,
        height: obj.height + 4,
        pageIndex: currentPage - 1,
        timestamp: Date.now(),
      })

      // Place content at new position
      if (obj.kind === 'text') {
        onAddAnnotation({
          id: `move-txt-${Date.now()}`,
          type: 'textEdit',
          originalText: obj.str,
          newText: obj.str,
          x: objDragPos.x,
          y: objDragPos.y,
          width: obj.width,
          height: obj.height,
          fontSize: obj.fontSize,
          color: obj.color,
          pageIndex: currentPage - 1,
          timestamp: Date.now(),
        })
      } else if (obj.kind === 'image') {
        onAddAnnotation({
          id: `move-img-${Date.now()}`,
          type: 'image',
          imageData: obj.imageData,
          x: objDragPos.x,
          y: objDragPos.y,
          width: obj.width,
          height: obj.height,
          pageIndex: currentPage - 1,
          timestamp: Date.now(),
        })
      }

      // Track moved position locally
      setMovedObjs(prev => {
        const next = new Map(prev)
        next.set(obj.id, { x: objDragPos.x, y: objDragPos.y })
        return next
      })
    }
    setObjDragPos(null)
  }

  return (
    <div ref={containerRef} className="relative shadow-2xl" tabIndex={0}>
      <canvas ref={canvasRef} className="block bg-white shadow-lg" />

      {/* Text edit layer - visible in select mode */}
      {tool === 'select' && (
        <div className="absolute top-0 left-0 z-10" style={{ width: pw, height: ph, pointerEvents: 'auto' }}>
          {textItems.filter(t => !deletedObjIds.has(t.id)).map(item => (
            editingId === item.id ? (
              <input
                key={item.id}
                ref={editRef}
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitTextEdit(item)}
                onKeyDown={e => { if (e.key === 'Enter') commitTextEdit(item) }}
                className="absolute border-2 border-blue-500 bg-white px-1 outline-none z-20"
                style={{
                  left: item.left,
                  top: item.top,
                  width: Math.max(item.width, editValue.length * item.fontSize * 0.55),
                  height: item.height,
                  fontSize: item.fontSize,
                  lineHeight: `${item.height}px`,
                  fontFamily: 'sans-serif',
                  color: item.color,
                  minWidth: item.width,
                }}
              />
            ) : (
              <span
                key={item.id}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); startTextEdit(item) }}
                className="absolute cursor-text group"
                style={{
                  left: item.left,
                  top: item.top,
                  width: item.width,
                  height: item.height,
                  fontSize: item.fontSize,
                  lineHeight: `${item.height}px`,
                  color: 'transparent',
                  fontFamily: 'sans-serif',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
                title="Click to edit text"
              >
                {item.str}
                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-blue-500/10 ring-1 ring-blue-400/40 pointer-events-none transition-opacity" />
              </span>
            )
          ))}
        </div>
      )}

      {/* Object mode layer - visible in object mode */}
      {tool === 'object' && (
        <div
          className="absolute top-0 left-0 z-10"
          style={{ width: pw, height: ph, cursor: 'default' }}
          onMouseDown={onObjDown}
          onMouseMove={onObjMove}
          onMouseUp={onObjUp}
          onMouseLeave={onObjUp}
        >
          {/* Render object outlines on hover */}
          {getPdfObjects().filter(obj => !deletedObjIds.has(obj.id)).map(obj => {
            const moved = movedObjs.get(obj.id)
            const ox = objDragPos && obj.id === selectedObjId ? objDragPos.x : (moved ? moved.x : obj.left)
            const oy = objDragPos && obj.id === selectedObjId ? objDragPos.y : (moved ? moved.y : obj.top)
            const isSelected = obj.id === selectedObjId
            return (
              <div
                key={obj.id}
                className={`absolute border transition-colors ${isSelected ? 'border-red-500 bg-red-500/10' : 'border-transparent hover:border-blue-400 hover:bg-blue-400/5'}`}
                style={{
                  left: ox - 2,
                  top: oy - 2,
                  width: obj.width + 4,
                  height: obj.height + 4,
                  cursor: isSelected ? 'move' : 'pointer',
                  pointerEvents: 'none',
                }}
              />
            )
          })}
          {/* Info bar */}
          {selectedObjId && (
            <div className="absolute top-2 left-2 bg-slate-800/90 text-white text-xs px-3 py-1.5 rounded-md flex items-center gap-3 z-30 pointer-events-auto">
              <span className="font-medium">
                {getPdfObjects().find(o => o.id === selectedObjId)?.kind === 'text' ? '📝 Text' : '🖼️ Image'} selected
              </span>
              <button
                onClick={deleteSelectedObject}
                className="bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded text-xs font-medium"
              >
                Delete
              </button>
              <span className="text-slate-400">or press Del key</span>
            </div>
          )}
        </div>
      )}

      {/* Annotation overlay */}
      <canvas
        ref={overlayRef}
        className="absolute top-0 left-0"
        style={{
          width: pw,
          height: ph,
          cursor: tool === 'select' ? 'default' : tool === 'object' ? 'default' : 'crosshair',
          pointerEvents: (tool === 'select' || tool === 'object') ? 'none' : 'auto',
          zIndex: (tool === 'select' || tool === 'object') ? 5 : 15,
        }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      />

      {/* New text annotation */}
      {ti.v && (
        <input
          autoFocus
          className="absolute bg-transparent border border-blue-400 text-black px-1 outline-none z-30"
          style={{ left: ti.x, top: ti.y, fontSize }}
          onBlur={e => submitText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitText((e.target as HTMLInputElement).value) }}
        />
      )}
    </div>
  )
}
