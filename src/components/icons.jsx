/**
 * Small inline icon set. Icons always accompany a visible text label in
 * navigation, and never carry meaning on their own.
 */
function base(props) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    ...props,
  };
}

export const IconHome = (p) => (
  <svg {...base(p)}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </svg>
);

export const IconReels = (p) => (
  <svg {...base(p)}>
    <rect x="6" y="3.5" width="12" height="17" rx="3" />
    <path d="M9 3.5v17M15 3.5v17" />
    <path d="M6 8.5h12M6 15.5h12" />
  </svg>
);

export const IconSearch = (p) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

export const IconUpload = (p) => (
  <svg {...base(p)}>
    <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" />
    <path d="M4.5 15v3A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5v-3" />
  </svg>
);

export const IconMessage = (p) => (
  <svg {...base(p)}>
    <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-.9 0-1.8-.1-2.6-.4L4.5 20l1.2-3.3C4.6 15.5 4 14.1 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5Z" />
  </svg>
);

export const IconUser = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M5 20c.7-3.4 3.5-5.2 7-5.2s6.3 1.8 7 5.2" />
  </svg>
);

export const IconUsers = (p) => (
  <svg {...base(p)}>
    <circle cx="9.5" cy="9" r="3.2" />
    <path d="M3.8 19c.6-2.9 2.9-4.4 5.7-4.4s5.1 1.5 5.7 4.4" />
    <path d="M16.5 7.6a3 3 0 0 1 0 5.8M18 18.9c-.2-1.4-.7-2.6-1.5-3.5 2.2.1 3.8 1.3 4.3 3.5" />
  </svg>
);

export const IconSettings = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="2.9" />
    <path d="M19.4 14.2a1.6 1.6 0 0 0 .3 1.8l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.7 1.7 0 1 1-3.4 0v-.2a1.6 1.6 0 0 0-2.7-1.1l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.7 1.7 0 1 1 0-3.4h.2A1.6 1.6 0 0 0 6 6.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1A1.6 1.6 0 0 0 11.1 3.4v-.2a1.7 1.7 0 1 1 3.4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.6 1.6 0 0 0-1.3 1.1Z" />
  </svg>
);

export const IconHeart = ({ filled, ...p }) => (
  <svg {...base(p)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 19.5c-.4 0-.8-.1-1.1-.4C7.3 16 4.5 13.6 4.5 10.6c0-2.2 1.7-4 3.9-4 1.4 0 2.7.7 3.6 1.9.9-1.2 2.2-1.9 3.6-1.9 2.2 0 3.9 1.8 3.9 4 0 3-2.8 5.4-6.4 8.5-.3.3-.7.4-1.1.4Z" />
  </svg>
);

export const IconComment = (p) => (
  <svg {...base(p)}>
    <path d="M20 11.5c0 4-3.6 7.2-8 7.2-.8 0-1.6-.1-2.3-.3L5 20l1-3.1C4.7 15.6 4 13.6 4 11.5 4 7.6 7.6 4.4 12 4.4s8 3.2 8 7.1Z" />
  </svg>
);

export const IconTrash = (p) => (
  <svg {...base(p)}>
    <path d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
    <path d="M6.5 7l.8 11.1A1.9 1.9 0 0 0 9.2 20h5.6a1.9 1.9 0 0 0 1.9-1.9L17.5 7" />
    <path d="M10.5 11v5M13.5 11v5" />
  </svg>
);

export const IconLogout = (p) => (
  <svg {...base(p)}>
    <path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7" />
    <path d="M16 8.5 19.5 12 16 15.5M19.5 12H10" />
  </svg>
);

export const IconCamera = (p) => (
  <svg {...base(p)}>
    <path d="M4.5 8.5h2.2l1.1-1.8h8.4l1.1 1.8h2.2a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.5" r="3.2" />
  </svg>
);

export const IconClose = (p) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconArrowLeft = (p) => (
  <svg {...base(p)}>
    <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
  </svg>
);

export const IconSend = (p) => (
  <svg {...base(p)}>
    <path d="M4.5 12 20 4.5 15.5 20l-4-6z" />
    <path d="m11.5 14 8.5-9.5" />
  </svg>
);

export const IconShield = (p) => (
  <svg {...base(p)}>
    <path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
    <path d="m9.3 12.2 1.9 1.9 3.6-3.8" />
  </svg>
);

export const IconDocument = (p) => (
  <svg {...base(p)}>
    <path d="M6 4.5h7.5L18 9v10.5H6z" />
    <path d="M13.5 4.5V9H18M9 13h6M9 16.5h4" />
  </svg>
);

export const IconPlay = (p) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const IconPause = (p) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

export const IconVolumeHigh = (p) => (
  <svg {...base(p)}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

export const IconVolumeLow = (p) => (
  <svg {...base(p)}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

export const IconVolumeMute = (p) => (
  <svg {...base(p)}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

export const IconFullscreen = (p) => (
  <svg {...base(p)}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const IconExitFullscreen = (p) => (
  <svg {...base(p)}>
    <path d="M4 14h6m0 0v6m0-6L3 21" />
    <path d="M20 10h-6m0 0V4m0 6 7-7" />
    <path d="M14 14h6m-6 0v6m0-6 7 7" />
    <path d="M10 10H4m6 0V4m0 6L3 3" />
  </svg>
);

export const IconBack5 = (p) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <text x="12" y="15" fontSize="7" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none">5</text>
  </svg>
);

export const IconForward5 = (p) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <text x="12" y="15" fontSize="7" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none">5</text>
  </svg>
);

export const IconShare = (p) => (
  <svg {...base(p)}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

export const IconPip = (p) => (
  <svg {...base(p)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <rect x="12" y="11" width="8" height="7" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

export const IconAlert = (p) => (
  <svg {...base(p)}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4.2M12 17h.01" />
  </svg>
);

export const IconCheck = (p) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconMore = (p) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const IconEdit = (p) => (
  <svg {...base(p)}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export const IconEye = (p) => (
  <svg {...base(p)}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconChart = (p) => (
  <svg {...base(p)}>
    <path d="M18 20V10" />
    <path d="M12 20V4" />
    <path d="M6 20v-6" />
  </svg>
);

export const IconPin = (p) => (
  <svg {...base(p)}>
    <path d="M12 3l2 5h5l-4 3 1.5 5L12 13l-4.5 3L9 11 5 8h5z" />
  </svg>
);

export const IconReply = (p) => (
  <svg {...base(p)}>
    <path d="M9 10L4 15l5 5" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
  </svg>
);

export const IconTag = (p) => (
  <svg {...base(p)}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <circle cx="7" cy="7" r="1.5" fill="currentColor" />
  </svg>
);

export const IconFire = (p) => (
  <svg {...base(p)}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

export const IconCaption = (p) => (
  <svg {...base(p)}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 10h4M6 14h8" />
  </svg>
);

export const IconClock = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
