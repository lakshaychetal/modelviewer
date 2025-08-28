import React from 'react'

export default function ControlsPanel({ values, onChange }) {
  let rafId = null
  const set = (key) => (e) => {
    const next = { ...values, [key]: Number(e.target.value) }
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => onChange(next))
  }
  const slider = (label, key, min, max, step=0.01) => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs text-gray-500">{values[key].toFixed(2)}</span>
      </div>
  <input type="range" min={min} max={max} step={step} value={values[key]} onChange={set(key)} className="w-full" />
    </div>
  )
  return (
    <aside className="p-4 border-l bg-white/70 backdrop-blur">
      <h2 className="font-semibold mb-4">Adjustments</h2>
      {slider('Brightness', 'brightness', -1, 1)}
      {slider('Contrast', 'contrast', -1, 1)}
      {slider('Saturation', 'saturation', -1, 1)}
      {slider('Sharpness', 'sharpness', 0, 1)}
      <p className="text-xs text-gray-500 mt-4">Tip: drag-and-drop a model anywhere on the viewer to load it.</p>
    </aside>
  )
}
