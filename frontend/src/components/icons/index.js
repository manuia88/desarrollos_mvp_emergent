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
export const Leaf = icon(
  <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></>
);
export const Route = icon(
  <><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></>
);
export const Shield = icon(
  <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></>
);
export const Store = icon(
  <><path d="M4 9h16" /><path d="M4 21V9" /><path d="M20 21V9" /><path d="m3.5 9 1.5-5h14l1.5 5" /><path d="M10 21v-7h4v7" /></>
);
export const Share = icon(
  <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" /></>
);
export const Bookmark = icon(
  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
);
export const Sparkle = icon(
  <><path d="M9.94 14.06 3 21l6.94-6.94a1 1 0 0 0 0-1.41L3 5.77l6.94 6.94a1 1 0 0 0 1.41 0Z" transform="translate(2 -1)" /><path d="M18 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" /></>
);
export const BarChart = icon(
  <><line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" /></>
);
export const Radio = icon(
  <><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" /></>
);
export const Calendar = icon(
  <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>
);
export const FileText = icon(
  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></>
);
export const Upload = icon(
  <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>
);
export const Download = icon(
  <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>
);
export const Trash = icon(
  <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>
);
export const RotateCcw = icon(
  <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>
);
export const AlertTriangle = icon(
  <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>
);
export const Check = icon(
  <polyline points="20 6 9 17 4 12" />
);
export const Camera = icon(
  <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>
);
export const Map = icon(
  <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>
);
export const Cloud = icon(
  <path d="M17.5 19a4.5 4.5 0 1 0-1.65-8.69A6 6 0 0 0 4 12a4 4 0 0 0 4 4h9.5z" />
);
export const RefreshCw = icon(
  <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>
);
export const Folder = icon(
  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
);
export const CheckCircle = icon(
  <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>
);
