/* globals THREE */

import { OcclusionManager } from './occlusion/occlusion-manager'
import { createOcclusionRugMaterial } from './occlusion/rug-material'

const RUG_WIDTH = 3
const RUG_DEPTH = 4
const RUG_HEIGHT = 0.02
const MASK_W = 320
const MASK_H = 240

let selectedTextureSrc = 'assets/textures/Easther (Visualization).jpg'
let placedRug = null
let occlusionManager = null
let currentRugMaterial = null
let currentMaskTexture = null
let currentMaskData = null
let currentResolution = null

let textureLoadSeq = 0
let pendingObject3dListener = null
let pendingObject3dEl = null

function waitForVideo(callback) {
  const existing = document.querySelector('video')
  if (existing) { callback(existing); return }
  const observer = new MutationObserver(() => {
    const video = document.querySelector('video')
    if (video) { observer.disconnect(); callback(video) }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function applyTextureToRug(rugEl, src) {
  const seq = ++textureLoadSeq
  const textureLoader = new THREE.TextureLoader()
  textureLoader.load(src, (texture) => {
    if (seq !== textureLoadSeq) return
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.encoding = THREE.sRGBEncoding

    const mesh = rugEl.getObject3D('mesh')
    if (mesh) {
      setRugMaterial(mesh, texture)
    } else {
      if (pendingObject3dListener && pendingObject3dEl) {
        pendingObject3dEl.removeEventListener('object3dset', pendingObject3dListener)
      }
      pendingObject3dListener = () => {
        pendingObject3dListener = null
        pendingObject3dEl = null
        const m = rugEl.getObject3D('mesh')
        if (m) setRugMaterial(m, texture)
      }
      pendingObject3dEl = rugEl
      rugEl.addEventListener('object3dset', pendingObject3dListener, { once: true })
    }
  })
}

function setRugMaterial(mesh, texture) {
  if (currentMaskTexture) currentMaskTexture.dispose()
  if (currentRugMaterial) currentRugMaterial.dispose()
  currentRugMaterial = null
  currentMaskTexture = null

  mesh.traverse((node) => {
    if (node.isMesh && !currentRugMaterial) {
      const { material, maskTexture, maskData, resolution } = createOcclusionRugMaterial({
        map: texture,
        width: MASK_W,
        height: MASK_H,
      })
      node.material = material
      node.material.needsUpdate = true
      currentRugMaterial = material
      currentMaskTexture = maskTexture
      currentMaskData = maskData
      currentResolution = resolution
    }
  })
}

function updateOcclusionMask() {
  if (!currentMaskTexture || !occlusionManager) return
  occlusionManager.readMask(currentMaskData, MASK_W, MASK_H)
  currentMaskTexture.needsUpdate = true
}

// Draw accumulated mask as a coloured overlay on the preview canvas
function updateMaskPreview(maskPreviewCtx, maskPixels) {
  const w = MASK_W
  const h = MASK_H
  const imgData = maskPreviewCtx.createImageData(w, h)
  for (let i = 0; i < maskPixels.length; i++) {
    if (maskPixels[i]) {
      imgData.data[i * 4] = 255
      imgData.data[i * 4 + 1] = 100
      imgData.data[i * 4 + 2] = 0
      imgData.data[i * 4 + 3] = 140
    }
  }
  maskPreviewCtx.putImageData(imgData, 0, 0)
}

const rugPlaceComponent = {
  init() {
    const scene = this.el.sceneEl
    const ground = document.getElementById('ground')
    const designPanel = document.getElementById('design-panel')
    const togglePanel = document.getElementById('toggle-panel')
    const removeBtn = document.getElementById('remove-btn')
    const uploadBtn = document.getElementById('upload-btn')
    const fileInput = document.getElementById('file-input')
    const placeBtn = document.getElementById('place-btn')
    const scanOverlay = document.getElementById('scan-overlay')
    const scanBtn = document.getElementById('scan-btn')
    const scanStatus = document.getElementById('scan-status')
    const tapArea = document.getElementById('tap-area')
    const maskPreviewCanvas = document.getElementById('mask-preview')
    const maskPreviewCtx = maskPreviewCanvas.getContext('2d')

    // scan states: 'loading' | 'ready' | 'encoding' | 'segmenting' | 'done'
    let scanState = 'loading'
    let scanReady = false

    const setScanState = (state) => {
      scanState = state
      tapArea.style.pointerEvents = state === 'segmenting' ? 'auto' : 'none'
      maskPreviewCanvas.style.display = state === 'segmenting' ? 'block' : 'none'

      if (state === 'loading') {
        scanBtn.textContent = 'Loading models…'
        scanBtn.disabled = true
        scanStatus.textContent = 'Preparing furniture detection…'
      } else if (state === 'ready') {
        scanBtn.textContent = 'Capture Frame'
        scanBtn.disabled = false
        scanBtn.classList.remove('scanning')
        scanStatus.textContent = 'Point camera at your room, then capture.'
      } else if (state === 'encoding') {
        scanBtn.textContent = 'Analysing…'
        scanBtn.disabled = true
        scanStatus.textContent = 'Processing frame…'
      } else if (state === 'segmenting') {
        scanBtn.textContent = 'Done'
        scanBtn.disabled = false
        scanBtn.classList.add('scanning')
        scanStatus.textContent = 'Tap each piece of furniture to mask it.'
      } else if (state === 'done') {
        scanReady = true
        scanOverlay.classList.add('hidden')
        designPanel.style.display = 'block'
        togglePanel.style.display = 'flex'
      }
    }

    const finishScan = () => {
      maskPreviewCanvas.style.display = 'none'
      setScanState('done')
    }

    waitForVideo((video) => {
      occlusionManager = new OcclusionManager(video, {
        internalWidth: MASK_W,
        internalHeight: MASK_H,
      })
      occlusionManager.init()
        .then(() => setScanState('ready'))
        .catch((err) => {
          console.error('OcclusionManager init failed:', err)
          scanStatus.textContent = 'Furniture detection unavailable — you can still place rugs.'
          scanBtn.textContent = 'Skip'
          scanBtn.disabled = false
          scanBtn.onclick = finishScan
        })
    })

    scanBtn.addEventListener('click', () => {
      if (scanState === 'ready') {
        setScanState('encoding')
        occlusionManager.captureAndEncode()
          .then(() => {
            maskPreviewCanvas.width = MASK_W
            maskPreviewCanvas.height = MASK_H
            setScanState('segmenting')
          })
          .catch((err) => {
            console.error('Encode failed:', err)
            setScanState('ready')
          })
        return
      }

      if (scanState === 'segmenting') {
        finishScan()
      }
    })

    // Map screen tap → video frame coords → decode
    tapArea.addEventListener('click', async (e) => {
      if (scanState !== 'segmenting') return

      const screenW = window.innerWidth
      const screenH = window.innerHeight
      const videoX = (e.clientX / screenW) * MASK_W
      const videoY = (e.clientY / screenH) * MASK_H

      // Show tap dot
      const dot = document.createElement('div')
      dot.className = 'tap-dot'
      dot.style.left = `${e.clientX}px`
      dot.style.top = `${e.clientY}px`
      document.body.appendChild(dot)
      setTimeout(() => dot.remove(), 1200)

      await occlusionManager.decodePoint(videoX, videoY)
      updateMaskPreview(maskPreviewCtx, occlusionManager.maskPixels)
    })

    togglePanel.addEventListener('click', () => {
      const isVisible = designPanel.style.display !== 'none'
      designPanel.style.display = isVisible ? 'none' : 'block'
    })

    document.querySelectorAll('.design-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        document.querySelectorAll('.design-thumb, .upload-thumb').forEach(t => t.classList.remove('selected'))
        thumb.classList.add('selected')
        selectedTextureSrc = thumb.getAttribute('data-texture')
        if (placedRug) applyTextureToRug(placedRug, selectedTextureSrc)
      })
    })

    uploadBtn.addEventListener('click', () => fileInput.click())

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target.result
        document.querySelectorAll('.design-thumb, .upload-thumb').forEach(t => t.classList.remove('selected'))
        uploadBtn.classList.add('selected')
        selectedTextureSrc = dataUrl
        uploadBtn.innerHTML = ''
        const img = document.createElement('img')
        img.src = dataUrl
        img.alt = 'Custom'
        uploadBtn.appendChild(img)
        if (placedRug) applyTextureToRug(placedRug, selectedTextureSrc)
      }
      reader.readAsDataURL(file)
    })

    removeBtn.addEventListener('click', () => {
      if (!placedRug) return
      placedRug.parentNode.removeChild(placedRug)
      placedRug = null
      if (currentMaskTexture) { currentMaskTexture.dispose(); currentMaskTexture = null }
      if (currentRugMaterial) { currentRugMaterial.dispose(); currentRugMaterial = null }
      currentMaskData = null
      currentResolution = null
      removeBtn.style.display = 'none'
      placeBtn.textContent = 'Tap Floor to Place Rug'
    })

    ground.addEventListener('click', (event) => {
      if (!scanReady) return
      const touchPoint = event.detail.intersection.point

      if (placedRug) {
        placedRug.setAttribute('position', {
          x: touchPoint.x,
          y: touchPoint.y + (RUG_HEIGHT / 2) + 0.01,
          z: touchPoint.z,
        })
        return
      }

      const rug = document.createElement('a-entity')
      rug.setAttribute('class', 'cantap')
      rug.setAttribute('position', {
        x: touchPoint.x,
        y: touchPoint.y + (RUG_HEIGHT / 2) + 0.01,
        z: touchPoint.z,
      })
      rug.setAttribute('geometry', { primitive: 'box', width: RUG_WIDTH, height: RUG_HEIGHT, depth: RUG_DEPTH })
      rug.setAttribute('shadow', { receive: false, cast: true })
      rug.setAttribute('visible', 'false')
      rug.setAttribute('scale', '0.001 0.001 0.001')
      rug.setAttribute('xrextras-hold-drag', '')
      rug.setAttribute('xrextras-two-finger-rotate', '')
      rug.setAttribute('xrextras-pinch-scale', '')

      scene.appendChild(rug)
      applyTextureToRug(rug, selectedTextureSrc)

      rug.setAttribute('visible', 'true')
      rug.setAttribute('animation', {
        property: 'scale',
        to: '1 1 1',
        easing: 'easeOutBack',
        dur: 800,
      })

      placedRug = rug
      removeBtn.style.display = 'block'
      placeBtn.textContent = 'Tap to Reposition Rug'
    })
  },

  tick() {
    if (!occlusionManager || !occlusionManager.ready) return

    const canvas = this.el.sceneEl?.canvas
    if (canvas && canvas.width > 0 && canvas.height > 0 && currentResolution) {
      currentResolution.set(canvas.width, canvas.height)
    }

    if (occlusionManager.maskDirty) updateOcclusionMask()
  },

  remove() {
    occlusionManager?.destroy()
    occlusionManager = null
  },
}

export { rugPlaceComponent }
