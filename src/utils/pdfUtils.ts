import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib'
import { Annotation } from '../types'

function parseColor(color: string) {
  if (color.startsWith('rgb(')) {
    const parts = color.slice(4, -1).split(',').map(s => parseInt(s.trim()) / 255)
    return rgb(parts[0], parts[1], parts[2])
  }
  const r = parseInt(color.slice(1, 3), 16) / 255
  const g = parseInt(color.slice(3, 5), 16) / 255
  const b = parseInt(color.slice(5, 7), 16) / 255
  return rgb(r, g, b)
}

export async function burnAnnotations(pdfBytes: Uint8Array, annotations: Annotation[], scale = 1.5): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const pages = doc.getPages()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (const a of annotations) {
    try {
      if (a.pageIndex >= pages.length) continue
      const page = pages[a.pageIndex]
      const ph = page.getHeight()

      // Convert viewport coords to PDF coords
      const s = scale
      const x = (n: number) => n / s
      const y = (n: number) => ph - n / s
      const sz = (n: number) => n / s

      if (a.type === 'text') {
        page.drawText(a.text, {
          x: x(a.x),
          y: y(a.y) - sz(a.fontSize),
          size: sz(a.fontSize),
          color: parseColor(a.color),
          font,
        })
      } else if (a.type === 'textEdit') {
        page.drawRectangle({
          x: x(a.x),
          y: y(a.y) - sz(a.height),
          width: sz(a.width),
          height: sz(a.height),
          color: rgb(1, 1, 1),
        })
        page.drawText(a.newText, {
          x: x(a.x),
          y: y(a.y) - sz(a.fontSize * 0.85),
          size: sz(a.fontSize),
          color: parseColor(a.color),
          font,
        })
      } else if (a.type === 'objectDelete') {
        page.drawRectangle({
          x: x(a.x),
          y: y(a.y) - sz(a.height),
          width: sz(a.width),
          height: sz(a.height),
          color: rgb(1, 1, 1),
        })
      } else if (a.type === 'highlight') {
        page.drawRectangle({
          x: x(a.x),
          y: y(a.y) - sz(a.height),
          width: sz(a.width),
          height: sz(a.height),
          color: parseColor(a.color),
          opacity: a.opacity,
        })
      } else if (a.type === 'shape') {
        const strokeColor = parseColor(a.color)
        const sx = x(Math.min(a.x, a.x + a.width))
        const sy = y(Math.max(a.y, a.y + a.height))
        const sw = sz(Math.abs(a.width))
        const sh = sz(Math.abs(a.height))
        if (a.tool === 'rectangle') {
          page.drawRectangle({ x: sx, y: sy, width: sw, height: sh, borderColor: strokeColor, borderWidth: a.strokeWidth })
        } else if (a.tool === 'line' || a.tool === 'arrow') {
          page.drawLine({
            start: { x: x(a.x), y: y(a.y) },
            end: { x: x(a.x + a.width), y: y(a.y + a.height) },
            thickness: a.strokeWidth,
            color: strokeColor,
          })
        }
      } else if (a.type === 'image' || a.type === 'signature') {
        try {
          const imgData = a.imageData
          let img
          if (imgData.startsWith('data:image/png')) {
            img = await doc.embedPng(imgData)
          } else {
            img = await doc.embedJpg(imgData)
          }
          page.drawImage(img, {
            x: x(a.x),
            y: y(a.y) - sz(a.height),
            width: sz(a.width),
            height: sz(a.height),
          })
        } catch { /* skip unsupported image format */ }
      }
    } catch { /* skip invalid annotation */ }
  }

  return doc.save()
}

export async function mergePdfs(basePdf: Uint8Array, files: File[], pageSelections?: Map<number, number[]>): Promise<Uint8Array> {
  const base = await PDFDocument.load(basePdf)
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const arr = await file.arrayBuffer()
    const other = await PDFDocument.load(new Uint8Array(arr))
    const indices = pageSelections?.get(i) ?? other.getPageIndices()
    const pages = await base.copyPages(other, indices)
    pages.forEach(p => base.addPage(p))
  }
  return base.save()
}

export async function mergeOrderedPdfs(
  basePdf: Uint8Array,
  orderedPages: { source: 'current' | number; pageIndex: number }[],
  files: File[]
): Promise<Uint8Array> {
  const result = await PDFDocument.create()
  const currentDoc = await PDFDocument.load(basePdf)
  // Load all incoming files
  const fileDocs: PDFDocument[] = []
  for (const file of files) {
    const arr = await file.arrayBuffer()
    fileDocs.push(await PDFDocument.load(new Uint8Array(arr)))
  }
  // Copy pages in the specified order
  for (const entry of orderedPages) {
    const srcDoc = entry.source === 'current' ? currentDoc : fileDocs[entry.source]
    if (!srcDoc) continue
    const [copiedPage] = await result.copyPages(srcDoc, [entry.pageIndex])
    result.addPage(copiedPage)
  }
  return result.save()
}

export async function splitPdf(pdfBytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const newDoc = await PDFDocument.create()
  const pages = await newDoc.copyPages(doc, pageIndices)
  pages.forEach(p => newDoc.addPage(p))
  return newDoc.save()
}

export async function rotatePage(pdfBytes: Uint8Array, pageIndex: number, degreesVal: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPage(pageIndex)
  page.setRotation(degrees(degreesVal))
  return doc.save()
}

export async function deletePage(pdfBytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  doc.removePage(pageIndex)
  return doc.save()
}

export async function reorderPages(pdfBytes: Uint8Array, newOrder: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const newDoc = await PDFDocument.create()
  const pages = await newDoc.copyPages(doc, newOrder)
  pages.forEach(p => newDoc.addPage(p))
  return newDoc.save()
}

export async function extractText(_pdfBytes: Uint8Array): Promise<string> {
  // This would require pdf.js text extraction
  // Returning placeholder for now
  return 'Text extraction requires pdf.js getTextContent'
}

export async function addWatermark(pdfBytes: Uint8Array, text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  doc.getPages().forEach(page => {
    page.drawText(text, {
      x: page.getWidth() / 2 - text.length * 3,
      y: page.getHeight() / 2,
      size: 40,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.3,
      rotate: degrees(45),
    })
  })
  return doc.save()
}
