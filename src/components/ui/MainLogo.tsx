/**
 * MainLogo — inlined SVG that uses currentColor for every stroke/fill.
 * Wrap with a color or set `color` prop to tint it dynamically.
 *
 * Usage:
 *   <MainLogo size={28} style={{ color: 'var(--accent)' }} />
 */

import { cn } from '@/lib/utils';

interface MainLogoProps {
  /** Pixel size (width = height). Default 28. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean;
}

// Static clip-path IDs — the component renders at most once at a time,
// so fixed IDs don't clash.
const P = 'rdl'; // short prefix

export function MainLogo({ size = 28, className, style, 'aria-hidden': ariaHidden }: MainLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 375 375"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      style={style}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : 'RAGdoll logo'}
    >
      <defs>
        <clipPath id={`${P}-a`}>
          <path d="M 146 98 L 181 98 L 181 133 L 146 133 Z" clipRule="nonzero" />
        </clipPath>
        <clipPath id={`${P}-b`}>
          <path d="M 141.808594 105.839844 L 173.324219 93.328125 L 185.839844 124.84375 L 154.320312 137.359375 Z" clipRule="nonzero" />
        </clipPath>
        <clipPath id={`${P}-c`}>
          <path d="M 157.566406 99.585938 C 148.863281 103.039062 144.609375 112.898438 148.066406 121.601562 C 151.519531 130.304688 161.378906 134.558594 170.082031 131.101562 C 178.785156 127.648438 183.039062 117.789062 179.582031 109.085938 C 176.128906 100.382812 166.269531 96.128906 157.566406 99.585938 Z" clipRule="nonzero" />
        </clipPath>
        <clipPath id={`${P}-d`}>
          <path d="M 0 0 L 35 0 L 35 35 L 0 35 Z" clipRule="nonzero" />
        </clipPath>
        <clipPath id={`${P}-e`}>
          <path d="M -4.191406 7.839844 L 27.324219 -4.671875 L 39.839844 26.84375 L 8.320312 39.359375 Z" clipRule="nonzero" />
        </clipPath>
        <clipPath id={`${P}-f`}>
          <path d="M 11.566406 1.585938 C 2.863281 5.039062 -1.390625 14.898438 2.066406 23.601562 C 5.519531 32.304688 15.378906 36.558594 24.082031 33.101562 C 32.785156 29.648438 37.039062 19.789062 33.582031 11.085938 C 30.128906 2.382812 20.269531 -1.871094 11.566406 1.585938 Z" clipRule="nonzero" />
        </clipPath>
        <clipPath id={`${P}-g`}>
          <rect x="0" y="0" width="35" height="35" />
        </clipPath>
      </defs>

      {/* Six radiating arms */}
      <path
        strokeLinecap="round"
        transform="matrix(0.729772, 0.17301, -0.17301, 0.729772, 94.51034, 127.335373)"
        fill="none"
        strokeLinejoin="miter"
        d="M 8.498811 8.498622 L 98.778021 8.501183"
        stroke="currentColor"
        strokeWidth="17"
        strokeMiterlimit="4"
      />
      <path
        strokeLinecap="round"
        transform="matrix(0.238383, 0.711107, -0.711107, 0.238383, 170.061497, 144.059302)"
        fill="none"
        strokeLinejoin="miter"
        d="M 8.498504 8.500017 L 118.137476 8.499039"
        stroke="currentColor"
        strokeWidth="17"
        strokeMiterlimit="4"
      />
      <path
        strokeLinecap="round"
        transform="matrix(-0.544367, 0.515911, -0.515911, -0.544367, 199.846223, 232.258785)"
        fill="none"
        strokeLinejoin="miter"
        d="M 8.500591 8.502915 L 98.78121 8.500428"
        stroke="currentColor"
        strokeWidth="17"
        strokeMiterlimit="4"
      />
      <path
        strokeLinecap="round"
        transform="matrix(-0.729772, -0.17301, 0.17301, -0.729772, 280.478804, 247.664602)"
        fill="none"
        strokeLinejoin="miter"
        d="M 8.499923 8.498325 L 98.779133 8.500886"
        stroke="currentColor"
        strokeWidth="17"
        strokeMiterlimit="4"
      />
      <path
        strokeLinecap="round"
        transform="matrix(-0.238383, -0.711107, 0.711107, -0.238383, 204.928659, 230.940688)"
        fill="none"
        strokeLinejoin="miter"
        d="M 8.499286 8.497642 L 118.136602 8.501603"
        stroke="currentColor"
        strokeWidth="17"
        strokeMiterlimit="4"
      />
      <path
        strokeLinecap="round"
        transform="matrix(0.544367, -0.515911, 0.515911, 0.544367, 175.142938, 142.741176)"
        fill="none"
        strokeLinejoin="miter"
        d="M 8.499704 8.502146 L 98.780324 8.499659"
        stroke="currentColor"
        strokeWidth="17"
        strokeMiterlimit="4"
      />

      {/* Centre dot (nested clip groups from original SVG) */}
      <g clipPath={`url(#${P}-a)`}>
        <g clipPath={`url(#${P}-b)`}>
          <g clipPath={`url(#${P}-c)`}>
            <g transform="matrix(1, 0, 0, 1, 146, 98)">
              <g clipPath={`url(#${P}-g)`}>
                <g clipPath={`url(#${P}-d)`}>
                  <g clipPath={`url(#${P}-e)`}>
                    <g clipPath={`url(#${P}-f)`}>
                      <path
                        fill="currentColor"
                        d="M -4.191406 7.839844 L 27.324219 -4.671875 L 39.839844 26.84375 L 8.320312 39.359375 Z"
                        fillOpacity="1"
                        fillRule="nonzero"
                      />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
