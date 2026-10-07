'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BookMarked, BookOpen, FileText, Moon, Pause, PenLine, Play } from 'lucide-react';
import styles from './luna-home.module.css';

const destinations = [
  { label: 'LÝ THUYẾT', href: '/theory', className: styles.destinationTheory, Icon: BookOpen },
  { label: 'TỰ LUYỆN', href: '/practice', className: styles.destinationPractice, Icon: PenLine },
  { label: 'THI THỬ', href: '/mock-exams', className: styles.destinationExams, Icon: FileText },
  { label: 'CẨM NANG', href: '/handbook', className: styles.destinationHandbook, Icon: BookMarked },
] as const;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function LunaHero({ name, children }: { name?: string; children: ReactNode }) {
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('flydo-luna-motion') ?? localStorage.getItem('flydo-starmap-motion');
      setMotionPaused(saved === 'paused');
    } catch { /* Storage may be unavailable. */ }
  }, []);

  function toggleMotion() {
    const next = !motionPaused;
    setMotionPaused(next);
    try { localStorage.setItem('flydo-luna-motion', next ? 'paused' : 'playing'); } catch { /* Keep the session preference. */ }
  }

  return (
    <section className={styles.hero} aria-labelledby="luna-heading" data-motion={motionPaused ? 'paused' : 'playing'}>
      <div className={styles.heroAtmosphere} aria-hidden="true" />
      <div className={styles.aurora} aria-hidden="true" />
      <div className={styles.heroCopy}>
        <div className={styles.heroIndex}><Moon className="h-4 w-4" aria-hidden="true" /> ĐÀI QUAN SÁT LUNA <span aria-hidden="true">/</span> 01</div>
        <h1 id="luna-heading" className={styles.greeting}>{getGreeting()}, {name || 'bạn'}.</h1>
        {children}
      </div>

      <div id="luna-orbits" className={styles.chart} aria-label="Bốn điểm đến học tập trong hệ Luna">
        <svg className={styles.chartArt} viewBox="0 0 600 420" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="luna-halo"><stop stopColor="#F0F8FF" stopOpacity=".48" /><stop offset=".38" stopColor="#8EBEF0" stopOpacity=".22" /><stop offset="1" stopColor="#6D97F1" stopOpacity="0" /></radialGradient>
            <linearGradient id="luna-route" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#78deee" /><stop offset=".52" stopColor="#b9b2ff" /><stop offset="1" stopColor="#ffdb9b" /></linearGradient>
            <linearGradient id="luna-disc" x1="269" y1="181" x2="334" y2="262" gradientUnits="userSpaceOnUse"><stop stopColor="#F5F7EC" /><stop offset=".38" stopColor="#E2EBF5" /><stop offset="1" stopColor="#A8C3E2" /></linearGradient>
            <filter id="luna-glow"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>
          <circle className={styles.moonHalo} cx="300" cy="220" r="182" fill="url(#luna-halo)" />
          <circle cx="300" cy="220" r="78" fill="none" stroke="#cfe7ff" strokeOpacity=".2" strokeWidth="1" />
          <circle cx="300" cy="210" r="176" fill="none" stroke="#a8c8ff" strokeOpacity=".17" strokeWidth="1" strokeDasharray="3 9" />
          <circle cx="300" cy="210" r="127" fill="none" stroke="#a8c8ff" strokeOpacity=".22" strokeWidth="1" />
          <ellipse cx="300" cy="210" rx="226" ry="88" fill="none" stroke="#8dc0ff" strokeOpacity=".15" transform="rotate(-28 300 210)" />
          <path d="M300 46v26M300 348v26M120 210h26M454 210h26" stroke="#a9c9ec" strokeOpacity=".25" strokeWidth="1" />
          <path d="M110 270 204 97 450 101 498 307" fill="none" stroke="#9ec9ff" strokeOpacity=".28" strokeWidth="12" filter="url(#luna-glow)" />
          <path d="M110 270 204 97 450 101 498 307" fill="none" stroke="url(#luna-route)" strokeWidth="1.5" strokeDasharray="4 7" strokeLinecap="round" />
          <g><circle cx="427" cy="210" r="3.5" fill="#c9f1ff" /><circle cx="427" cy="210" r="8" fill="#c9f1ff" fillOpacity=".12" /></g>
          <g><circle cx="300" cy="34" r="2.7" fill="#ffe7b8" /><circle cx="300" cy="34" r="7" fill="#ffe7b8" fillOpacity=".1" /></g>
          <path d="M160 85 204 105 232 70M387 300 427 278 466 323M95 140l34-24 28 12" fill="none" stroke="#a9c9ec" strokeOpacity=".25" strokeWidth="1" />
          <g>
            <circle cx="300" cy="220" r="53" fill="#B8D4F4" fillOpacity=".14" filter="url(#luna-glow)" />
            <circle cx="300" cy="220" r="46" fill="url(#luna-disc)" stroke="#E9F3FA" strokeOpacity=".82" strokeWidth="1.3" />
            <circle cx="300" cy="220" r="52" fill="none" stroke="#D4E8F7" strokeOpacity=".27" />
            <g fill="#668EB8" fillOpacity=".11"><ellipse cx="283" cy="202" rx="10" ry="5" transform="rotate(-24 283 202)" /><circle cx="318" cy="205" r="6" /><ellipse cx="314" cy="240" rx="13" ry="7" transform="rotate(19 314 240)" /><circle cx="280" cy="236" r="4" /></g>
            <path d="M273 242c15 10 39 13 60-1" fill="none" stroke="#F6F8F2" strokeOpacity=".18" strokeWidth="2" />
          </g>
          {[ [75,54,2], [148,315,1.5], [195,52,1.3], [338,82,2], [375,365,1.3], [552,260,1.8], [534,345,1.2], [52,195,1.2], [458,42,1.3], [241,338,1.4] ].map(([x,y,r], index) => <circle key={index} cx={x} cy={y} r={r} fill="#d7eeff" />)}
        </svg>
        <span className={styles.chartCoordinate} aria-hidden="true">FLYDO / LUNA 01</span>
        <span className={styles.chartLabel} aria-hidden="true">QUỸ ĐẠO HỌC TẬP <span>•</span> 04 ĐIỂM ĐẾN</span>
        {destinations.map(({ label, href, className, Icon }) => (
          <Link key={href} href={href} className={`${styles.destination} ${className}`} aria-label={`Đến ${label.toLowerCase()}`}>
            <span className={styles.destinationDisc}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className={styles.destinationLabel}>{label}</span>
          </Link>
        ))}
        <button type="button" onClick={toggleMotion} className={styles.motionButton} aria-label={motionPaused ? 'Bật hiệu ứng Luna' : 'Tạm dừng hiệu ứng Luna'} aria-pressed={motionPaused} title={motionPaused ? 'Bật hiệu ứng' : 'Tạm dừng hiệu ứng'}>
          {motionPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
