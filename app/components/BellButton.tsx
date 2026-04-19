'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const VOLUME_STEPS = [0.25, 0.5, 1.0, 2.0, 3.0]
const DEFAULT_STEP = 2 // index of 1.0

function VolumeLabel({ step }: { step: number }) {
  const labels = ['🔇', '🔉', '🔊', '📢', '💥']
  const values = ['×0.25', '×0.5', '×1', '×2', '×3']
  return (
    <span className="flex flex-col items-center gap-0.5 leading-none select-none">
      <span style={{ fontSize: 18 }}>{labels[step]}</span>
      <span style={{ fontSize: 11, opacity: 0.6 }}>{values[step]}</span>
    </span>
  )
}

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

const MAX_PARTICLES = 150

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

  const audioCtxRef    = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const [volumeStep, setVolumeStep] = useState(DEFAULT_STEP)
  const tickRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if ('audioSession' in navigator) {
      (navigator as unknown as { audioSession: { type: string } }).audioSession.type = 'playback'
    }
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
      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = 0
      }
    }
    tickRef.current = tick
    return () => {
      cancelAnimationFrame(rafRef.current)
      tickRef.current = null
    }
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
      gainNode.gain.value = VOLUME_STEPS[volumeStep]
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
      if (particlesRef.current.length > MAX_PARTICLES) {
        particlesRef.current = particlesRef.current.slice(-MAX_PARTICLES)
      }
      if (rafRef.current === 0 && tickRef.current) {
        rafRef.current = requestAnimationFrame(tickRef.current)
      }
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
  }, [shakeScreen, volumeStep])

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

      {/* 底部音量 bar */}
      <div className="fixed bottom-0 left-0 right-0 flex flex-col items-center pb-8 pt-4" style={{ zIndex: 40 }}>
        <div className="flex items-center gap-3 w-full max-w-xs px-4">
          <VolumeLabel step={volumeStep} />
          <div className="relative flex-1 flex items-center h-8">
            {/* track 底色 — 淺灰，亮暗背景皆清晰可見 */}
            <div className="absolute inset-x-0 h-2 rounded-full" style={{ background: '#d1d5db' }} />
            {/* filled */}
            <div
              className="absolute left-0 h-2 rounded-full bg-orange-400 transition-all"
              style={{ width: `${(volumeStep / (VOLUME_STEPS.length - 1)) * 100}%` }}
            />
            {/* step dots */}
            {VOLUME_STEPS.map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-full border-2 transition-colors"
                style={{
                  left:        `calc(${(i / (VOLUME_STEPS.length - 1)) * 100}% - 6px)`,
                  background:  i <= volumeStep ? '#f97316' : '#9ca3af',
                  borderColor: i <= volumeStep ? '#fed7aa' : '#e5e7eb',
                }}
              />
            ))}
            <input
              type="range"
              min={0}
              max={VOLUME_STEPS.length - 1}
              step={1}
              value={volumeStep}
              onChange={e => setVolumeStep(Number(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              style={{ height: '100%' }}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>

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
