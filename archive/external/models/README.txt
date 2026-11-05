Download these ONNX model files into this directory:

1. depth-anything-v2-small (INT8 quantized, 27 MB — recommended for mobile)
   wget https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_int8.onnx -O depth-anything-v2-small.onnx

2. YOLOv8n-seg (optimized, 13.7 MB)
   wget https://huggingface.co/Kalray/yolov8n-seg/resolve/main/yolov8n-seg.optimized.onnx -O yolov8n-seg.onnx

Total: ~41 MB over the wire, ~100 MB decompressed in memory at runtime.
