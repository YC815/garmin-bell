'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ── 粒子系統 ──────────────────────────────────────────────
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  alpha: number
  decay: number
  gravity: number
}

const COLORS = [
  '#ff6b00', '#ff9500', '#ffcc00',
  '#ff3b30', '#ff2d55', '#ff6ec7',
  '#34c759', '#5ac8fa', '#af52de',
  '#ffffff',
]

function spawnParticles(canvas: HTMLCanvasElement, cx: number, cy: number, count: number) {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 2 + Math.random() * 8
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
      decay: 0.015 + Math.random() * 0.02,
      gravity: 0.15 + Math.random() * 0.1,
    })
  }
  return particles
}

// ── Combo 顏色分級 ─────────────────────────────────────────
function getComboColor(combo: number): string {
  if (combo >= 20) return '#af52de'
  if (combo >= 15) return '#ff2d55'
  if (combo >= 10) return '#ff6b00'
  if (combo >= 5)  return '#ffcc00'
  return '#ffffff'
}

// ── Main Component ─────────────────────────────────────────
export default function BellButton() {
  const btnRef        = useRef<HTMLButtonElement>(null)
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const wrapperRef    = useRef<HTMLDivElement>(null)
  const particlesRef  = useRef<Particle[]>([])
  const rafRef        = useRef<number>(0)
  const comboRef      = useRef(0)
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [combo, setCombo]               = useState(0)
  const [comboVisible, setComboVisible] = useState(false)
  const [comboRotate, setComboRotate]   = useState(0)
  const comboFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const audioCtxRef  = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)

  useEffect(() => {
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    fetch('/garmin_bell.mp3')
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { audioBufferRef.current = decoded })
      .catch(() => {})
    return () => { ctx.close() }
  }, [])

  // canvas 跟隨視窗大小
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // 動畫循環
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particlesRef.current = particlesRef.current.filter(p => p.alpha > 0)
      for (const p of particlesRef.current) {
        p.x     += p.vx
        p.y     += p.vy
        p.vy    += p.gravity
        p.vx    *= 0.98
        p.alpha -= p.decay
        ctx.globalAlpha = Math.max(0, p.alpha)
        ctx.fillStyle   = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const shakeScreen = useCallback((intensity: number) => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    wrapper.style.setProperty('--shake-x', `${(Math.random() - 0.5) * intensity * 2}px`)
    wrapper.style.setProperty('--shake-y', `${(Math.random() - 0.5) * intensity * 2}px`)
    wrapper.classList.remove('screen-shake')
    void wrapper.offsetWidth
    wrapper.classList.add('screen-shake')
  }, [])

  const handleClick = useCallback(() => {
    const ctx = audioCtxRef.current
    const buffer = audioBufferRef.current
    if (ctx && buffer) {
      if (ctx.state === 'suspended') ctx.resume()
      const gainNode = ctx.createGain()
      gainNode.gain.value = 3.0
      gainNode.connect(ctx.destination)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gainNode)
      source.start()
    }

    // 按鈕 shake
    const btn = btnRef.current
    if (btn) {
      btn.classList.remove('bell-shake')
      void btn.offsetWidth
      btn.classList.add('bell-shake')
    }

    // 爆粒子 — 從按鈕中心發射
    const canvas = canvasRef.current
    if (canvas && btn) {
      const rect = btn.getBoundingClientRect()
      const cx   = rect.left + rect.width  / 2
      const cy   = rect.top  + rect.height / 2
      const newParticles = spawnParticles(
        canvas, cx, cy,
        20 + Math.min(comboRef.current * 5, 80),
      )
      particlesRef.current.push(...newParticles)
    }

    // combo 計數
    comboRef.current += 1
    const c = comboRef.current
    setCombo(c)
    setComboVisible(true)
    setComboRotate((Math.random() - 0.5) * 16)

    if (comboFadeTimer.current) clearTimeout(comboFadeTimer.current)
    comboFadeTimer.current = setTimeout(() => setComboVisible(false), 1200)

    if (comboTimerRef.current) clearTimeout(comboTimerRef.current)
    comboTimerRef.current = setTimeout(() => {
      comboRef.current = 0
      setCombo(0)
    }, 800)

    // 畫面震動，combo 越高越抖
    shakeScreen(Math.min(c * 0.8, 10))
  }, [shakeScreen])

  const color = getComboColor(combo)
  const scale = 1 + Math.min(combo * 0.04, 0.8)

  return (
    <>
      {/* 全畫面 canvas，z-index 在最上但 pointer-events none */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 50 }}
      />

      {/* 整個畫面 wrapper，用來做 screen shake */}
      <div ref={wrapperRef} className="shake-wrapper flex flex-col items-center justify-center gap-8">

        {/* Combo 計數器 */}
        <div
          className="combo-display select-none pointer-events-none"
          style={{
            opacity:    comboVisible && combo >= 2 ? 1 : 0,
            color,
            transform:  `scale(${scale}) rotate(${comboRotate}deg)`,
            transition: 'opacity 0.15s, color 0.2s',
          }}
        >
          <span className="combo-number">{combo}</span>
        </div>

        {/* 主按鈕 */}
        <button
          ref={btnRef}
          onClick={handleClick}
          aria-label="Ring bell"
          className="bell-btn relative flex items-center justify-center rounded-full bg-orange-500 shadow-2xl hover:bg-orange-400 focus-visible:outline-none"
          style={{ width: 200, height: 200 }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-white"
            style={{ width: 88, height: 88 }}
          >
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
          </svg>
        </button>
      </div>
    </>
  )
}
