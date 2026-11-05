# Archive

The full version of the app as it was before it was simplified to rug placement only.
None of this is built or served.

- `src/occlusion/`, `src/workers/`: furniture occlusion (EdgeSAM, YOLOv8 segmentation, Depth-Anything) via onnxruntime-web
- `src/floor-grid.js`: debug floor grid
- `src/world-mesh-occluder.js`: SLAM world-mesh depth occluder
- `src/*.full.*`, `config/webpack.config.full.js`, `package.full.json`: the original component, page, styles, build config (with `/dev-log` endpoint) and dependencies
- `external/models/`: ONNX model weights

To bring it back, restore these files to their original paths (drop the `.full` suffix) and run `npm install onnxruntime-web`.
