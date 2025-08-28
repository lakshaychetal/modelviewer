import React, { useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import ControlsPanel from './components/ControlsPanel'
import ModelViewer from './components/ModelViewer'
import CropPanel from './components/CropPanel'
import SizePanel from './components/SizePanel'
import ToolsMenu from './components/ToolsMenu'

export default function App() {
  const [fileObjectURL, setFileObjectURL] = useState(null)
  const [fileName, setFileName] = useState('')
  const [controls, setControls] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpness: 0,
  })
  const fileInputRef = useRef(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [cropEnabled, setCropEnabled] = useState(false)
  const [crop, setCrop] = useState({ minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 })
  const [cropBounds, setCropBounds] = useState(null)
  const [rotation, setRotation] = useState({ rx: 0, ry: 0, rz: 0 })
  const [pairedRotation, setPairedRotation] = useState(false)
  const [applyCropToken, setApplyCropToken] = useState(0)
  const [applying, setApplying] = useState(false)
  const [activeTool, setActiveTool] = useState(null) // 'textures' | 'crop' | 'size' | null
  const [applySizeToken, setApplySizeToken] = useState(0)
  // real-world size state (cm)
  const [dimsCm, setDimsCm] = useState(null) // measured from model bounds
  const [targetCm, setTargetCm] = useState({ x: 0, y: 0, z: 0 })
  const [lockAspect, setLockAspect] = useState(true)
  const [anchor, setAnchor] = useState('x') // which axis is authoritative when lockAspect

  const onImport = () => fileInputRef.current?.click()

  const onFile = (file) => {
    if (!file) return
    if (fileObjectURL) URL.revokeObjectURL(fileObjectURL)
    const url = URL.createObjectURL(file)
    setFileObjectURL(url)
  setFileName(file.name || '')
  setErrorMsg('')
  // reset tool states to initial for new model
  setActiveTool(null)
  setCropEnabled(false)
  setCropBounds(null)
  setCrop({ minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 })
  setRotation({ rx: 0, ry: 0, rz: 0 })
  setDimsCm(null); setTargetCm({ x: 0, y: 0, z: 0 })
  }

  const onResetAdjustments = () => {
    setControls({ brightness: 0, contrast: 0, saturation: 0, sharpness: 0 })
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="p-3 border-b flex items-center gap-2 justify-between">
        <div className="font-semibold">Model Viewer</div>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200" onClick={onImport}>Import model</button>
          <button id="export-btn" className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Export model</button>
          <button id="reset-view-btn" className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200">Reset view</button>
          <button className="px-3 py-2 rounded bg-amber-600 text-white hover:bg-amber-700" onClick={onResetAdjustments}>Reset adjustments</button>
        </div>
        <input
          type="file"
          accept=".gltf,.glb"
          className="hidden"
          ref={fileInputRef}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </header>
      <main className="flex-1 grid md:grid-cols-[1fr_360px] grid-rows-[auto_1fr]">
        <div className="relative row-span-2">
          <Canvas dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: 'high-performance' }} style={{ background: '#f8fafc' }} camera={{ position: [2.5, 1.5, 2.5], fov: 50 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <Environment preset="city" />
            <ModelViewer
              fileUrl={fileObjectURL}
              fileName={fileName}
              controls={controls}
              onError={setErrorMsg}
              cropEnabled={cropEnabled}
              crop={crop}
              onCropBounds={(b) => setCropBounds(b)}
              rotation={rotation}
              pairedRotation={pairedRotation}
              applyCropToken={applyCropToken}
              onApplyStart={() => setApplying(true)}
              onApplied={(newBounds) => {
                setApplying(false)
                setCropEnabled(false)
                if (newBounds) {
                  setCropBounds(newBounds)
                  setCrop({ ...newBounds })
                  // update current dimensions (cm) from bounds
                  const sx = (newBounds.maxX - newBounds.minX) * 100
                  const sy = (newBounds.maxY - newBounds.minY) * 100
                  const sz = (newBounds.maxZ - newBounds.minZ) * 100
                  setDimsCm({ x: sx, y: sy, z: sz })
                }
                setRotation({ rx: 0, ry: 0, rz: 0 })
              }}
              onBounds={(b) => {
                if (!b) return
                const sx = (b.maxX - b.minX) * 100
                const sy = (b.maxY - b.minY) * 100
                const sz = (b.maxZ - b.minZ) * 100
                setDimsCm({ x: sx, y: sy, z: sz })
                if (targetCm.x === 0 && targetCm.y === 0 && targetCm.z === 0) setTargetCm({ x: sx, y: sy, z: sz })
              }}
              onAppliedSize={(b) => {
                if (!b) return
                const sx = (b.maxX - b.minX) * 100
                const sy = (b.maxY - b.minY) * 100
                const sz = (b.maxZ - b.minZ) * 100
                setDimsCm({ x: sx, y: sy, z: sz })
              }}
              sizeRequest={{ targetCm, lockAspect, anchor }}
              applySizeToken={applySizeToken}
            />
            <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
          </Canvas>
          {applying && (
            <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-50 rounded-md bg-black/70 text-white px-4 py-2 text-sm shadow-lg">
              Applying crop…
            </div>
          )}
          {errorMsg && (
            <div className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-50 max-w-xl rounded-md bg-red-600/95 text-white px-4 py-3 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="font-semibold">Import issue</div>
                <button className="ml-auto text-white/80 hover:text-white" onClick={() => setErrorMsg('')}>Dismiss</button>
              </div>
              <p className="text-sm mt-1">{errorMsg}</p>
              <p className="text-xs mt-2 text-white/80">Tip: Convert the USDZ to GLB and re-import. On macOS use Apple Reality Converter or Pixar USD tools (usdcat/usdzip) to convert USDC to USDA and repackage.</p>
            </div>
          )}
        </div>
        <div className="border-l bg-white/70">
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b">
            <div className="flex">
  {['textures','crop','size'].map((id) => (
                <button key={id} className={`px-4 py-2 text-sm border-b-2 ${activeTool===id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-800'}`} onClick={() => {
                  if (id==='crop') { setCropEnabled(true); if (cropBounds) setCrop({ ...cropBounds }) }
                  setActiveTool(id)
                }}>
          {id==='textures'?'Textures':id==='crop'?'Crop':'Size'}
                </button>
              ))}
              <button className={`ml-auto px-3 py-2 text-sm ${!activeTool?'text-gray-500':'text-gray-700 hover:text-gray-900'}`} onClick={() => setActiveTool(null)}>Tools</button>
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 48px)' }}>
          {!activeTool && (
            <ToolsMenu onSelect={(id) => {
              // Tool enter hooks
              if (id === 'crop') {
                setCropEnabled(true)
                if (cropBounds) setCrop({ ...cropBounds })
              }
              setActiveTool(id)
            }} />
          )}
          {activeTool === 'textures' && (
            <>
              <ControlsPanel
                values={controls}
                onChange={setControls}
              />
              <div className="p-4 pt-0">
                <div className="flex gap-2">
                  <button className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setActiveTool(null)}>Apply changes</button>
                  <button className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setActiveTool(null)}>Back to tools</button>
                </div>
              </div>
            </>
          )}
          {activeTool === 'crop' && (
            <>
              <CropPanel
                enabled={cropEnabled}
                onToggle={setCropEnabled}
                crop={crop}
                onCropChange={setCrop}
                bounds={cropBounds}
                onFit={() => cropBounds && setCrop({ ...cropBounds })}
                rotation={rotation}
                onRotationChange={setRotation}
                pairedRotation={pairedRotation}
                onPairedRotation={setPairedRotation}
                onApply={() => { setApplyCropToken((n) => n + 1); setActiveTool(null) }}
                onReset={() => { if (cropBounds) { setCrop({ ...cropBounds }); setRotation({ rx: 0, ry: 0, rz: 0 }) } }}
                onSnap={(frac) => {
                  if (!cropBounds) return
                  const c = {
                    x: (crop.minX + crop.maxX) / 2,
                    y: (crop.minY + crop.maxY) / 2,
                    z: (crop.minZ + crop.maxZ) / 2,
                  }
                  const sx = (crop.maxX - crop.minX) * frac / 2
                  const sy = (crop.maxY - crop.minY) * frac / 2
                  const sz = (crop.maxZ - crop.minZ) * frac / 2
                  setCrop({ minX: c.x - sx, maxX: c.x + sx, minY: c.y - sy, maxY: c.y + sy, minZ: c.z - sz, maxZ: c.z + sz })
                }}
              />
              <div className="p-4 pt-0">
                <button className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200" onClick={() => { setActiveTool(null); setCropEnabled(false) }}>Back to tools</button>
              </div>
            </>
          )}
          {activeTool === 'size' && (
            <>
              <SizePanel
                currentDimsCm={dimsCm}
                targetCm={targetCm}
                onTargetCm={(v) => {
                  if (lockAspect && dimsCm) {
                    const r = anchor === 'x' ? v.x / dimsCm.x : anchor === 'y' ? v.y / dimsCm.y : v.z / dimsCm.z
                    if (Number.isFinite(r) && r > 0) {
                      const nx = dimsCm.x * r, ny = dimsCm.y * r, nz = dimsCm.z * r
                      setTargetCm({ x: nx, y: ny, z: nz })
                      return
                    }
                  }
                  setTargetCm(v)
                }}
                lockAspect={lockAspect}
                onLockAspect={setLockAspect}
                anchor={anchor}
                onAnchor={setAnchor}
                onApply={() => { setApplySizeToken((n) => n + 1); setActiveTool(null) }}
                onReset={() => dimsCm && setTargetCm({ ...dimsCm })}
              />
              <div className="p-4 pt-0">
                <button className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setActiveTool(null)}>Back to tools</button>
              </div>
            </>
          )}
          
          </div>
        </div>
      </main>
    </div>
  )
}
