import React from 'react'

export default function ToolsMenu({ disabled, onSelect }) {
  const Item = ({ id, title, desc }) => (
    <button
      disabled={disabled}
      onClick={() => onSelect(id)}
      className="w-full text-left p-4 rounded border hover:bg-gray-50 disabled:opacity-50"
    >
      <div className="font-medium">{title}</div>
      <div className="text-xs text-gray-500 mt-1">{desc}</div>
    </button>
  )
  return (
    <section className="p-4 space-y-3">
  <h2 className="font-semibold mb-2">Tools</h2>
      <Item id="textures" title="Texture editing" desc="Adjust brightness, contrast, saturation, and sharpness." />
      <Item id="crop" title="Model cropping" desc="Crop the model to a 3D box; Apply removes the outside geometry." />
      <Item id="size" title="Real‑world sizing" desc="Set exact X/Y/Z dimensions in centimeters for AR." />
    </section>
  )
}
