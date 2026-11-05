import * as ort from 'onnxruntime-web'

let session = null
const TARGET = 1024
const MEAN = [123.675, 116.28, 103.53]
const STD = [58.395, 57.12, 57.375]

self.onmessage = async (e) => {
  const { type, id, payload } = e.data

  if (type === 'init') {
    ort.env.wasm.wasmPaths = payload.wasmPath
    try {
      session = await ort.InferenceSession.create(payload.modelUrl, { executionProviders: ['webgpu', 'wasm'] })
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message })
    }
    return
  }

  if (type === 'encode') {
    try {
      const { pixels, width, height } = payload
      const { data, scale } = preprocess(pixels, width, height)
      const tensor = new ort.Tensor('float32', data, [1, 3, TARGET, TARGET])
      const results = await session.run({ [session.inputNames[0]]: tensor })
      const embedding = results[session.outputNames[0]]
      self.postMessage(
        { type: 'result', id, embedding: embedding.data.buffer, scale },
        [embedding.data.buffer],
      )
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message })
    }
  }
}

function preprocess(pixels, srcW, srcH) {
  const scale = TARGET / Math.max(srcW, srcH)
  const scaledW = Math.round(srcW * scale)
  const scaledH = Math.round(srcH * scale)
  const data = new Float32Array(3 * TARGET * TARGET)

  for (let dy = 0; dy < scaledH; dy++) {
    for (let dx = 0; dx < scaledW; dx++) {
      const sx = Math.min(Math.floor(dx / scale), srcW - 1)
      const sy = Math.min(Math.floor(dy / scale), srcH - 1)
      const si = (sy * srcW + sx) * 4
      const di = dy * TARGET + dx
      data[di] = (pixels[si] - MEAN[0]) / STD[0]
      data[TARGET * TARGET + di] = (pixels[si + 1] - MEAN[1]) / STD[1]
      data[2 * TARGET * TARGET + di] = (pixels[si + 2] - MEAN[2]) / STD[2]
    }
  }

  return { data, scale }
}
