import './shopping-entry.css';

const label = '외국인은 뭘 살까?';
const href = '/shopping-report/';

export function ShoppingDesktopEntry() {
  return <a className="shopping-desktop-entry" href={href}>{label}</a>;
}

export function ShoppingMobileEntry() {
  return <a className="shopping-mobile-entry" href={href} aria-label={`${label} 쇼핑 보고서 읽기`}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v15H5zM8 5V3h8v2M8 10h8M8 14h5" /></svg>
    <span>{label}</span><span className="shopping-entry-arrow" aria-hidden="true">↗</span>
  </a>;
}
