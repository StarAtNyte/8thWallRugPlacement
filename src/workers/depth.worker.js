import * as ort from 'onnxruntime-web'

let session = null

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

self.onmessage = async (e) => {
  const { type, id, payload } = e.data

  if (type === 'init') {
    ort.env.wasm.wasmPaths = payload.wasmPath
    try {
      session = await ort.InferenceSession.create(payload.modelUrl, {
        executionProviders: ['wasm'],
      })
      self.postMessage({ type: 'ready', id })
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message })
    }
    return
  }

  if (type === 'infer') {
    if (!session) {
      self.postMessage({ type: 'error', id, error: 'depth model not loaded' })
      return
    }
    const { pixels, width, height } = payload
    const input = preprocess(pixels, width, height)
    const tensor = new ort.Tensor('float32', input.data, input.dims)
    const feeds = { [session.inputNames[0]]: tensor }
    const results = await session.run(feeds)

    const depth = postprocess(results[session.outputNames[0]], width, height)
    self.postMessage({ type: 'result', id, depth: depth.buffer, width, height }, [depth.buffer])
  }
}

function preprocess(pixels, srcW, srcH) {
  const outW = Math.min(srcW, 518)
  const outH = Math.min(srcH, 518)
  const data = new Float32Array(3 * outH * outW)
  const xScale = srcW / outW
  const yScale = srcH / outH
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const sx = Math.min(Math.floor(dx * xScale), srcW - 1)
      const sy = Math.min(Math.floor(dy * yScale), srcH - 1)
      const srcIdx = (sy * srcW + sx) * 4
      const dstIdx = dy * outW + dx
      data[dstIdx] = (pixels[srcIdx] / 255.0 - MEAN[0]) / STD[0]
      data[outH * outW + dstIdx] = (pixels[srcIdx + 1] / 255.0 - MEAN[1]) / STD[1]
      data[2 * outH * outW + dstIdx] = (pixels[srcIdx + 2] / 255.0 - MEAN[2]) / STD[2]
    }
  }
  return { data, dims: [1, 3, outH, outW] }
}

function postprocess(outputTensor, outW, outH) {
  const depth = new Float32Array(outW * outH)
  const inData = outputTensor.data
  const inH = outputTensor.dims[2]
  const inW = outputTensor.dims[3]

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = (x / outW) * inW
      const sy = (y / outH) * inH
      const ix = Math.min(Math.floor(sx), inW - 2)
      const iy = Math.min(Math.floor(sy), inH - 2)
      const fx = sx - ix
      const fy = sy - iy

      const p00 = inData[iy * inW + ix]
      const p10 = inData[iy * inW + ix + 1]
      const p01 = inData[(iy + 1) * inW + ix]
      const p11 = inData[(iy + 1) * inW + ix + 1]

      const top = p00 + (p10 - p00) * fx
      const bot = p01 + (p11 - p01) * fx
      depth[y * outW + x] = top + (bot - top) * fy
    }
  }

  const min = depth.reduce((a, b) => Math.min(a, b), Infinity)
  const max = depth.reduce((a, b) => Math.max(a, b), -Infinity)
  const range = max - min || 1
  for (let i = 0; i < depth.length; i++) {
    depth[i] = (depth[i] - min) / range
  }

  return depth
}
