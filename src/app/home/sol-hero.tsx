'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BookMarked, BookOpen, FileText, Pause, PenLine, Play, Sun } from 'lucide-react';
import styles from './sol-home.module.css';

type SolHeroProps = { name?: string | null; greeting: string; children: ReactNode };

const destinations = [
  { label: 'LÝ THUYẾT', href: '/theory', className: styles.planetTheory, Icon: BookOpen },
  { label: 'TỰ LUYỆN', href: '/practice', className: styles.planetPractice, Icon: PenLine },
  { label: 'THI THỬ', href: '/mock-exams', className: styles.planetExams, Icon: FileText },
  { label: 'CẨM NANG', href: '/handbook', className: styles.planetHandbook, Icon: BookMarked },
] as const;

export function SolHero({ name, greeting, children }: SolHeroProps) {
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    try { setMotionPaused(localStorage.getItem('flydo-sol-motion') === 'paused'); }
    catch { /* The page remains usable when storage is unavailable. */ }
  }, []);

  function toggleMotion() {
    const next = !motionPaused;
    setMotionPaused(next);
    try { localStorage.setItem('flydo-sol-motion', next ? 'paused' : 'playing'); }
    catch { /* Keep the preference for this visit. */ }
  }

  return (
    <section className={styles.hero} aria-labelledby="sol-heading" data-motion={motionPaused ? 'paused' : 'playing'}>
      <div className={styles.heroAtmosphere} aria-hidden="true" />
      <div className={styles.heroCopy}>
        <p className={styles.heroIndex}><Sun className="h-4 w-4" aria-hidden="true" /> ĐÀI QUAN SÁT SOL <span aria-hidden="true">/</span> 01</p>
        <h1 id="sol-heading" className={styles.greeting}>{greeting}, {name || 'bạn'}.</h1>
        {children}
      </div>

      <div id="sol-orbits" className={styles.chart} aria-label="Bốn điểm đến học tập trong hệ Sol">
        <svg className={styles.chartArt} viewBox="0 0 600 420" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="sol-halo"><stop stopColor="#fff0bd" stopOpacity=".96" /><stop offset=".34" stopColor="#f8c66b" stopOpacity=".36" /><stop offset="1" stopColor="#ed9f41" stopOpacity="0" /></radialGradient>
            <radialGradient id="sol-disc" cx=".35" cy=".25" r=".82"><stop stopColor="#fffbe0" /><stop offset=".44" stopColor="#ffdd83" /><stop offset=".82" stopColor="#f5a944" /><stop offset="1" stopColor="#d87c2b" /></radialGradient>
            <linearGradient id="sol-route" x1="70" y1="290" x2="530" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor="#5298bf" /><stop offset=".52" stopColor="#d6a05c" /><stop offset="1" stopColor="#e09c58" /></linearGradient>
            <filter id="sol-soft-glow"><feGaussianBlur stdDeviation="8" /></filter>
          </defs>
          <circle className={styles.sunHalo} cx="300" cy="216" r="178" fill="url(#sol-halo)" />
          <circle cx="300" cy="210" r="176" fill="none" stroke="#9b7041" strokeOpacity=".32" strokeWidth="1" strokeDasharray="3 10" />
          <circle cx="300" cy="210" r="128" fill="none" stroke="#ae8550" strokeOpacity=".31" strokeWidth="1" />
          <ellipse cx="300" cy="211" rx="238" ry="91" fill="none" stroke="#af814d" strokeOpacity=".29" strokeWidth="1.3" transform="rotate(-26 300 211)" />
          <ellipse cx="300" cy="211" rx="224" ry="93" fill="none" stroke="#b58e61" strokeOpacity=".18" strokeWidth="1" transform="rotate(26 300 211)" />
          <path d="M75 271 202 97 452 103 492 307" fill="none" stroke="url(#sol-route)" strokeOpacity=".47" strokeWidth="1.4" strokeDasharray="5 9" strokeLinecap="round" />
          <path d="M300 37v26M300 358v25M58 210h24M518 210h24" stroke="#a47a49" strokeOpacity=".39" strokeWidth="1" />
          <g stroke="#e59b42" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round">
            <path d="M300 122v-18M300 309v18M206 216h-18M394 216h18M234 150l-13-13M366 282l13 13M366 150l13-13M234 282l-13 13" />
          </g>
          <g>
            <circle cx="300" cy="216" r="78" fill="#f3b655" fillOpacity=".34" filter="url(#sol-soft-glow)" />
            <circle cx="300" cy="216" r="70" fill="none" stroke="#e7b96f" strokeOpacity=".55" />
            <circle cx="300" cy="216" r="62" fill="url(#sol-disc)" stroke="#fff2c8" strokeWidth="2" />
            <path d="M269 180c20-15 49-11 67 3" fill="none" stroke="#fff9df" strokeOpacity=".5" strokeWidth="4" strokeLinecap="round" />
            <path d="M267 245c19 11 44 11 63-2" fill="none" stroke="#bb6b2c" strokeOpacity=".17" strokeWidth="5" strokeLinecap="round" />
          </g>
          <circle cx="428" cy="216" r="4" fill="#e7a755" stroke="#fff4d1" strokeWidth="1.5" />
          <circle cx="300" cy="34" r="3" fill="#79b6cd" stroke="#f4ffff" strokeWidth="1" />
          <g fill="#b4824a" fillOpacity=".7"><circle cx="89" cy="63" r="1.5" /><circle cx="155" cy="330" r="1.7" /><circle cx="352" cy="62" r="1.6" /><circle cx="533" cy="241" r="1.5" /><circle cx="524" cy="351" r="1.2" /><circle cx="449" cy="46" r="1.4" /></g>
        </svg>
        <span className={styles.chartCoordinate} aria-hidden="true">FLYDO / SOL 01</span>
        <span className={styles.chartLabel} aria-hidden="true">HỆ HỌC TẬP <span>•</span> 04 ĐIỂM ĐẾN</span>
        {destinations.map(({ label, href, className, Icon }) => (
          <Link key={href} href={href} className={`${styles.planet} ${className}`} aria-label={`Đến ${label.toLowerCase()}`}>
            <span className={styles.planetDisc}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className={styles.planetLabel}>{label}</span>
          </Link>
        ))}
        <button type="button" onClick={toggleMotion} className={styles.motionButton} aria-label={motionPaused ? 'Bật hiệu ứng Sol' : 'Tạm dừng hiệu ứng Sol'} aria-pressed={motionPaused} title={motionPaused ? 'Bật hiệu ứng' : 'Tạm dừng hiệu ứng'}>
          {motionPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
