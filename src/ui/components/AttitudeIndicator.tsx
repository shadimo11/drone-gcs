/**
 * Artificial horizon + heading indicator (SRS D.3 right-panel top box).
 *
 * Pure SVG driven by roll (phi), pitch (theta) and heading (psi) in degrees.
 * The horizon disk rotates by -roll and translates by pitch; a fixed aircraft
 * reference stays centered. A heading tape sits above the box.
 */
export function AttitudeIndicator({
  roll,
  pitch,
  heading,
  size = 150,
}: {
  roll: number;
  pitch: number;
  heading: number;
  size?: number;
}) {
  const pxPerDeg = 1.8;
  const hdg = ((heading % 360) + 360) % 360;

  return (
    <div>
      <HeadingTape heading={hdg} width={size} />
      <svg
        width={size}
        height={size * 0.78}
        viewBox="0 0 150 117"
        role="img"
        aria-label={`Attitude: roll ${roll.toFixed(0)} degrees, pitch ${pitch.toFixed(0)} degrees`}
        style={{ display: 'block', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
      >
        <defs>
          <clipPath id="ai-clip">
            <rect x="0" y="0" width="150" height="117" rx="8" />
          </clipPath>
        </defs>
        <g clipPath="url(#ai-clip)">
          <g transform={`rotate(${-roll} 75 58)`}>
            <g transform={`translate(0 ${pitch * pxPerDeg})`}>
              {/* sky */}
              <rect x="-80" y="-160" width="310" height="218" fill="#2f7bd6" />
              {/* ground */}
              <rect x="-80" y="58" width="310" height="218" fill="#9a6a31" />
              {/* horizon line */}
              <line x1="-80" y1="58" x2="230" y2="58" stroke="#ffffff" strokeWidth="1.2" />
              {/* pitch ladder */}
              {[-20, -10, 10, 20].map((p) => {
                const y = 58 - p * pxPerDeg;
                const w = Math.abs(p) === 10 ? 16 : 26;
                return (
                  <g key={p} stroke="#ffffff" strokeWidth="1">
                    <line x1={75 - w} y1={y} x2={75 + w} y2={y} />
                  </g>
                );
              })}
            </g>
          </g>
          {/* fixed aircraft reference */}
          <g stroke="#ffd24a" strokeWidth="2.4" fill="none">
            <line x1="48" y1="58" x2="66" y2="58" />
            <line x1="84" y1="58" x2="102" y2="58" />
            <circle cx="75" cy="58" r="2.2" fill="#ffd24a" stroke="none" />
          </g>
          {/* roll pointer */}
          <polygon points="75,8 71,16 79,16" fill="#ffffff" />
          <rect x="0" y="0" width="150" height="117" rx="8" fill="none" stroke="var(--panel-border)" />
        </g>
      </svg>
    </div>
  );
}

function HeadingTape({ heading, width }: { heading: number; width: number }) {
  const cardinals = ['N', 'E', 'S', 'W'];
  const nearest = Math.round(heading / 45) * 45;
  const ticks = [-45, 0, 45].map((d) => nearest + d);
  return (
    <div
      style={{
        position: 'relative',
        height: 18,
        width,
        marginBottom: 4,
        overflow: 'hidden',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--inset-bg)',
      }}
    >
      {ticks.map((t) => {
        const norm = ((t % 360) + 360) % 360;
        const offset = ((t - heading) * (width / 90)) + width / 2;
        const label = norm % 90 === 0 ? cardinals[(norm / 90) % 4] : `${norm}`;
        return (
          <span
            key={t}
            style={{
              position: 'absolute',
              left: offset,
              top: 2,
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: 'var(--text-secondary)',
            }}
          >
            {label}
          </span>
        );
      })}
      <div
        style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: 1, background: 'var(--accent)', transform: 'translateX(-50%)',
        }}
      />
    </div>
  );
}
