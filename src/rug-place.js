/* globals THREE */

// Scene units are metres: the camera starts at y = 1.6 (see index.html) and
// 8th Wall's responsive scale maps that to the phone's real height, so the
// floor is y = 0.
const DEFAULT_WIDTH_CM = 100
const RUG_LIFT = 0.005       // sit just above the floor
const PICKUP_HEIGHT = 0.25   // how far the rug rises while held (8th Wall hold-drag)

// Soft rectangular shadow drawn once to a canvas; reused for every rug.
let shadowTexture = null
function getShadowTexture() {
  if (shadowTexture) return shadowTexture
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.filter = 'blur(18px)'
  ctx.fillStyle = 'rgba(0,0,0,1)'
  ctx.fillRect(40, 40, 176, 176)
  shadowTexture = new THREE.CanvasTexture(c)
  return shadowTexture
}

const rugPlaceComponent = {
  init() {
    this.rug = null          // parent: position + rotation, dragged by xrextras
    this.shadow = null       // stays on the floor under the rug
    this.wasDragging = false
    this.rugMesh = null      // child: the flat textured plane
    this.texture = null
    this.aspect = 1.25       // length / width, updated from the image
    this.loadSeq = 0

    const $ = (id) => document.getElementById(id)
    this.ui = {
      hint: $('hint'),
      controls: $('rug-controls'),
      size: $('size-slider'),
      sizeLabel: $('size-label'),
      rotate: $('rotate-slider'),
      rotateLabel: $('rotate-label'),
      remove: $('remove-btn'),
      upload: $('upload-btn'),
      file: $('file-input'),
      panel: $('design-panel'),
    }
    this.ui.size.value = DEFAULT_WIDTH_CM

    this.loadTexture(document.querySelector('.design-thumb.selected').dataset.texture)

    $('ground').addEventListener('click', (e) => this.placeAt(e.detail.intersection.point))

    document.querySelectorAll('.design-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        this.select(thumb)
        this.loadTexture(thumb.dataset.texture)
      })
    })

    this.ui.upload.addEventListener('click', () => this.ui.file.click())
    this.ui.file.addEventListener('change', () => {
      const file = this.ui.file.files[0]
      if (!file) return
      const url = URL.createObjectURL(file)
      this.ui.upload.innerHTML = `<img src="${url}" alt="Custom">`
      this.select(this.ui.upload)
      this.loadTexture(url)
      this.ui.file.value = ''
    })

    this.ui.size.addEventListener('input', () => this.updateSize())
    this.ui.rotate.addEventListener('input', () => this.updateRotation())
    this.ui.remove.addEventListener('click', () => this.removeRug())
    $('toggle-panel').addEventListener('click', () => this.ui.panel.classList.toggle('hidden'))

    this.updateSize()
    this.updateRotation()
  },

  select(el) {
    document.querySelectorAll('.design-thumb, .upload-thumb').forEach((t) => t.classList.remove('selected'))
    el.classList.add('selected')
  },

  loadTexture(src) {
    const seq = ++this.loadSeq
    new THREE.TextureLoader().load(src, (texture) => {
      if (seq !== this.loadSeq) { texture.dispose(); return }
      if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace
      else texture.encoding = THREE.sRGBEncoding
      texture.anisotropy = this.el.sceneEl.renderer.capabilities.getMaxAnisotropy()

      const old = this.texture
      this.texture = texture
      this.aspect = texture.image.height / texture.image.width
      this.updateSize()
      this.applyMaterial()
      if (old) old.dispose()
    })
  },

  widthMetres() {
    return Number(this.ui.size.value) / 100
  },

  updateSize() {
    const w = Number(this.ui.size.value)
    this.ui.sizeLabel.textContent = `${w} × ${Math.round(w * this.aspect)} cm`
    if (!this.rugMesh) return
    this.rugMesh.setAttribute('geometry', {
      primitive: 'plane',
      width: this.widthMetres(),
      height: this.widthMetres() * this.aspect,
    })
  },

  updateRotation() {
    const deg = Number(this.ui.rotate.value)
    this.ui.rotateLabel.textContent = `${deg}°`
    if (!this.rug) return
    const rad = THREE.MathUtils.degToRad(-deg)
    this.rug.object3D.rotation.y = rad
    this.shadow.object3D.rotation.z = rad
  },

  applyMaterial() {
    const mesh = this.rugMesh && this.rugMesh.getObject3D('mesh')
    if (!mesh || !this.texture || mesh.material.map === this.texture) return
    mesh.material.dispose()
    mesh.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    })
  },

  placeAt(point) {
    if (this.rug) {
      this.rug.object3D.position.set(point.x, point.y, point.z)
      return
    }

    const rug = document.createElement('a-entity')
    rug.setAttribute('position', {x: point.x, y: point.y, z: point.z})
    rug.setAttribute('xrextras-hold-drag', `riseHeight: ${PICKUP_HEIGHT}`)

    const rugMesh = document.createElement('a-entity')
    rugMesh.classList.add('cantap')
    rugMesh.setAttribute('position', {x: 0, y: RUG_LIFT, z: 0})
    rugMesh.setAttribute('rotation', '-90 0 0')
    rug.appendChild(rugMesh)

    const shadow = document.createElement('a-entity')
    shadow.setAttribute('geometry', 'primitive: plane; width: 1; height: 1')
    shadow.setAttribute('rotation', '-90 0 0')
    shadow.setAttribute('position', {x: point.x, y: RUG_LIFT / 2, z: point.z})
    shadow.addEventListener('loaded', () => {
      shadow.getObject3D('mesh').material = new THREE.MeshBasicMaterial({
        map: getShadowTexture(), transparent: true, opacity: 0.45, depthWrite: false,
      })
    }, {once: true})
    this.el.sceneEl.appendChild(shadow)

    this.rug = rug
    this.rugMesh = rugMesh
    this.shadow = shadow
    rugMesh.addEventListener('loaded', () => {
      this.updateSize()
      this.updateRotation()
      this.applyMaterial()
    }, {once: true})
    this.el.sceneEl.appendChild(rug)

    this.ui.controls.hidden = false
    this.ui.remove.hidden = false
    this.ui.hint.textContent = 'Tap the floor to move it, or hold and drag the rug'
  },

  // Keep the shadow on the floor under the rug; as the rug is picked up the
  // shadow spreads and fades, which is what sells the lift.
  tick() {
    if (!this.rug || !this.shadow) return
    const p = this.rug.object3D.position
    this.shadow.object3D.position.set(p.x, RUG_LIFT / 2, p.z)

    const lift = Math.min(Math.max(p.y / PICKUP_HEIGHT, 0), 1)
    const mesh = this.shadow.getObject3D('mesh')
    if (mesh) mesh.material.opacity = 0.45 - 0.25 * lift
    this.shadow.object3D.scale.x = this.widthMetres() * (1.45 + 0.3 * lift)
    this.shadow.object3D.scale.y = this.widthMetres() * this.aspect * (1.45 + 0.3 * lift)

    const drag = this.rug.components['xrextras-hold-drag']
    const dragging = !!(drag && drag.internalState.dragging)
    if (dragging && !this.wasDragging && navigator.vibrate) navigator.vibrate(15)
    this.wasDragging = dragging
  },

  removeRug() {
    if (!this.rug) return
    const mesh = this.rugMesh.getObject3D('mesh')
    if (mesh) mesh.material.dispose()
    this.rug.parentNode.removeChild(this.rug)
    this.shadow.parentNode.removeChild(this.shadow)
    this.rug = null
    this.rugMesh = null
    this.shadow = null
    this.ui.controls.hidden = true
    this.ui.remove.hidden = true
    this.ui.hint.textContent = 'Tap the floor to place the rug'
  },
}

export {rugPlaceComponent}
