import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// The link-preview image for every page. Without it, link previews pick an
// arbitrary image off the page (one of the rankings table's flags).
export const alt = 'Soccer Predictor: world football ELO rankings and tournament projections';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// app/icon.svg, inlined so the image doesn't depend on a fetch at build time.
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><clipPath id="ball"><circle cx="32" cy="32" r="22"/></clipPath></defs>
  <rect width="64" height="64" rx="14" fill="#4f46e5"/>
  <circle cx="32" cy="32" r="22" fill="#f8fafc"/>
  <g clip-path="url(#ball)" fill="#0f172a" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <polygon points="32.00,23.80 39.80,29.47 36.82,38.63 27.18,38.63 24.20,29.47"/>
    <line x1="32.00" y1="23.80" x2="32.00" y2="10.00"/>
    <line x1="39.80" y1="29.47" x2="52.92" y2="25.20"/>
    <line x1="36.82" y1="38.63" x2="44.93" y2="49.80"/>
    <line x1="27.18" y1="38.63" x2="19.07" y2="49.80"/>
    <line x1="24.20" y1="29.47" x2="11.08" y2="25.20"/>
    <polygon points="40.17,20.75 37.41,12.26 44.64,7.01 51.87,12.26 49.10,20.75"/>
    <polygon points="45.22,36.30 52.45,31.04 59.68,36.30 56.91,44.79 47.98,44.79"/>
    <polygon points="32.00,45.90 39.23,51.15 36.47,59.65 27.53,59.65 24.77,51.15"/>
    <polygon points="18.78,36.30 16.02,44.79 7.09,44.79 4.32,36.30 11.55,31.04"/>
    <polygon points="23.83,20.75 14.90,20.75 12.13,12.26 19.36,7.01 26.59,12.26"/>
  </g>
</svg>`;

export default async function Image() {
  const [medium, black] = await Promise.all([
    readFile(join(process.cwd(), 'app/fonts/Geist-Medium.ttf')),
    readFile(join(process.cwd(), 'app/fonts/Geist-Black.ttf')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          backgroundColor: '#020617',
          backgroundImage:
            'radial-gradient(circle at 85% 10%, rgba(79, 70, 229, 0.35), transparent 50%), radial-gradient(circle at 10% 100%, rgba(16, 185, 129, 0.22), transparent 45%)',
          fontFamily: 'Geist',
          color: '#f1f5f9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not the browser */}
          <img
            src={`data:image/svg+xml,${encodeURIComponent(ICON_SVG)}`}
            width={112}
            height={112}
            alt=""
          />
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, letterSpacing: 4 }}>
            <span style={{ color: '#64748b' }}>SOCCER&nbsp;</span>
            <span
              style={{
                backgroundImage: 'linear-gradient(90deg, #818cf8, #34d399)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              PREDICTOR
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 60, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1 }}>
            World football ELO rankings & tournament projections
          </div>
          <div style={{ fontSize: 30, fontWeight: 500, color: '#94a3b8' }}>
            Monte Carlo odds of who advances, qualifies and lifts the trophy
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 26,
            fontWeight: 500,
            color: '#64748b',
          }}
        >
          <span>heshammourad.com/soccer-predictions</span>
          <div style={{ display: 'flex', gap: 12 }}>
            {['10,000 simulations', 'Updated daily'].map((label) => (
              <span
                key={label}
                style={{
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  backgroundColor: 'rgba(79, 70, 229, 0.12)',
                  color: '#a5b4fc',
                  fontSize: 22,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: medium, weight: 500, style: 'normal' },
        { name: 'Geist', data: black, weight: 900, style: 'normal' },
      ],
    },
  );
}
