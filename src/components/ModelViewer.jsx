import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { processTexture } from '../utils/textureUtils'
import { CSG } from 'three-csg-ts'

export default function ModelViewer({ fileUrl, fileName, controls, onError, cropEnabled=false, crop, onCropBounds, rotation, pairedRotation=true, applyCropToken, onApplyStart, onApplied, onBounds, sizeRequest, onAppliedSize, applySizeToken }) {
  const group = useRef()
  const { camera, gl } = useThree()
  const orbitControls = useThree((s) => s.controls)
  const [sceneObject, setSceneObject] = useState(null)
  const [boxHelper, setBoxHelper] = useState(null)
  // original textures are stored on material.userData.originalMap

  // Drag & drop
  useEffect(() => {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation() }
    const handleDrop = async (e) => {
      prevent(e)
      const file = e.dataTransfer?.files?.[0]
      if (file) {
        const url = URL.createObjectURL(file)
        const lower = (file.name || '').toLowerCase()
        if (lower.endsWith('.usdz')) {
          onError?.('USDZ preview is not supported here. Convert to GLB, import it, edit, then convert back to USDZ offline if needed.')
          URL.revokeObjectURL(url)
          return
        }
        loadModel(url, file.name)
      }
    }
    const canvas = gl.domElement
    canvas.addEventListener('dragover', prevent)
    canvas.addEventListener('drop', handleDrop)
    return () => {
      canvas.removeEventListener('dragover', prevent)
      canvas.removeEventListener('drop', handleDrop)
    }
  }, [gl])

  useEffect(() => {
    if (!fileUrl) return
    const lower = (fileName || fileUrl).toLowerCase()
    if (lower.endsWith('.usdz')) {
      // Option A: disable USDZ in-browser; instruct user to convert to GLB
      onError?.('USDZ preview is not supported here. Convert to GLB, import it, edit, then convert back to USDZ offline if needed.')
      return
    }
    loadModel(fileUrl, fileName || '')
  }, [fileUrl, fileName])

  async function loadModel(url, nameHint='') {
    // Clear old
    if (sceneObject) {
      group.current?.remove(sceneObject)
      disposeObject(sceneObject)
      setSceneObject(null)
    }

    const ext = (nameHint || url).toLowerCase()
    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    loader.setDRACOLoader(draco)

    try {
      const gltf = await loader.loadAsync(url)
      const obj = gltf.scene
      obj.traverse((child) => { if (child.isMesh) child.castShadow = child.receiveShadow = true })
      centerAndFit(obj, camera)
      if (orbitControls) { orbitControls.target.set(0,0,0); orbitControls.update() }
      group.current.add(obj)
      setSceneObject(obj)
      cacheOriginalTextures(obj)
    } catch (e) {
      console.error('Load error', e)
      const msg = `${e?.message || e}`
      if (onError) {
        onError('Model load failed. Please try another file or convert to GLB.')
      }
    }
  }

  function cacheOriginalTextures(root) {
    root.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((mat) => {
          if (mat.map && mat.map.image) {
            if (!mat.userData) mat.userData = {}
            if (!mat.userData.originalMap) {
              mat.userData.originalMap = mat.map
            }
          }
        })
      }
    })
  }

  // Apply adjustments to textures with debounce to keep UI smooth
  useEffect(() => {
    if (!sceneObject) return
    const { brightness, contrast, saturation, sharpness } = controls
    const zero = brightness === 0 && contrast === 0 && saturation === 0 && sharpness === 0

    let cancelled = false
    const run = async () => {
      const tasks = []
      sceneObject.traverse((child) => {
        if (!child.isMesh || !child.material) return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((mat) => {
          if (!mat.map) return
          if (!mat.userData) mat.userData = {}
          const original = mat.userData.originalMap || mat.map
          if (!mat.userData.originalMap) mat.userData.originalMap = original

          if (zero) {
            if (mat.map !== original) {
              mat.map.dispose?.()
              mat.map = original
              mat.needsUpdate = true
            }
            return
          }

          tasks.push((async () => {
            const newTex = await processTexture(original, { brightness, contrast, saturation, sharpness })
            if (!cancelled && newTex) {
              if (mat.map && mat.map !== original) mat.map.dispose?.()
              mat.map = newTex
              mat.needsUpdate = true
            }
          })())
        })
      })
      await Promise.all(tasks)
    }
    // Debounce: wait briefly for the user to settle the slider
    const id = setTimeout(run, 120)
    return () => { cancelled = true; clearTimeout(id) }
  }, [sceneObject, controls.brightness, controls.contrast, controls.saturation, controls.sharpness])

  // Compute bounds and inform parent when model changes
  useEffect(() => {
    if (!sceneObject) return
    const box = new THREE.Box3().setFromObject(sceneObject)
    const b = { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z }
    onCropBounds?.(b)
  onBounds?.(b)
    // Create/update a visible wireframe box helper
    if (boxHelper) { group.current.remove(boxHelper) }
    const size = new THREE.Vector3().subVectors(box.max, box.min)
    const center = box.getCenter(new THREE.Vector3())
    const geom = new THREE.BoxGeometry(size.x, size.y, size.z)
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, wireframe: true, transparent: true, opacity: 0.35, depthTest: false })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.userData.isHelper = true
    mesh.position.copy(center)
    group.current.add(mesh)
    setBoxHelper(mesh)
    return () => { mesh.geometry.dispose(); mesh.material.dispose(); group.current.remove(mesh) }
  }, [sceneObject])

  // Update crop box helper to match current crop region
  useEffect(() => {
    if (!boxHelper || !crop) return
    const size = new THREE.Vector3(crop.maxX - crop.minX, crop.maxY - crop.minY, crop.maxZ - crop.minZ)
    const center = new THREE.Vector3((crop.minX + crop.maxX) / 2, (crop.minY + crop.maxY) / 2, (crop.minZ + crop.maxZ) / 2)
    boxHelper.scale.set(1,1,1)
    boxHelper.position.copy(center)
    boxHelper.geometry.dispose()
    boxHelper.geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
    boxHelper.visible = !!cropEnabled
  }, [boxHelper, cropEnabled, crop?.minX, crop?.maxX, crop?.minY, crop?.maxY, crop?.minZ, crop?.maxZ])

  // Ensure a helper exists when cropping is enabled (even after previous apply removed it)
  useEffect(() => {
    if (!cropEnabled || boxHelper || !sceneObject) return
    // use current crop if present; else derive from current bounds
    let minX, maxX, minY, maxY, minZ, maxZ
    if (crop) {
      ({ minX, maxX, minY, maxY, minZ, maxZ } = crop)
    } else {
      const box = new THREE.Box3().setFromObject(sceneObject)
      minX = box.min.x; maxX = box.max.x; minY = box.min.y; maxY = box.max.y; minZ = box.min.z; maxZ = box.max.z
    }
    const size = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ)
    const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
    const geom = new THREE.BoxGeometry(size.x, size.y, size.z)
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, wireframe: true, transparent: true, opacity: 0.35, depthTest: false })
    const mesh = new THREE.Mesh(geom, mat)
  mesh.userData.isHelper = true
    mesh.position.copy(center)
    if (pairedRotation && group.current) mesh.quaternion.copy(group.current.quaternion)
    group.current.add(mesh)
    setBoxHelper(mesh)
    // No cleanup here; lifecycle managed by other effects or explicit removal on apply
  }, [cropEnabled, boxHelper, sceneObject, pairedRotation])

  // Rotate model inside the crop box
  useEffect(() => {
    if (!sceneObject || !rotation) return
    const toRad = (d) => (d * Math.PI) / 180
    if (pairedRotation) {
      const rx = toRad(rotation.rx || 0), ry = toRad(rotation.ry || 0), rz = toRad(rotation.rz || 0)
      if (group.current) group.current.rotation.set(rx, ry, rz)
      if (boxHelper) boxHelper.rotation.set(rx, ry, rz)
    } else {
      sceneObject.rotation.set(toRad(rotation.rx || 0), toRad(rotation.ry || 0), toRad(rotation.rz || 0))
      if (boxHelper) boxHelper.rotation.set(0,0,0)
    }
  }, [sceneObject, boxHelper, pairedRotation, rotation?.rx, rotation?.ry, rotation?.rz])

  // Setup six clipping planes when cropping is enabled
  useEffect(() => {
    // When pairedRotation is on, planes in world space won't match; skip preview clipping
    if (!cropEnabled || !crop || pairedRotation) {
      gl.localClippingEnabled = false
      setObjectClipping(sceneObject, [])
      return
    }
    gl.localClippingEnabled = true
    const planes = [
      new THREE.Plane(new THREE.Vector3( 1, 0, 0), -crop.minX), // left:  x >= minX
      new THREE.Plane(new THREE.Vector3(-1, 0, 0),  crop.maxX), // right: x <= maxX
      new THREE.Plane(new THREE.Vector3(0,  1, 0), -crop.minY), // bottom: y >= minY
      new THREE.Plane(new THREE.Vector3(0, -1, 0),  crop.maxY), // top:    y <= maxY
      new THREE.Plane(new THREE.Vector3(0, 0,  1), -crop.minZ), // back:   z >= minZ
      new THREE.Plane(new THREE.Vector3(0, 0, -1),  crop.maxZ), // front:  z <= maxZ
    ]
    setObjectClipping(sceneObject, planes)
    return () => {
      setObjectClipping(sceneObject, [])
      gl.localClippingEnabled = false
    }
  }, [gl, sceneObject, cropEnabled, pairedRotation, crop?.minX, crop?.maxX, crop?.minY, crop?.maxY, crop?.minZ, crop?.maxZ])

  // Pointer-based paired rotation (Shift + drag)
  useEffect(() => {
    if (!cropEnabled || !pairedRotation) return
    const el = gl.domElement
    let dragging = false
    let lastX = 0, lastY = 0
    const onDown = (e) => {
      if (!e.shiftKey || e.button !== 0) return
      dragging = true
      lastX = e.clientX; lastY = e.clientY
      if (orbitControls) orbitControls.enabled = false
      el.style.cursor = 'grabbing'
    }
    const onMove = (e) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX; lastY = e.clientY
      if (group.current) {
        group.current.rotation.y += dx * 0.01
        group.current.rotation.x += dy * 0.01
      }
      if (boxHelper) {
        boxHelper.rotation.copy(group.current.rotation)
      }
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      if (orbitControls) orbitControls.enabled = true
      el.style.cursor = ''
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (orbitControls) orbitControls.enabled = true
      el.style.cursor = ''
    }
  }, [gl, cropEnabled, pairedRotation, boxHelper])

  // Apply destructive crop when requested
  useEffect(() => {
    if (!applyCropToken) return
    if (!sceneObject || !cropEnabled || !crop) return
    onApplyStart?.()
    const size = new THREE.Vector3(crop.maxX - crop.minX, crop.maxY - crop.minY, crop.maxZ - crop.minZ)
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) return
    const center = new THREE.Vector3((crop.minX + crop.maxX) / 2, (crop.minY + crop.maxY) / 2, (crop.minZ + crop.maxZ) / 2)
    // small expansion to avoid coplanar surface issues during CSG
    const eps = Math.max(size.x, size.y, size.z) * 1e-5
    const boxGeo = new THREE.BoxGeometry(size.x + eps, size.y + eps, size.z + eps)
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const boxMesh = new THREE.Mesh(boxGeo, boxMat)
    boxMesh.position.copy(center)
    if (pairedRotation && group.current) {
      boxMesh.quaternion.copy(group.current.quaternion)
    } else if (boxHelper) {
      boxMesh.quaternion.copy(boxHelper.quaternion)
    }
    boxMesh.updateMatrixWorld(true)

    sceneObject.updateMatrixWorld(true)

    sceneObject.traverse((child) => {
      if (!child.isMesh || !child.geometry) return
      if (child.isSkinnedMesh) return
      try {
        // Preferred: robust CSG intersection with the oriented crop box to produce smooth, capped cuts
        // Build world-space meshes with baked transforms for stable CSG
        const aGeoWorld = child.geometry.clone()
        aGeoWorld.applyMatrix4(child.matrixWorld)
        const aMeshWorld = new THREE.Mesh(aGeoWorld, new THREE.MeshBasicMaterial())
        const bGeoWorld = boxMesh.geometry.clone()
        bGeoWorld.applyMatrix4(boxMesh.matrixWorld)
        const bMeshWorld = new THREE.Mesh(bGeoWorld, new THREE.MeshBasicMaterial())

        let resultMesh = null
        try {
          resultMesh = CSG.intersect(aMeshWorld, bMeshWorld)
        } catch (e) {
          // Some geometries can fail CSG; fall back to custom clipper below
          resultMesh = null
        }

        if (resultMesh && resultMesh.geometry && resultMesh.geometry.attributes?.position?.count > 0) {
          // Transform result geometry back into child's local space
          const invChildWorld = new THREE.Matrix4().copy(child.matrixWorld).invert()
          const resLocal = resultMesh.geometry.clone()
          resLocal.applyMatrix4(invChildWorld)
          let cleaned = resLocal
          try { cleaned = mergeVertices(cleaned, 1e-5) } catch {}
          cleaned.computeVertexNormals()
          cleaned.computeBoundingBox(); cleaned.computeBoundingSphere()
          child.geometry.dispose?.()
          child.geometry = cleaned
          child.visible = true
        } else {
          // Fallback: use existing polygon clipper to keep inside region
          const invBox = new THREE.Matrix4().copy(boxMesh.matrixWorld).invert()
          const half = new THREE.Vector3(size.x * 0.5 + eps, size.y * 0.5 + eps, size.z * 0.5 + eps)
          const newGeom = clipMeshKeepInside(child, invBox, half)
          if (newGeom) {
            let cleaned = newGeom
            try { cleaned = mergeVertices(cleaned, 1e-5) } catch {}
            cleaned.computeVertexNormals()
            cleaned.computeBoundingBox(); cleaned.computeBoundingSphere()
            child.geometry.dispose?.()
            child.geometry = cleaned
            child.visible = true
          } else {
            child.visible = false
          }
        }
      } catch (e) {
        console.warn('Crop failed', e)
      }
    })

    // Update bounds and helper
    const newBox = new THREE.Box3().setFromObject(sceneObject)
    const b = { minX: newBox.min.x, maxX: newBox.max.x, minY: newBox.min.y, maxY: newBox.max.y, minZ: newBox.min.z, maxZ: newBox.max.z }
    onCropBounds?.(b)
    if (boxHelper) {
      group.current.remove(boxHelper)
      boxHelper.geometry.dispose(); boxHelper.material.dispose()
      setBoxHelper(null)
    }

    // Disable clipping since geometry is trimmed now
    setObjectClipping(sceneObject, [])
    gl.localClippingEnabled = false
  onApplied?.(b)
  }, [applyCropToken])

  // Apply real-world sizing on request (if sizeRequest changes, scale to target cm)
  useEffect(() => {
    if (!sceneObject || !sizeRequest) return
    const { targetCm, lockAspect, anchor } = sizeRequest
    if (!targetCm || !(targetCm.x > 0 && targetCm.y > 0 && targetCm.z > 0)) return
    const box = new THREE.Box3().setFromObject(sceneObject)
    const size = box.getSize(new THREE.Vector3())
    if (size.x === 0 || size.y === 0 || size.z === 0) return
    // glTF units are meters; target is cm
    const curCm = { x: size.x * 100, y: size.y * 100, z: size.z * 100 }
    let sx = targetCm.x / curCm.x
    let sy = targetCm.y / curCm.y
    let sz = targetCm.z / curCm.z
    if (lockAspect) {
      const r = anchor === 'x' ? sx : anchor === 'y' ? sy : sz
      sx = sy = sz = r
    }
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) return
    // Scale around center to preserve placement
    const center = box.getCenter(new THREE.Vector3())
    group.current.position.sub(center)
    sceneObject.position.sub(center)
    sceneObject.scale.multiply(new THREE.Vector3(sx, sy, sz))
    group.current.position.add(center)
    sceneObject.position.add(center)
    sceneObject.updateMatrixWorld(true)
    const nb = new THREE.Box3().setFromObject(sceneObject)
    onAppliedSize?.({ minX: nb.min.x, maxX: nb.max.x, minY: nb.min.y, maxY: nb.max.y, minZ: nb.min.z, maxZ: nb.max.z })
  }, [applySizeToken, sizeRequest?.targetCm?.x, sizeRequest?.targetCm?.y, sizeRequest?.targetCm?.z, sizeRequest?.lockAspect, sizeRequest?.anchor, sceneObject])

  // Clip a mesh against an oriented box and keep only original surface triangles inside the box.
  function clipMeshKeepInside(child, invBoxMatrixWorld, half) {
    const geom = child.geometry
    const src = geom.index ? geom.toNonIndexed() : geom.clone()
    const pos = src.getAttribute('position')
    const uv = src.getAttribute('uv')
    const hasUV = !!uv
    const localToWorld = child.matrixWorld
    const worldToLocal = new THREE.Matrix4().copy(localToWorld).invert()
  const EPS = 1e-7

    // Prepare plane tests in box-local space
    const toBox = (p) => p.clone().applyMatrix4(invBoxMatrixWorld)
  const insideX = (v) => v.x <= half.x + EPS && v.x >= -half.x - EPS
  const insideY = (v) => v.y <= half.y + EPS && v.y >= -half.y - EPS
  const insideZ = (v) => v.z <= half.z + EPS && v.z >= -half.z - EPS
    const planes = [
      { axis: 'x', s:  1, limit:  half.x }, // +X
      { axis: 'x', s: -1, limit:  half.x }, // -X
      { axis: 'y', s:  1, limit:  half.y }, // +Y
      { axis: 'y', s: -1, limit:  half.y }, // -Y
      { axis: 'z', s:  1, limit:  half.z }, // +Z
      { axis: 'z', s: -1, limit:  half.z }, // -Z
    ]

    const outPos = []
    const outUV = []

    // Build vertex struct
    const makeV = (i) => {
      const pw = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(localToWorld)
      const pb = pw.clone().applyMatrix4(invBoxMatrixWorld)
      const v = { pw, pb }
      if (hasUV) v.uv = new THREE.Vector2(uv.getX(i), uv.getY(i))
      return v
    }

    // Clip polygon by one plane using Sutherland–Hodgman
    const clipByPlane = (poly, plane) => {
      const res = []
      if (poly.length === 0) return res
      const getCoord = (p) => plane.axis === 'x' ? p.pb.x : plane.axis === 'y' ? p.pb.y : p.pb.z
      const limit = plane.limit
      const s = plane.s
      const isInside = (p) => s * getCoord(p) <= limit + EPS
      for (let i = 0; i < poly.length; i++) {
        const cur = poly[i]
        const prev = poly[(i + poly.length - 1) % poly.length]
        const curIn = isInside(cur)
        const prevIn = isInside(prev)
        if (curIn && prevIn) {
          res.push(cur)
        } else if (prevIn && !curIn) {
          // leaving -> add intersection
          res.push(intersect(prev, cur, plane.axis, limit))
        } else if (!prevIn && curIn) {
          // entering -> add intersection then current
          res.push(intersect(prev, cur, plane.axis, limit))
          res.push(cur)
        }
        // else both out: add nothing
      }
      return res
    }

    // Intersect segment AB with plane axis=const
    const intersect = (A, B, axis, limit) => {
      const a = A.pb[axis]
      const b = B.pb[axis]
      const denom = (b - a)
      let t
      if (Math.abs(denom) < EPS) {
        // Segment nearly parallel to plane; choose midpoint to avoid spikes
        t = 0.5
      } else {
        t = (limit - a) / denom
      }
      // clamp
      if (!Number.isFinite(t)) t = 0.5
      if (t < 0) t = 0
      else if (t > 1) t = 1
      const lerpVec3 = (va, vb) => new THREE.Vector3().copy(va).lerp(vb, t)
      const pw = lerpVec3(A.pw, B.pw)
      const pb = lerpVec3(A.pb, B.pb)
      const v = { pw, pb }
      if (hasUV) v.uv = new THREE.Vector2().copy(A.uv).lerp(B.uv, t)
      return v
    }

    for (let i = 0; i < pos.count; i += 3) {
      let poly = [makeV(i), makeV(i+1), makeV(i+2)]
      // Quick reject if completely outside any axis range
      let allInside = true
      for (const p of poly) {
        const b = p.pb
        if (!insideX(b) || !insideY(b) || !insideZ(b)) { allInside = false; break }
      }
      if (!allInside) {
        for (const plane of planes) {
          poly = clipByPlane(poly, plane)
          if (poly.length === 0) break
        }
      }
      if (poly.length < 3) continue
      // Triangulate fan in world, then convert to local
      const v0 = poly[0]
      for (let k = 1; k < poly.length - 1; k++) {
        const v1 = poly[k]
        const v2 = poly[k+1]
        const p0w = v0.pw
        const p1w = v1.pw
        const p2w = v2.pw
        // Filter degenerate triangles (area check in world space)
        const e1 = new THREE.Vector3().subVectors(p1w, p0w)
        const e2 = new THREE.Vector3().subVectors(p2w, p0w)
        const area2 = new THREE.Vector3().crossVectors(e1, e2).length()
        const scale = Math.max(half.x, half.y, half.z)
        if (!Number.isFinite(area2) || area2 <= scale * 1e-7) continue
        const p0 = p0w.clone().applyMatrix4(worldToLocal)
        const p1 = p1w.clone().applyMatrix4(worldToLocal)
        const p2 = p2w.clone().applyMatrix4(worldToLocal)
        outPos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
        if (hasUV) {
          outUV.push(v0.uv.x, v0.uv.y, v1.uv.x, v1.uv.y, v2.uv.x, v2.uv.y)
        }
      }
    }

    if (outPos.length === 0) return null
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(outPos), 3))
    if (hasUV) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(outUV), 2))
    return out
  }

  // Export button handler
  useEffect(() => {
    const btn = document.getElementById('export-btn')
    if (!btn) return
    const onClick = () => exportModel()
    btn.addEventListener('click', onClick)
    return () => btn.removeEventListener('click', onClick)
  }, [sceneObject, controls])

  // Reset view button handler
  useEffect(() => {
    const btn = document.getElementById('reset-view-btn')
    if (!btn) return
    const onClick = () => {
  if (sceneObject) { centerAndFit(sceneObject, camera); if (orbitControls) { orbitControls.target.set(0,0,0); orbitControls.update() } }
    }
    btn.addEventListener('click', onClick)
    return () => btn.removeEventListener('click', onClick)
  }, [sceneObject])

  async function exportModel() {
    if (!sceneObject) return
    // Build export root: clone group and strip helpers, prune attributes
    const exportRoot = group.current.clone(true)
    exportRoot.traverse((obj) => {
      if (obj.userData?.isHelper) {
        if (obj.parent) obj.parent.remove(obj)
      }
    })
    pruneGeometryAttributesForExport(exportRoot)
    // Temporarily compress base color textures to JPEG to avoid PNG inflation
    const restoreList = []
    restoreList.push(
      ...optimizeColorTexturesForExport(exportRoot, 0.75, 2048),
      ...optimizeAuxTexturesForExport(exportRoot, 1024)
    )
    const exporter = new GLTFExporter()
    const done = () => {
      // restore images even if export fails
      for (const r of restoreList) {
        if (r.map.image && r.restore) r.restore()
      }
    }
    try {
      exporter.parse(
        exportRoot,
        (result) => {
          try {
            let blob
            if (result instanceof ArrayBuffer) {
              blob = new Blob([result], { type: 'model/gltf-binary' })
              downloadBlob(blob, 'model.glb')
            } else {
              const json = JSON.stringify(result)
              blob = new Blob([json], { type: 'application/json' })
              downloadBlob(blob, 'model.gltf')
            }
          } finally {
            done()
          }
        },
        (error) => {
          console.error('Export error', error)
          done()
        },
        { binary: true, onlyVisible: true, embedImages: true, forcePowerOfTwoTextures: false, maxTextureSize: 2048 }
      )
    } catch (e) {
      console.error('Export threw', e)
      done()
    }
  }

  // Downsize GLB by re-encoding color maps to JPEG on-the-fly during export.
  function optimizeColorTexturesForExport(root, quality = 0.85, maxDim = 4096) {
    const restores = []
    const seen = new Set()
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        const map = mat.map
        if (!map || !map.image) continue
        if (seen.has(map)) continue
        seen.add(map)
        // Skip likely non-color maps (normal/metalness/roughness)
        if (mat.normalMap === map || mat.roughnessMap === map || mat.metalnessMap === map || mat.aoMap === map || mat.displacementMap === map) {
          continue
        }
        try {
          const img = map.image
          // If image has alpha or material is transparent, keep PNG
          const needsAlpha = !!mat.transparent || (mat.alphaMap != null)
          const canvas = document.createElement('canvas')
          let w = img.width || img.videoWidth || img.naturalWidth
          let h = img.height || img.videoHeight || img.naturalHeight
          if (!w || !h) continue
          // Downscale if too large
          if (Math.max(w, h) > maxDim) {
            const scale = maxDim / Math.max(w, h)
            w = Math.max(1, Math.floor(w * scale))
            h = Math.max(1, Math.floor(h * scale))
          }
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          const oldImage = map.image
          const restore = () => { map.image = oldImage }
          // Hint exporter to use JPEG when alpha not needed by forcing RGB format and overriding toDataURL
          if (!needsAlpha) {
            try { map.format = THREE.RGBFormat } catch {}
            const origToDataURL = canvas.toDataURL?.bind(canvas)
            // Prefer JPEG at provided quality; exporter will call canvas.toDataURL(mime)
            if (origToDataURL) {
              canvas.toDataURL = (mimeType, ...args) => {
                // Always return JPEG with our quality for color maps
                try { return origToDataURL('image/jpeg', quality) } catch { return origToDataURL(mimeType, ...args) }
              }
            }
          }
          // Use canvas directly so exporter can read pixels without async load
          map.image = canvas
          restores.push({ map, restore })
        } catch (e) {
          // ignore per-texture failures
        }
      }
    })
    return restores
  }

  // Downscale auxiliary maps (normal/roughness/metalness/ao/displacement) to reduce size; keep PNG to preserve precision
  function optimizeAuxTexturesForExport(root, maxDim = 1024) {
    const restores = []
    const seen = new Set()
    const auxKeys = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'displacementMap']
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        for (const key of auxKeys) {
          const tex = mat[key]
          if (!tex || !tex.image) continue
          if (seen.has(tex)) continue
          seen.add(tex)
          try {
            const img = tex.image
            let w = img.width || img.videoWidth || img.naturalWidth
            let h = img.height || img.videoHeight || img.naturalHeight
            if (!w || !h) continue
            if (Math.max(w, h) <= maxDim) continue
            const scale = maxDim / Math.max(w, h)
            w = Math.max(1, Math.floor(w * scale))
            h = Math.max(1, Math.floor(h * scale))
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, w, h)
            const oldImage = tex.image
            const restore = () => { tex.image = oldImage }
            tex.image = canvas
            restores.push({ map: tex, restore })
          } catch (e) {
            // ignore per-texture failures
          }
        }
      }
    })
    return restores
  }

  function pruneGeometryAttributesForExport(root) {
    root.traverse((child) => {
      if (!child.isMesh || !child.geometry) return
      const geom = child.geometry
      const mat = child.material
      if (geom.getAttribute('color') && !(mat && mat.vertexColors)) geom.deleteAttribute('color')
      if (geom.getAttribute('tangent') && !(mat && mat.normalMap)) geom.deleteAttribute('tangent')
      if (geom.getAttribute('uv2') && !(mat && (mat.aoMap || mat.lightMap))) geom.deleteAttribute('uv2')
      // normals/uv are kept; skinning removed if not skinned
      if (!child.isSkinnedMesh) {
        if (geom.getAttribute('skinIndex')) geom.deleteAttribute('skinIndex')
        if (geom.getAttribute('skinWeight')) geom.deleteAttribute('skinWeight')
      }
    })
  }

  return (
    <group ref={group}>
      {/* When no model, show a simple grid and placeholder */}
      {!sceneObject && (
        <Placeholder />
      )}
    </group>
  )
}

function Placeholder() {
  const grid = useRef()
  useFrame(({ clock }) => {
    if (grid.current) grid.current.rotation.y = clock.getElapsedTime() * 0.1
  })
  return (
    <group>
      <gridHelper args={[10, 10, '#999', '#bbb']} />
      <mesh ref={grid} position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6b7280" metalness={0.1} roughness={0.6} />
      </mesh>
    </group>
  )
}

function centerAndFit(object3d, camera) {
  const box = new THREE.Box3().setFromObject(object3d)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  object3d.position.sub(center)
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.5
  camera.position.set(cameraZ, cameraZ * 0.6, cameraZ)
  camera.lookAt(0, 0, 0)
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose?.()
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((mat) => {
        Object.keys(mat).forEach((k) => {
          const v = mat[k]
          if (v && v.isTexture) v.dispose?.()
        })
        mat.dispose?.()
      })
    }
  })
}

function setObjectClipping(root, planes) {
  if (!root) return
  root.traverse((child) => {
    if (!child.isMesh) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach((m) => { m.clippingPlanes = planes; m.needsUpdate = true })
  })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
