import React from 'react'

export default function CropPanel({
  enabled,
  onToggle,
  crop,
  onCropChange,
  bounds,
  onFit,
  rotation,
  onRotationChange,
  pairedRotation,
  onPairedRotation,
  onApply,
  onReset,
  onSnap,
}) {
  const hasBounds = bounds && Number.isFinite(bounds.minX)

  const setFace = (key) => (e) => {
    const v = Number(e.target.value)
    onCropChange({ ...crop, [key]: v })
  }

  const rotSet = (axis) => (e) => {
    const v = Number(e.target.value)
    const next = { ...rotation, [axis]: v }
    onRotationChange(next)
  }

  const faceSlider = (label, key, min, max, step = 0.01) => (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm">{label}</label>
        <span className="text-xs text-gray-500">{crop[key].toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={crop[key]} onChange={setFace(key)} className="w-full" disabled={!enabled || !hasBounds} />
    </div>
  )

  const rotSlider = (label, axis) => (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm">{label}</label>
        <span className="text-xs text-gray-500">{rotation[axis].toFixed(0)}°</span>
      </div>
      <input type="range" min={-180} max={180} step={1} value={rotation[axis]} onChange={rotSet(axis)} className="w-full" disabled={!hasBounds} />
    </div>
  )

  const limits = hasBounds ? bounds : { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 }

  return (
    <section className="p-4 border-t bg-white/70">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Cropping</h2>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} /> Enable
        </label>
      </div>
      <div className="flex gap-2 mb-4">
        <button className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={onFit} disabled={!hasBounds}>Fit to model</button>
        <label className="ml-auto inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pairedRotation} onChange={(e) => onPairedRotation(e.target.checked)} /> Rotate box + model together
        </label>
      </div>

      <div className="flex gap-2 mb-4">
        <button className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={onReset} disabled={!hasBounds}>Reset crop</button>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-xs text-gray-600">Snap:</span>
          <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={() => onSnap(0.5)} disabled={!hasBounds}>1/2</button>
          <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={() => onSnap(0.25)} disabled={!hasBounds}>1/4</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {faceSlider('Left (minX)', 'minX', limits.minX, crop.maxX)}
        {faceSlider('Right (maxX)', 'maxX', crop.minX, limits.maxX)}
        {faceSlider('Bottom (minY)', 'minY', limits.minY, crop.maxY)}
        {faceSlider('Top (maxY)', 'maxY', crop.minY, limits.maxY)}
        {faceSlider('Back (minZ)', 'minZ', limits.minZ, crop.maxZ)}
        {faceSlider('Front (maxZ)', 'maxZ', crop.minZ, limits.maxZ)}
      </div>

      <h3 className="font-medium mt-5 mb-2">Rotate model inside box</h3>
      {rotSlider('Rotate X', 'rx')}
      {rotSlider('Rotate Y', 'ry')}
      {rotSlider('Rotate Z', 'rz')}
      <p className="text-xs text-gray-500 mt-2">The crop box is axis-aligned. Rotate the model to crop at an angle.</p>

      <div className="mt-4">
        <button className="w-full px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" onClick={onApply} disabled={!enabled || !hasBounds}>Apply crop (destructive)</button>
      </div>
    </section>
  )
}
