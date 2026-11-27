/**
 * Inline SVG icon set (no icon-library dependency).
 * Every icon inherits `currentColor` and sizes from the `size` prop.
 */
const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

const Svg = ({ size = 18, children, ...rest }) => (
  <svg {...base(size)} {...rest}>
    {children}
  </svg>
);

export const IconDroplet = ({ size }) => (
  <Svg size={size}><path d="M12 2.7s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z" /></Svg>
);

export const IconBox = ({ size }) => (
  <Svg size={size}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></Svg>
);

export const IconContainer = ({ size }) => (
  <Svg size={size}><path d="M6 8h12l-1.2 11.2A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.8L6 8Z" /><path d="M9 8V5.5A2.5 2.5 0 0 1 11.5 3h1A2.5 2.5 0 0 1 15 5.5V8" /></Svg>
);

export const IconTank = ({ size }) => (
  <Svg size={size}><rect x="4" y="7" width="16" height="14" rx="3" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></Svg>
);

export const IconPouch = ({ size }) => (
  <Svg size={size}><path d="M7 4h10l-1.2 15.2A2 2 0 0 1 13.8 21h-3.6a2 2 0 0 1-2-1.8L7 4Z" /><path d="M8 9h8" /></Svg>
);

export const IconTruck = ({ size }) => (
  <Svg size={size}><path d="M2 6h11v10H2zM13 9h4l3 3.5V16h-7z" /><circle cx="6.5" cy="18" r="1.8" /><circle cx="16.5" cy="18" r="1.8" /></Svg>
);

export const IconHome = ({ size }) => (
  <Svg size={size}><path d="m3 10.5 9-7 9 7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /></Svg>
);

export const IconCart = ({ size }) => (
  <Svg size={size}><path d="M3 4h2.2l2.3 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6.5" /><circle cx="10" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /></Svg>
);

export const IconClipboard = ({ size }) => (
  <Svg size={size}><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9Z" /><path d="M8.5 11h7M8.5 15h4" /></Svg>
);

export const IconUsers = ({ size }) => (
  <Svg size={size}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4M17.5 14.4A6.5 6.5 0 0 1 21.5 20" /></Svg>
);

export const IconReport = ({ size }) => (
  <Svg size={size}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Svg>
);

export const IconSearch = ({ size }) => (
  <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);

export const IconBell = ({ size }) => (
  <Svg size={size}><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" /><path d="M13.7 20a2 2 0 0 1-3.4 0" /></Svg>
);

export const IconPlus = ({ size }) => (
  <Svg size={size}><path d="M12 5v14M5 12h14" /></Svg>
);

export const IconEdit = ({ size }) => (
  <Svg size={size}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></Svg>
);

export const IconWarning = ({ size }) => (
  <Svg size={size}><path d="M12 3.5 1.8 20.5h20.4L12 3.5Z" /><path d="M12 9.5v5M12 17.5h.01" /></Svg>
);

export const IconDownload = ({ size }) => (
  <Svg size={size}><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" /><path d="M4 18v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></Svg>
);

export const IconCheck = ({ size }) => (
  <Svg size={size}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16 9.5" /></Svg>
);

export const IconMenu = ({ size }) => (
  <Svg size={size}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
);

export const IconClose = ({ size }) => (
  <Svg size={size}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);

export const IconChevronLeft = ({ size }) => (
  <Svg size={size}><path d="m14 6-6 6 6 6" /></Svg>
);

export const IconTrash = ({ size }) => (
  <Svg size={size}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></Svg>
);

export const IconRefresh = ({ size }) => (
  <Svg size={size}><path d="M20 11a8 8 0 1 0-2.2 5.6" /><path d="M20 5v6h-6" /></Svg>
);

export const IconFilter = ({ size }) => (
  <Svg size={size}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></Svg>
);

export const IconArrowUp = ({ size }) => (
  <Svg size={size}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
);

export const IconArrowDown = ({ size }) => (
  <Svg size={size}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>
);

export const IconLogout = ({ size }) => (
  <Svg size={size}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16 6 12l4-4M6 12h10" /></Svg>
);

export const IconPrinter = ({ size }) => (
  <Svg size={size}><path d="M7 9V4h10v5" /><rect x="3" y="9" width="18" height="7" rx="2" /><path d="M7 14h10v7H7z" /></Svg>
);

export const IconArchive = ({ size }) => (
  <Svg size={size}><rect x="3" y="4" width="18" height="4.5" rx="1.2" /><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" /><path d="M10 12.5h4" /></Svg>
);

export const IconUndo = ({ size }) => (
  <Svg size={size}><path d="M4 9h11a5 5 0 0 1 0 10h-6" /><path d="M8 5 4 9l4 4" /></Svg>
);

/** Maps a product's `icon` field to a component. */
export const PRODUCT_ICONS = {
  droplet: IconDroplet,
  box: IconBox,
  container: IconContainer,
  tank: IconTank,
  pouch: IconPouch,
  truck: IconTruck,
};
