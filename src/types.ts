export type Tool =
  | 'select'
  | 'object'
  | 'text'
  | 'draw'
  | 'highlight'
  | 'eraser'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'signature'
  | 'image'
  | 'stamp'

export interface Point {
  x: number
  y: number
}

export interface DrawingStroke {
  id: string
  type: 'drawing'
  tool: Tool
  points: Point[]
  color: string
  width: number
  pageIndex: number
  timestamp: number
}

export interface TextAnnotation {
  id: string
  type: 'text'
  text: string
  x: number
  y: number
  pageIndex: number
  color: string
  fontSize: number
  timestamp: number
}

export interface ShapeAnnotation {
  id: string
  type: 'shape'
  tool: 'rectangle' | 'circle' | 'line' | 'arrow'
  x: number
  y: number
  width: number
  height: number
  color: string
  strokeWidth: number
  pageIndex: number
  timestamp: number
  fillColor?: string
}

export interface HighlightAnnotation {
  id: string
  type: 'highlight'
  x: number
  y: number
  width: number
  height: number
  color: string
  pageIndex: number
  timestamp: number
  opacity: number
}

export interface SignatureAnnotation {
  id: string
  type: 'signature'
  imageData: string
  x: number
  y: number
  width: number
  height: number
  pageIndex: number
  timestamp: number
}

export interface ImageAnnotation {
  id: string
  type: 'image'
  imageData: string
  x: number
  y: number
  width: number
  height: number
  pageIndex: number
  timestamp: number
}

export interface TextEditAnnotation {
  id: string
  type: 'textEdit'
  originalText: string
  newText: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  color: string
  pageIndex: number
  timestamp: number
}

export interface ObjectDeleteAnnotation {
  id: string
  type: 'objectDelete'
  x: number
  y: number
  width: number
  height: number
  pageIndex: number
  timestamp: number
}

export type Annotation =
  | DrawingStroke
  | TextAnnotation
  | ShapeAnnotation
  | HighlightAnnotation
  | SignatureAnnotation
  | ImageAnnotation
  | TextEditAnnotation
  | ObjectDeleteAnnotation

export interface PageInfo {
  index: number
  width: number
  height: number
  rotation: number
  scale: number
}
