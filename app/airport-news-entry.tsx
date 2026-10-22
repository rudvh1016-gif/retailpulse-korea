import type {Lang} from './retailpulse-data';
import styles from './departure-guide-entry.module.css';
import {airportNewsCopy} from '../lib/airport-customs-news-copy';
import {AirportNewsMark} from './airport-news-mark';

export function AirportNewsEntry({lang}:{lang:Lang}) {
 return <div className={styles.launcher}><a className={styles.tripEntry} href={`/${lang}/airport-news`} data-testid="airport-customs-news-entry"><span><strong>{airportNewsCopy[lang].entry}</strong></span><span className={styles.newsMark} aria-hidden="true"><AirportNewsMark entry paper/></span></a></div>;
}
