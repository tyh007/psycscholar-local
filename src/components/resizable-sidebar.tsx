"use client"

import { useEffect, useRef, type ReactNode } from 'react'

export function ResizableSidebar({
  width,
  onWidthChange,
  children
}: {
  width: number
  onWidthChange: (w: number) => void
  children: ReactNode
}) {
  const dragging = useRef(false)
  const start = useRef({ x: 0, w: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const next = Math.min(520, Math.max(200, start.current.w + e.clientX - start.current.x))
      onWidthChange(next)
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onWidthChange])

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-background"
      style={{ width }}
    >
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
        onMouseDown={(e) => {
          dragging.current = true
          start.current = { x: e.clientX, w: width }
          e.preventDefault()
        }}
      />
    </div>
  )
}
