import { fuseMasks } from './fusion'

const DEFAULT_OPTIONS = {
  internalWidth: 320,
  internalHeight: 240,
  frameSkip: 3,
  floorDepthThreshold: 0.7,
  wasmPath: '/external/wasm/',
  modelPaths: {
    seg: '/external/models/yolov8n-seg.onnx',
    depth: '/external/models/depth-anything-v2-small.onnx',
  },
}

export class OcclusionManager {
  constructor(video, options = {}) {
    this.video = video
    this.opts = { ...DEFAULT_OPTIONS, ...options }

    this.ready = false
    this.frameCount = 0

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.opts.internalWidth
    this.canvas.height = this.opts.internalHeight
    this.ctx = this.canvas.getContext('2d')

    this.maskPixels = new Uint8Array(this.opts.internalWidth * this.opts.internalHeight)
    this.maskData = null
    this.maskDirty = false

    this._msgId = 0
    this._pending = new Map()
    this._segWorker = null
    this._depthWorker = null
    this._inferInFlight = false
  }

  async init() {
    this._segWorker = new Worker(
      new URL('../workers/seg.worker.js', import.meta.url),
    )
    this._depthWorker = new Worker(
      new URL('../workers/depth.worker.js', import.meta.url),
    )

    await Promise.all([
      this._initWorker(this._segWorker, this.opts.modelPaths.seg),
      this._initWorker(this._depthWorker, this.opts.modelPaths.depth),
    ])

    this._segWorker.onmessage = (e) => this._onMsg(e)
    this._depthWorker.onmessage = (e) => this._onMsg(e)

    this.ready = true
  }

  _initWorker(worker, modelUrl) {
    return new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data.type === 'ready') resolve()
        if (e.data.type === 'error') reject(new Error(e.data.error))
      }
      worker.postMessage({
        type: 'init',
        payload: { wasmPath: this.opts.wasmPath, modelUrl },
      })
    })
  }

  _onMsg(e) {
    const { type, id } = e.data
    if (!this._pending.has(id)) return
    const { resolve, reject } = this._pending.get(id)
    this._pending.delete(id)
    if (type === 'result') resolve(e.data)
    else reject(new Error(e.data.error || 'worker inference error'))
  }

  _send(worker, payload) {
    const id = this._msgId++
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject })
      worker.postMessage({ type: 'infer', id, payload })
    })
  }

  processFrame() {
    if (!this.ready) return
    if (this._inferInFlight) return
    if (this.frameCount++ % this.opts.frameSkip !== 0) return

    const w = this.opts.internalWidth
    const h = this.opts.internalHeight

    this.ctx.drawImage(this.video, 0, 0, w, h)
    const imageData = this.ctx.getImageData(0, 0, w, h)

    const px = imageData.data
    this._inferInFlight = true
    Promise.all([
      this._send(this._segWorker, { pixels: px, width: w, height: h }),
      this._send(this._depthWorker, { pixels: px, width: w, height: h }),
    ]).then(([segResult, depthResult]) => {
      const segMask = new Uint8Array(segResult.mask)
      const depthMap = new Float32Array(depthResult.depth)
      const fused = fuseMasks(segMask, depthMap, w, h, this.opts.floorDepthThreshold)
      this.maskPixels.set(fused)
      this.maskDirty = true
    }).catch(() => {
      // inference error — skip frame, allow retry next interval
    }).finally(() => {
      this._inferInFlight = false
    })
  }

  readMask(dst, dstW, dstH) {
    if (!this.maskDirty) return
    const srcW = this.opts.internalWidth
    const srcH = this.opts.internalHeight
    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        const sx = Math.floor((x / dstW) * srcW)
        const sy = Math.floor((y / dstH) * srcH)
        const val = this.maskPixels[sy * srcW + sx]
        const di = (y * dstW + x) * 4
        dst[di] = val * 255
        dst[di + 1] = val * 255
        dst[di + 2] = val * 255
        dst[di + 3] = 255
      }
    }
    this.maskDirty = false
  }

  destroy() {
    this.ready = false
    this._segWorker?.terminate()
    this._depthWorker?.terminate()
    for (const { reject } of this._pending.values()) {
      reject(new Error('OcclusionManager destroyed'))
    }
    this._pending.clear()
  }
}
