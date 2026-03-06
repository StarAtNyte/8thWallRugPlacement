# AR Rug Placer

Place a rug with your chosen design onto your room's floor using WebAR.

## Features
- Select a design from the gallery thumbnails
- Upload a custom design from your device
- Tap the floor to place the rug
- Drag to reposition, two-finger rotate, pinch to scale
- Live texture swap — change the design anytime
- Remove and start over

## Setup

1. Download the 8th Wall engine from https://8th.io/xrjs
2. Unzip `xr-standalone.zip` into the `external/` folder
3. Add rug texture images to `src/assets/textures/`:
   - `persian.jpg`
   - `modern.jpg`
   - `bohemian.jpg`
   - `geometric.jpg`
4. Install and run:
   ```bash
   npm install
   npm run serve
   ```
5. Open the HTTPS URL on your mobile device (same Wi-Fi network)

## Testing on Mobile
See https://8th.io/test-on-mobile for connecting your phone to the dev server.

## Customization
- Edit `RUG_WIDTH` and `RUG_DEPTH` in `src/rug-place.js` to change rug dimensions
- Add more thumbnails to the `#design-gallery` in `src/index.html`
- Replace the box geometry with a custom `.glb` rug mesh for realistic edges/fringe
