import { createRoot } from 'react-dom/client';
import { SiteViewCounter } from '../../app/site-view-counter';
import { publishFixture } from 'virtual:counter-snapshot';
import '../../app/globals.css';
import type { Lang } from '../../app/retailpulse-data';
const root = document.getElementById('counter-fixture')!;
(window as unknown as { setCounterFixture: typeof publishFixture }).setCounterFixture = publishFixture;
createRoot(root).render(<div className="site-header"><header className="topbar">
  <button className="brand brand-button"><span>KORETAIL</span><span className="brand-descriptor">Retail Demand Signals for Korea</span></button>
  <nav className="top-nav"><a href="#one">Airport</a><a href="#two">Flights</a><a href="#three">Countries</a><a href="#four">Prepare</a><a href="#more">More</a></nav>
  <div className="header-meta"><button>Install</button><span>KRW 1,400</span><label>Language<select><option>한국어</option></select></label></div>
  <SiteViewCounter lang={root.dataset.lang as Lang} />
</header></div>);
