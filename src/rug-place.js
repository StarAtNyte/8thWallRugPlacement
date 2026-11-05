/* globals THREE */

// Scene units are metres: the camera starts at y = 1.6 (see index.html) and
// 8th Wall's responsive scale maps that to the phone's real height, so the
// floor is y = 0.
const DEFAULT_WIDTH_CM = 160
const RUG_LIFT = 0.005       // sit just above the floor

const rugPlaceComponent = {
  init() {
    this.rug = null          // parent: position + rotation, dragged by xrextras
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
    if (this.rug) this.rug.object3D.rotation.y = THREE.MathUtils.degToRad(-deg)
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
    rug.setAttribute('xrextras-hold-drag', 'riseHeight: 0')

    const rugMesh = document.createElement('a-entity')
    rugMesh.classList.add('cantap')
    rugMesh.setAttribute('position', {x: 0, y: RUG_LIFT, z: 0})
    rugMesh.setAttribute('rotation', '-90 0 0')
    rug.appendChild(rugMesh)

    this.rug = rug
    this.rugMesh = rugMesh
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

  removeRug() {
    if (!this.rug) return
    const mesh = this.rugMesh.getObject3D('mesh')
    if (mesh) mesh.material.dispose()
    this.rug.parentNode.removeChild(this.rug)
    this.rug = null
    this.rugMesh = null
    this.ui.controls.hidden = true
    this.ui.remove.hidden = true
    this.ui.hint.textContent = 'Tap the floor to place the rug'
  },
}

export {rugPlaceComponent}
