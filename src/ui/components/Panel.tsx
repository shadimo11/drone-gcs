import type { ReactNode } from 'react';

export function Panel({
  title,
  children,
  className = '',
  style,
  pad = true,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  pad?: boolean;
}) {
  return (
    <div className={`panel ${pad ? 'panel-pad' : ''} ${className}`} style={style}>
      {title && <p className="panel-title">{title}</p>}
      {children}
    </div>
  );
}

/**
 * Status indicator that encodes state with BOTH an icon shape and a color,
 * so it remains legible for colorblind operators (SRS review §5).
 */
export function StatusDot({
  status,
  label,
}: {
  status: 'ok' | 'warn' | 'danger' | 'idle';
  label: string;
}) {
  const map = {
    ok: { color: 'var(--ok)', icon: 'ti-circle-check' },
    warn: { color: 'var(--warn)', icon: 'ti-alert-triangle' },
    danger: { color: 'var(--danger)', icon: 'ti-alert-octagon' },
    idle: { color: 'var(--text-tertiary)', icon: 'ti-circle' },
  } as const;
  const m = map[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
      <i className={`ti ${m.icon}`} style={{ fontSize: 14, color: m.color }} aria-hidden="true" />
      {label}
    </span>
  );
}
