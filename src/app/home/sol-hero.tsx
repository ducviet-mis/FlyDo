import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, BookOpen, Sparkles } from 'lucide-react';
import styles from './sol-home.module.css';

type SolHeroProps = { name?: string | null; greeting: string };

export function SolHero({ name, greeting }: SolHeroProps) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.kicker}><span className={styles.kickerLine} /> SOL / KHÔNG GIAN HỌC TẬP</p>
        <p className={styles.greeting}>{greeting}, {name || 'Bạn'}.</p>
        <h1>Mỗi ngày học, <em>một điều rực rỡ.</em></h1>
        <p className={styles.description}>Một khoảng trời sáng để tập trung, tìm hiểu và đi xa hơn từng chút một. Bắt đầu từ điều bạn tò mò hôm nay.</p>
        <div className={styles.actions}>
          <a href="#continue-learning" className={styles.primaryAction}>Tiếp tục học <ArrowDownRight aria-hidden="true" size={17} /></a>
          <Link href="/theory" className={styles.secondaryAction}><BookOpen aria-hidden="true" size={17} /> Khám phá lý thuyết <ArrowUpRight aria-hidden="true" size={15} /></Link>
        </div>
        <p className={styles.footnote}><Sparkles aria-hidden="true" size={14} /> Học theo nhịp của bạn — tiến bộ sẽ đến.</p>
      </div>
      <div className={styles.art} aria-hidden="true">
        <span className={styles.artLabelTop}>GÓC NHÌN MỚI / 01</span>
        <svg className={styles.artwork} viewBox="0 0 580 440" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sol-sky" x1="150" y1="0" x2="420" y2="440" gradientUnits="userSpaceOnUse"><stop stopColor="#fff9e9"/><stop offset=".56" stopColor="#f9e6bd"/><stop offset="1" stopColor="#e7d5b0"/></linearGradient>
            <linearGradient id="sol-sun" x1="225" y1="88" x2="380" y2="293" gradientUnits="userSpaceOnUse"><stop stopColor="#fff7d1"/><stop offset=".53" stopColor="#f8c96c"/><stop offset="1" stopColor="#df9f45"/></linearGradient>
            <linearGradient id="sol-paper" x1="65" y1="324" x2="521" y2="414" gradientUnits="userSpaceOnUse"><stop stopColor="#fdfbf3"/><stop offset="1" stopColor="#eee3cf"/></linearGradient>
            <filter id="sol-glow" x="78" y="-71" width="427" height="427" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="43"/></filter>
          </defs>
          <rect x="1" y="1" width="578" height="438" rx="24" fill="url(#sol-sky)"/>
          <g filter="url(#sol-glow)"><circle cx="292" cy="143" r="128" fill="#F7D087" fillOpacity=".63"/></g>
          <circle cx="292" cy="150" r="116" stroke="#D5B37A" strokeOpacity=".48"/>
          <circle cx="292" cy="150" r="89" stroke="#D5B37A" strokeOpacity=".45"/>
          <circle className={styles.sunDisc} cx="292" cy="150" r="71" fill="url(#sol-sun)"/>
          <path d="M60 278H522" stroke="#B78D55" strokeOpacity=".38"/>
          <path d="M89 259H494M120 240H463" stroke="#B78D55" strokeOpacity=".25"/>
          <path d="M0 310C137 273 202 286 291 297C380 308 458 274 580 302V440H0V310Z" fill="#E5C999" fillOpacity=".33"/>
          <path d="M0 334C153 305 217 316 292 322C384 330 478 315 580 329V440H0V334Z" fill="#F6E9D1" fillOpacity=".7"/>
          <path d="M59 314L289 280L521 314V403L289 437L59 403V314Z" fill="url(#sol-paper)" stroke="#A97F4F" strokeOpacity=".42" strokeWidth="2"/>
          <path d="M289 280V437M59 314L289 348L521 314" stroke="#AB875C" strokeOpacity=".5" strokeWidth="2"/>
          <path d="M85 347L260 371M85 359L260 383M318 371L493 347M318 383L493 359" stroke="#B8A083" strokeOpacity=".34"/>
          <path d="M116 274L134 226L150 273M122 259H144M406 257L439 223M408 225L439 257" stroke="#5D795E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M378 94L391 75L404 94M391 75V108" stroke="#AC8045" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="162" cy="113" r="3" fill="#C58E4A"/><circle cx="445" cy="145" r="3" fill="#C58E4A"/><circle cx="452" cy="73" r="2" fill="#C58E4A"/>
          <path d="M171 113H212M445 145H482" stroke="#B9925D" strokeOpacity=".5" strokeDasharray="4 5"/>
          <text x="34" y="42" fill="#8A6C48" fontSize="10" fontWeight="700" letterSpacing="3">FLYDO / SOL</text>
          <text x="438" y="42" fill="#8A6C48" fontSize="10" fontWeight="700" letterSpacing="2">01—04</text>
        </svg>
        <span className={styles.artLabelBottom}>TỪ TÒ MÒ ĐẾN HIỂU BIẾT <span>↗</span></span>
      </div>
    </header>
  );
}
