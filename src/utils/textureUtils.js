// Utility functions to process textures via offscreen canvas and return new THREE.Texture
import * as THREE from 'three'

const clamp = (v, min=0, max=255) => Math.max(min, Math.min(max, v))

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

// brightness [-1,1], contrast [-1,1], saturation [-1,1]
export function adjustBCS(image, { brightness=0, contrast=0, saturation=0 }) {
  const canvas = makeCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imgData.data

  const c = (contrast + 1)
  const b = brightness * 255

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i+1], bl = data[i+2]
    r = clamp((r - 128) * c + 128 + b)
    g = clamp((g - 128) * c + 128 + b)
    bl = clamp((bl - 128) * c + 128 + b)

    const { h, s, l } = rgbToHsl(r, g, bl)
    const s2 = Math.max(0, Math.min(1, s * (1 + saturation)))
    const { r: rr, g: gg, b: bb } = hslToRgb(h, s2, l)

    data[i] = rr
    data[i+1] = gg
    data[i+2] = bb
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas
}

// Separable Gaussian blur (kernel size 5: [1,4,6,4,1] / 16)
function gaussianBlur5(imgData, w, h) {
  const src = imgData.data
  const tmp = new Uint8ClampedArray(src.length)
  const dst = new Uint8ClampedArray(src.length)
  const k = [1, 4, 6, 4, 1]
  const ks = 16

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r=0,g=0,b=0,a=0
      for (let i = -2; i <= 2; i++) {
        const xi = Math.min(w-1, Math.max(0, x+i))
        const idx = (y*w + xi) * 4
        const kv = k[i+2]
        r += src[idx] * kv
        g += src[idx+1] * kv
        b += src[idx+2] * kv
        a += src[idx+3] * kv
      }
      const o = (y*w + x) * 4
      tmp[o] = r/ks; tmp[o+1] = g/ks; tmp[o+2] = b/ks; tmp[o+3] = a/ks
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r=0,g=0,b=0,a=0
      for (let i = -2; i <= 2; i++) {
        const yi = Math.min(h-1, Math.max(0, y+i))
        const idx = (yi*w + x) * 4
        const kv = k[i+2]
        r += tmp[idx] * kv
        g += tmp[idx+1] * kv
        b += tmp[idx+2] * kv
        a += tmp[idx+3] * kv
      }
      const o = (y*w + x) * 4
      dst[o] = r/ks; dst[o+1] = g/ks; dst[o+2] = b/ks; dst[o+3] = a/ks
    }
  }
  return new ImageData(dst, w, h)
}

// Simple unsharp mask: original + amount * (original - blurred)
export function sharpen(image, amount=0.5) {
  const w = image.width, h = image.height
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const base = ctx.getImageData(0, 0, w, h)
  const blurred = gaussianBlur5(base, w, h)

  const d = base.data, bd = blurred.data
  for (let i = 0; i < d.length; i += 4) {
    d[i]   = clamp(d[i]   + amount * (d[i]   - bd[i]))
    d[i+1] = clamp(d[i+1] + amount * (d[i+1] - bd[i+1]))
    d[i+2] = clamp(d[i+2] + amount * (d[i+2] - bd[i+2]))
  }
  ctx.putImageData(base, 0, 0)
  return canvas
}

export function canvasToTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.generateMipmaps = true
  return tex
}

// Apply all filters to an existing THREE texture (image must be HTMLImageElement or ImageBitmap)
export async function processTexture(texture, { brightness, contrast, saturation, sharpness }) {
  if (!texture) return null

  const img = texture.image
  let source
  if (img instanceof ImageBitmap) {
    source = img
  } else if (img instanceof HTMLImageElement || (img && img.width && img.height)) {
    source = await createImageBitmap(img)
  } else {
    return null
  }

  let canvas = adjustBCS(source, { brightness, contrast, saturation })
  if (sharpness > 0) {
    canvas = sharpen(canvas, sharpness)
  }
  const newTex = canvasToTexture(canvas)
  newTex.wrapS = texture.wrapS
  newTex.wrapT = texture.wrapT
  newTex.repeat.copy(texture.repeat)
  newTex.offset.copy(texture.offset)
  newTex.flipY = texture.flipY
  return newTex
}

// RGB <-> HSL helpers
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2
  if (max === min) { h = s = 0 }
  else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h, s, l }
}

function hslToRgb(h, s, l) {
  let r, g, b
  if (s === 0) { r = g = b = l }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}
