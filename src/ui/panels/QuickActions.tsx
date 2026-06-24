import { useGcs } from '../../state/store.ts';

export interface QuickAction {
  id: string;
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}

export function QuickActions({
  logging,
  onToggleLogging,
  onGenerateMission,
  onToggleTerrain,
  terrainOn,
  onOpenPid,
}: {
  logging: boolean;
  onToggleLogging: () => void;
  onGenerateMission: () => void;
  onToggleTerrain: () => void;
  terrainOn: boolean;
  onOpenPid: () => void;
}) {
  const theme = useGcs((s) => s.settings.theme);
  const updateSettings = useGcs((s) => s.updateSettings);

  const actions: QuickAction[] = [
    { id: 'log', icon: 'ti-clipboard-list', label: 'Data logging', active: logging, onClick: onToggleLogging },
    { id: 'mission', icon: 'ti-route', label: 'Generate mission path', onClick: onGenerateMission },
    {
      id: 'theme',
      icon: theme === 'dark' ? 'ti-moon' : 'ti-sun',
      label: 'Toggle dark / light mode',
      onClick: () => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' }),
    },
    { id: 'terrain', icon: 'ti-mountain', label: 'Terrain view', active: terrainOn, onClick: onToggleTerrain },
    { id: 'pid', icon: 'ti-adjustments-horizontal', label: 'PID configuration', onClick: onOpenPid },
  ];

  return (
    <nav
      className="panel"
      aria-label="Quick actions"
      style={{
        position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '10px 7px', borderRadius: 'var(--radius-lg)',
      }}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          className={`icon-btn ${a.active ? 'active' : ''}`}
          onClick={a.onClick}
          aria-label={a.label}
          aria-pressed={a.active ?? undefined}
          title={a.label}
        >
          <i className={`ti ${a.icon}`} style={{ fontSize: 19 }} aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
}
