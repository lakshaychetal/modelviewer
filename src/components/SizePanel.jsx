import React, { useMemo } from 'react'

export default function SizePanel({
  currentDimsCm,
  targetCm,
  onTargetCm,
  lockAspect,
  onLockAspect,
  anchor,
  onAnchor,
  onApply,
  onReset,
}) {
  const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-')
  const ratio = useMemo(() => {
    if (!currentDimsCm) return '-'
    const { x, y, z } = currentDimsCm
    const ax = anchor === 'x'
    const ay = anchor === 'y'
    const az = anchor === 'z'
    const t = targetCm
    const r = ax ? (t.x / x) : ay ? (t.y / y) : (t.z / z)
    return Number.isFinite(r) ? r.toFixed(3) + '×' : '-'
  }, [currentDimsCm, targetCm, anchor])

  const set = (k) => (e) => {
    const v = Number(e.target.value)
    onTargetCm({ ...targetCm, [k]: isNaN(v) ? 0 : v })
  }

  return (
    <section className="p-4 border-t bg-white/70">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Real‑world size</h2>
      </div>
      <div className="text-xs text-gray-600 mb-3">Current (cm): {fmt(currentDimsCm?.x)} × {fmt(currentDimsCm?.y)} × {fmt(currentDimsCm?.z)}</div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Width X (cm)</label>
          <input type="number" step="0.1" className="w-full border rounded px-2 py-1" value={targetCm.x} onChange={set('x')} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Height Y (cm)</label>
          <input type="number" step="0.1" className="w-full border rounded px-2 py-1" value={targetCm.y} onChange={set('y')} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Depth Z (cm)</label>
          <input type="number" step="0.1" className="w-full border rounded px-2 py-1" value={targetCm.z} onChange={set('z')} />
        </div>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lockAspect} onChange={(e) => onLockAspect(e.target.checked)} /> Lock proportions (uniform)
        </label>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-xs text-gray-600">Anchor:</span>
          <label className="inline-flex items-center gap-1"><input type="radio" name="anchor" checked={anchor==='x'} onChange={() => onAnchor('x')} /> X</label>
          <label className="inline-flex items-center gap-1"><input type="radio" name="anchor" checked={anchor==='y'} onChange={() => onAnchor('y')} /> Y</label>
          <label className="inline-flex items-center gap-1"><input type="radio" name="anchor" checked={anchor==='z'} onChange={() => onAnchor('z')} /> Z</label>
          <span className="text-xs text-gray-500 ml-2">Uniform scale: {ratio}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700" onClick={onApply}>Apply size</button>
        <button className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200" onClick={onReset}>Reset size</button>
      </div>
      <p className="text-xs text-gray-500 mt-2">Units export in meters (glTF). AR viewers will match the selected size in real life.</p>
    </section>
  )
}
