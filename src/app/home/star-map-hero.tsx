'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, Orbit, Pause, Play, Sparkles } from 'lucide-react';
import styles from './star-map-home.module.css';

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

export function StarMapHero({ name }: { name?: string }) {
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    try { setMotionPaused(localStorage.getItem('flydo-starmap-motion') === 'paused'); } catch { /* Storage may be unavailable. */ }
  }, []);

  function toggleMotion() {
    const next = !motionPaused;
    setMotionPaused(next);
    try { localStorage.setItem('flydo-starmap-motion', next ? 'paused' : 'playing'); } catch { /* Keep the session preference. */ }
  }

  return (
    <section className={styles.hero} aria-labelledby="starmap-heading" data-motion={motionPaused ? 'paused' : 'playing'}>
      <div className={styles.heroAtmosphere} aria-hidden="true" />
      <div className={styles.heroCopy}>
        <div className={styles.heroIndex}><Orbit className="h-4 w-4" aria-hidden="true" /> ĐÀI QUAN SÁT FLYDO <span aria-hidden="true">/</span> 01</div>
        <p className={styles.greeting}>{getGreeting()}, {name || 'bạn'}.</p>
        <h1 id="starmap-heading">Mỗi bài học,<br /><span>một vì sao.</span></h1>
        <p className={styles.heroDescription}>Hành trình Toán học của bạn đang chờ một điểm sáng mới. Bắt đầu từ bài học gần nhất hoặc chọn một lớp trên bản đồ.</p>
        <div className={styles.heroActions}>
          <a href="#continue-learning" className={styles.primaryAction}>Tiếp tục hành trình <ArrowDownRight className="h-4 w-4" aria-hidden="true" /></a>
          <a href="#practice-heading" className={styles.secondaryAction}>Xem các lớp học</a>
        </div>
        <div className={styles.heroFootnote}><Sparkles className="h-4 w-4" aria-hidden="true" /> Một bước nhỏ hôm nay, một quỹ đạo dài mai sau.</div>
      </div>

      <div className={styles.chart} aria-label="Chọn lớp học từ bản đồ sao">
        <svg className={styles.chartArt} viewBox="0 0 600 420" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="starmap-core"><stop stopColor="#a7dfff" stopOpacity=".5" /><stop offset=".38" stopColor="#6d97f1" stopOpacity=".19" /><stop offset="1" stopColor="#6d97f1" stopOpacity="0" /></radialGradient>
            <linearGradient id="starmap-route" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#78deee" /><stop offset=".52" stopColor="#b9b2ff" /><stop offset="1" stopColor="#ffdb9b" /></linearGradient>
            <filter id="starmap-glow"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>
          <circle cx="300" cy="210" r="178" fill="url(#starmap-core)" />
          <circle className={styles.orbitOuter} cx="300" cy="210" r="176" fill="none" stroke="#a8c8ff" strokeOpacity=".17" strokeWidth="1" strokeDasharray="3 9" />
          <circle className={styles.orbitInner} cx="300" cy="210" r="127" fill="none" stroke="#a8c8ff" strokeOpacity=".22" strokeWidth="1" />
          <ellipse cx="300" cy="210" rx="226" ry="88" fill="none" stroke="#8dc0ff" strokeOpacity=".15" transform="rotate(-28 300 210)" />
          <path d="M300 46v26M300 348v26M120 210h26M454 210h26" stroke="#a9c9ec" strokeOpacity=".25" strokeWidth="1" />
          <path d="M110 270 245 160 390 190 500 90" fill="none" stroke="#9ec9ff" strokeOpacity=".28" strokeWidth="12" filter="url(#starmap-glow)" />
          <path className={styles.constellationLine} d="M110 270 245 160 390 190 500 90" fill="none" stroke="url(#starmap-route)" strokeWidth="1.5" strokeDasharray="4 7" strokeLinecap="round" />
          <path d="M160 85 204 105 232 70M387 300 427 278 466 323M95 140l34-24 28 12" fill="none" stroke="#a9c9ec" strokeOpacity=".25" strokeWidth="1" />
          <circle cx="300" cy="210" r="25" fill="#a2cbff" fillOpacity=".06" stroke="#c5ddff" strokeOpacity=".28" />
          <circle cx="300" cy="210" r="8" fill="#f3f9ff" fillOpacity=".88" />
          <path d="M300 190v-8m0 56v-8m-20-20h-8m56 0h-8" stroke="#c8e5ff" strokeOpacity=".45" />
          {[ [75,54,2], [148,315,1.5], [195,52,1.3], [338,82,2], [375,365,1.3], [552,260,1.8], [534,345,1.2], [52,195,1.2], [458,42,1.3], [241,338,1.4] ].map(([x,y,r], index) => <circle key={index} className={styles.microStar} style={{ animationDelay: `${index * -.7}s` }} cx={x} cy={y} r={r} fill="#d7eeff" />)}
        </svg>
        <span className={styles.chartCoordinate} aria-hidden="true">FLYDO / BẢN ĐỒ 01</span>
        <span className={styles.chartLabel} aria-hidden="true">QUỸ ĐẠO HỌC TẬP <span>•</span> 04 ĐIỂM ĐẾN</span>
        {destinations.map(({ grade, className }) => (
          <Link key={grade} href={`/practice?grade=${grade}`} className={`${styles.starNode} ${className}`} aria-label={`Khám phá Toán lớp ${grade}`}>
            <span className={styles.starNodeCore} aria-hidden="true" />
            <span className={styles.starNodeLabel}>LỚP {grade}</span>
          </Link>
        ))}
        <button type="button" onClick={toggleMotion} className={styles.motionButton} aria-label={motionPaused ? 'Bật hiệu ứng bản đồ sao' : 'Tạm dừng hiệu ứng bản đồ sao'} aria-pressed={motionPaused} title={motionPaused ? 'Bật hiệu ứng' : 'Tạm dừng hiệu ứng'}>
          {motionPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
