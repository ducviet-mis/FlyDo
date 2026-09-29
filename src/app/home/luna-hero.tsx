'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, Moon, Pause, Play, Sparkles } from 'lucide-react';
import styles from './luna-home.module.css';

const destinations = [
  { grade: 6, className: styles.nodeSix },
  { grade: 7, className: styles.nodeSeven },
  { grade: 8, className: styles.nodeEight },
  { grade: 9, className: styles.nodeNine },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function LunaHero({ name }: { name?: string }) {
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
      <div className={styles.heroCopy}>
        <div className={styles.heroIndex}><Moon className="h-4 w-4" aria-hidden="true" /> ĐÀI QUAN SÁT LUNA <span aria-hidden="true">/</span> 01</div>
        <p className={styles.greeting}>{getGreeting()}, {name || 'bạn'}.</p>
        <h1 id="luna-heading">Dưới ánh trăng,<br /><span>mở lối tri thức.</span></h1>
        <p className={styles.heroDescription}>Một hành trình Toán học đang chờ bạn khám phá. Tiếp tục bài học gần nhất hoặc chọn lớp trên quỹ đạo Luna.</p>
        <div className={styles.heroActions}>
          <a href="#continue-learning" className={styles.primaryAction}>Tiếp tục hành trình <ArrowDownRight className="h-4 w-4" aria-hidden="true" /></a>
          <a href="#practice-heading" className={styles.secondaryAction}>Xem các lớp học</a>
        </div>
        <div className={styles.heroFootnote}><Sparkles className="h-4 w-4" aria-hidden="true" /> Từng bước học nhỏ sẽ mở ra một bầu trời rộng hơn.</div>
      </div>

      <div className={styles.chart} aria-label="Chọn lớp học trên quỹ đạo Luna">
        <svg className={styles.chartArt} viewBox="0 0 600 420" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="luna-halo"><stop stopColor="#DCEBFA" stopOpacity=".35" /><stop offset=".4" stopColor="#8EBEF0" stopOpacity=".16" /><stop offset="1" stopColor="#6D97F1" stopOpacity="0" /></radialGradient>
            <linearGradient id="luna-route" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#78deee" /><stop offset=".52" stopColor="#b9b2ff" /><stop offset="1" stopColor="#ffdb9b" /></linearGradient>
            <linearGradient id="luna-disc" x1="269" y1="181" x2="334" y2="262" gradientUnits="userSpaceOnUse"><stop stopColor="#F5F7EC" /><stop offset=".38" stopColor="#E2EBF5" /><stop offset="1" stopColor="#A8C3E2" /></linearGradient>
            <filter id="luna-glow"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>
          <circle className={styles.moonHalo} cx="300" cy="220" r="182" fill="url(#luna-halo)" />
          <circle className={styles.orbitOuter} cx="300" cy="210" r="176" fill="none" stroke="#a8c8ff" strokeOpacity=".17" strokeWidth="1" strokeDasharray="3 9" />
          <circle className={styles.orbitInner} cx="300" cy="210" r="127" fill="none" stroke="#a8c8ff" strokeOpacity=".22" strokeWidth="1" />
          <ellipse cx="300" cy="210" rx="226" ry="88" fill="none" stroke="#8dc0ff" strokeOpacity=".15" transform="rotate(-28 300 210)" />
          <path d="M300 46v26M300 348v26M120 210h26M454 210h26" stroke="#a9c9ec" strokeOpacity=".25" strokeWidth="1" />
          <path d="M110 270 245 160 390 190 500 90" fill="none" stroke="#9ec9ff" strokeOpacity=".28" strokeWidth="12" filter="url(#luna-glow)" />
          <path className={styles.constellationLine} d="M110 270 245 160 390 190 500 90" fill="none" stroke="url(#luna-route)" strokeWidth="1.5" strokeDasharray="4 7" strokeLinecap="round" />
          <path d="M160 85 204 105 232 70M387 300 427 278 466 323M95 140l34-24 28 12" fill="none" stroke="#a9c9ec" strokeOpacity=".25" strokeWidth="1" />
          <g className={styles.moonBody}>
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
        {destinations.map(({ grade, className }) => (
          <Link key={grade} href={`/practice?grade=${grade}`} className={`${styles.starNode} ${className}`} aria-label={`Khám phá Toán lớp ${grade}`}>
            <span className={styles.starNodeCore} aria-hidden="true" />
            <span className={styles.starNodeLabel}>LỚP {grade}</span>
          </Link>
        ))}
        <button type="button" onClick={toggleMotion} className={styles.motionButton} aria-label={motionPaused ? 'Bật hiệu ứng Luna' : 'Tạm dừng hiệu ứng Luna'} aria-pressed={motionPaused} title={motionPaused ? 'Bật hiệu ứng' : 'Tạm dừng hiệu ứng'}>
          {motionPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
