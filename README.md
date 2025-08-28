# Model Viewer

A React + Vite app to upload USDZ/GLTF, preview with react-three-fiber, adjust texture brightness/contrast/saturation/sharpness, and export as GLB (embedded textures).

## Features
- Upload USDZ or GLTF/GLB
- Orbit controls, reset via re-center on load
- Live texture processing via OffscreenCanvas, including unsharp mask
- Export as GLB with embedded textures
- Responsive UI (Tailwind)

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL in your browser.

## Usage
- Click "Import model" or drag-and-drop a `.usdz`/`.glb`/`.gltf` onto the viewer.
- Adjust sliders in the side panel.
- Click "Export model" to download an updated `.glb` with embedded textures.
- Click "Reset adjustments" to return sliders to defaults.

## Notes
- USDZ export in-browser is non-trivial; we export GLB as a widely-supported fallback.
- Some USDZ files may have textures in PXR/UDIM or complex materials. This app focuses on the base color map (`map`). Extend similarly for `normalMap`, `metalnessMap`, etc.
- OffscreenCanvas requires modern browsers. For older browsers, a fallback to regular canvas could be added.
