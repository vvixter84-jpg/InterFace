import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...rest }: IconProps) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconOverview = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />
  </Base>
);

export const IconProcesses = (props: IconProps) => (
  <Base {...props}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.2" />
    <circle cx="4.5" cy="12" r="1.2" />
    <circle cx="4.5" cy="18" r="1.2" />
  </Base>
);

export const IconStorage = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="4" width="18" height="7" rx="1.6" />
    <rect x="3" y="13" width="18" height="7" rx="1.6" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </Base>
);

export const IconNetwork = (props: IconProps) => (
  <Base {...props}>
    <path d="M4.5 12.5a10.5 10.5 0 0 1 15 0" />
    <path d="M8 15.6a6 6 0 0 1 8 0" />
    <path d="M12 19h.01" />
  </Base>
);

export const IconSettings = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 7h8M16 7h4M4 12h3M11 12h9M4 17h11M19 17h1" />
    <circle cx="14" cy="7" r="1.8" />
    <circle cx="9" cy="12" r="1.8" />
    <circle cx="17" cy="17" r="1.8" />
  </Base>
);

export const IconWidgets = (props: IconProps) => (
  <Base {...props}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Base>
);

export const IconMinimize = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 12h14" />
  </Base>
);

export const IconMaximize = (props: IconProps) => (
  <Base {...props}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </Base>
);

export const IconClose = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const IconArrowDown = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Base>
);

export const IconArrowUp = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Base>
);

export const IconBattery = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="8" width="15" height="8" rx="2" />
    <path d="M21 11v2" />
  </Base>
);
