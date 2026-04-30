// SVG icon components — all accept { size=N, color='currentColor', className='' }
// ViewBox 24×24 for all. Zero external library dependency.
import React from 'react';

const icon = (path, viewBox = '0 0 24 24') =>
  function Icon({ size = 16, color = 'currentColor', className = '', style = {} }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

export const MapPin = icon(
  <><path d="M20 10c0 6-8 13-8 13S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>
);
export const Play = icon(
  <polygon points="5 3 19 12 5 21 5 3" />
);
export const Search = icon(
  <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>
);
export const Home = icon(
  <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>
);
export const ArrowRight = icon(
  <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>
);
export const ArrowLeft = icon(
  <><path d="m19 12-14 0" /><path d="m12 19-7-7 7-7" /></>
);
export const TrendUp = icon(
  <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>
);
export const Database = icon(
  <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" /></>
);
export const Clock = icon(
  <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>
);
export const Lock = icon(
  <><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>
);
export const Heart = ({ size = 16, color = 'currentColor', filled = false, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#f472b6' : 'none'} stroke={filled ? '#f472b6' : color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);
export const MessageSquare = icon(
  <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>
);
export const ChevronDown = icon(
  <polyline points="6 9 12 15 18 9" />
);
export const ChevronLeft = icon(
  <polyline points="15 18 9 12 15 6" />
);
export const ChevronRight = icon(
  <polyline points="9 18 15 12 9 6" />
);
export const Menu = icon(
  <><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></>
);
export const X = icon(
  <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>
);
export const Bed = icon(
  <><path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v9" /></>
);
export const Bath = icon(
  <><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><line x1="10" x2="8" y1="5" y2="7" /><line x1="2" x2="22" y1="12" y2="12" /><line x1="7" x2="7" y1="19" y2="21" /><line x1="17" x2="17" y1="19" y2="21" /></>
);
export const Car = icon(
  <><path d="M19 17H5" /><path d="M3 17V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8" /><path d="m7 9 1.5-4.5" /><path d="m17 9-1.5-4.5" /><circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" /></>
);
export const Ruler = icon(
  <><path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z" /><path d="m7.5 10.5 2 2" /><path d="m10.5 7.5 2 2" /><path d="m13.5 4.5 2 2" /><path d="m4.5 13.5 2 2" /></>
);
export const Zap = icon(
  <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></>
);
export const Globe = icon(
  <><circle cx="12" cy="12" r="10" /><line x1="2" x2="22" y1="12" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>
);
export const LogOut = icon(
  <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></>
);
