import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, BookOpen, Orbit } from 'lucide-react';
import styles from './luna-home.module.css';

type LunaHeroProps = { name?: string | null; greeting: string };

export function LunaHero({ name, greeting }: LunaHeroProps) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.kicker}><span className={styles.kickerLine} /> LUNA / KHÔNG GIAN HỌC TẬP</p>
        <h1>{greeting}, <span>{name || 'Bạn'}!</span></h1>
        <p className={styles.description}>Sẵn sàng cho buổi học hôm nay chưa?</p>
        <div className={styles.actions}>
          <a href="#continue-learning" className={styles.primaryAction}>Tiếp tục học <ArrowDownRight aria-hidden="true" size={17} /></a>
          <Link href="/theory" className={styles.secondaryAction}><BookOpen aria-hidden="true" size={17} /> Khám phá lý thuyết <ArrowUpRight aria-hidden="true" size={15} /></Link>
        </div>
        <p className={styles.footnote}><Orbit aria-hidden="true" size={15} /> Từng bước nhỏ mở thêm một góc nhìn mới.</p>
      </div>
      <div className={styles.art} aria-hidden="true">
        <span className={styles.artLabelTop}>ĐÀI QUAN SÁT / 01</span>
        <svg className={styles.artwork} viewBox="0 0 580 420" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="luna-sky" x1="30" y1="0" x2="550" y2="420" gradientUnits="userSpaceOnUse"><stop stopColor="#1D3150"/><stop offset=".56" stopColor="#16243C"/><stop offset="1" stopColor="#101D33"/></linearGradient>
            <radialGradient id="luna-halo" cx="0" cy="0" r="1" gradientTransform="translate(320 151) rotate(90) scale(184)" gradientUnits="userSpaceOnUse"><stop stopColor="#C7D7F2" stopOpacity=".32"/><stop offset=".52" stopColor="#82B9E8" stopOpacity=".11"/><stop offset="1" stopColor="#82B9E8" stopOpacity="0"/></radialGradient>
            <linearGradient id="luna-moon" x1="249" y1="72" x2="397" y2="271" gradientUnits="userSpaceOnUse"><stop stopColor="#F0F3EA"/><stop offset=".43" stopColor="#D8E2EF"/><stop offset="1" stopColor="#9CB9D9"/></linearGradient>
            <linearGradient id="luna-land" x1="0" y1="280" x2="580" y2="420" gradientUnits="userSpaceOnUse"><stop stopColor="#223D5E"/><stop offset="1" stopColor="#152943"/></linearGradient>
          </defs>
          <rect x="1" y="1" width="578" height="418" rx="20" fill="url(#luna-sky)"/>
          <circle cx="320" cy="151" r="184" fill="url(#luna-halo)"/>
          <g className={styles.orbits} stroke="#A9C5E6" strokeOpacity=".25" strokeWidth="1">
            <circle cx="320" cy="151" r="125"/><circle cx="320" cy="151" r="156"/>
            <path d="M54 251C136 196 194 219 237 233M404 231C467 219 515 186 559 153" strokeDasharray="4 7"/>
            <path d="M123 75V210M82 170H189" strokeOpacity=".55"/>
          </g>
          <circle className={styles.moonDisc} cx="320" cy="151" r="82" fill="url(#luna-moon)" stroke="#E8EEF4" strokeOpacity=".7" strokeWidth="1.5"/>
          <g fill="#698CAF" fillOpacity=".12">
            <ellipse cx="289" cy="117" rx="16" ry="8" transform="rotate(-26 289 117)"/>
            <circle cx="353" cy="125" r="10"/><ellipse cx="345" cy="188" rx="22" ry="11" transform="rotate(22 345 188)"/>
            <circle cx="277" cy="173" r="6"/>
          </g>
          <g fill="#DCE8F4" fillOpacity=".72"><circle cx="92" cy="79" r="2"/><circle cx="176" cy="44" r="1.4"/><circle cx="474" cy="67" r="1.8"/><circle cx="522" cy="219" r="1.4"/><circle cx="444" cy="281" r="1.5"/></g>
          <path d="M61 302C153 284 216 294 286 307C389 326 480 283 580 297V420H0V314L61 302Z" fill="url(#luna-land)"/>
          <path d="M0 344C108 328 185 342 284 357C401 374 496 337 580 347" stroke="#91B5D7" strokeOpacity=".27" strokeWidth="1.4"/>
          <path d="M83 350H488M110 369H458M143 388H421" stroke="#91B5D7" strokeOpacity=".13"/>
          <g stroke="#B6CDE6" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
            <path d="M112 304L167 225L222 304H112Z" strokeOpacity=".67"/>
            <path d="M167 225V304M154 304V291H167" strokeOpacity=".32"/>
            <path d="M407 300C432 284 438 258 452 250C466 241 477 257 493 249" strokeOpacity=".53"/>
          </g>
          <circle cx="167" cy="225" r="3" fill="#E9C778"/>
          <path d="M81 169C103 178 111 154 123 133C132 116 147 122 162 142" stroke="#82B9E8" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="123" cy="133" r="3" fill="#E9C778"/>
          <text x="30" y="39" fill="#C7D7F2" fillOpacity=".68" fontSize="10" fontWeight="700" letterSpacing="2">FLYDO / LUNA</text>
        </svg>
        <span className={styles.artLabelBottom}>HỌC DƯỚI ÁNH TRĂNG <span>↗</span></span>
      </div>
    </header>
  );
}
