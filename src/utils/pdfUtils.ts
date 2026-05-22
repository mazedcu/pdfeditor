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

export async function burnAnnotations(pdfBytes: Uint8Array, annotations: Annotation[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const pages = doc.getPages()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  annotations.forEach(a => {
    if (a.pageIndex >= pages.length) return
    const page = pages[a.pageIndex]
    const pw = page.getWidth()
    const ph = page.getHeight()

    if (a.type === 'text') {
      page.drawText(a.text, {
        x: a.x * (pw / 1000),
        y: ph - (a.y * (ph / 1000)) - a.fontSize,
        size: a.fontSize,
        color: parseColor(a.color),
        font,
      })
    } else if (a.type === 'textEdit') {
      // White-out old text area
      page.drawRectangle({
        x: a.x,
        y: ph - a.y - a.height,
        width: a.width,
        height: a.height,
        color: rgb(1, 1, 1),
      })
      page.drawText(a.newText, {
        x: a.x,
        y: ph - a.y - a.fontSize,
        size: a.fontSize,
        color: parseColor(a.color),
        font,
      })
    } else if (a.type === 'objectDelete') {
      page.drawRectangle({
        x: a.x,
        y: ph - a.y - a.height,
        width: a.width,
        height: a.height,
        color: rgb(1, 1, 1),
      })
    } else if (a.type === 'highlight') {
      page.drawRectangle({
        x: a.x,
        y: ph - a.y - a.height,
        width: a.width,
        height: a.height,
        color: parseColor(a.color),
        opacity: a.opacity,
      })
    } else if (a.type === 'shape') {
      const strokeColor = parseColor(a.color)
      if (a.tool === 'rectangle') {
        page.drawRectangle({
          x: Math.min(a.x, a.x + a.width),
          y: ph - Math.max(a.y, a.y + a.height),
          width: Math.abs(a.width),
          height: Math.abs(a.height),
          borderColor: strokeColor,
          borderWidth: a.strokeWidth,
        })
      } else if (a.tool === 'line' || a.tool === 'arrow') {
        page.drawLine({
          start: { x: a.x, y: ph - a.y },
          end: { x: a.x + a.width, y: ph - (a.y + a.height) },
          thickness: a.strokeWidth,
          color: strokeColor,
        })
      }
    }
  })

  return doc.save()
}

export async function mergePdfs(basePdf: Uint8Array, files: File[]): Promise<Uint8Array> {
  const base = await PDFDocument.load(basePdf)
  for (const file of files) {
    const arr = await file.arrayBuffer()
    const other = await PDFDocument.load(new Uint8Array(arr))
    const pages = await base.copyPages(other, other.getPageIndices())
    pages.forEach(p => base.addPage(p))
  }
  return base.save()
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
