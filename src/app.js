/* globals AFRAME, __LAN_URL__ */
import QRCode from 'qrcode'
import './index.css'
import {rugPlaceComponent} from './rug-place'

const isMobile = () => {
  const ua = navigator.userAgent
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)  // iPadOS reports as Mac
}

const showDesktopQr = () => {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  const url = local ? __LAN_URL__ : location.href
  document.getElementById('desktop-qr').hidden = false
  document.getElementById('qr-url').textContent = url
  QRCode.toCanvas(document.getElementById('qr-canvas'), url, {width: 280, margin: 1})
}

const loadScript = (src, attrs = {}) => new Promise((resolve, reject) => {
  const s = document.createElement('script')
  s.src = src
  s.crossOrigin = 'anonymous'
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v))
  s.onload = resolve
  s.onerror = () => reject(new Error(`Failed to load ${src}`))
  document.head.appendChild(s)
})

const startAr = async () => {
  await loadScript('./external/scripts/8frame-1.5.0.min.js')
  await loadScript('./external/xrextras/xrextras.js')
  // xr.js loads its SLAM chunk itself; the xrweb component waits for it.
  loadScript('./external/xr/xr.js', {'data-preload-chunks': 'slam'})

  AFRAME.registerComponent('rug-place', rugPlaceComponent)
  const template = document.getElementById('ar-template')
  document.body.appendChild(template.content.cloneNode(true))
}

if (isMobile()) startAr()
else showDesktopQr()
