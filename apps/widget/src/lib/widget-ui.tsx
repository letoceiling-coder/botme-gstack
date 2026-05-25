const DENTAL_QUICK_ACTIONS = [
  'Цены',
  'Консультация',
  'Имплантация',
  'Виниры',
  'Запись',
  'Связаться с врачом',
];

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.4 20.6 21 12 3.4 3.4l2.8 7.2L17 11l-10.8.4 2.8 7.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SparkleAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'A';
  return (
    <div className="widget-avatar-ring" aria-hidden="true">
      <div className="widget-avatar-gradient">{initial}</div>
      <span className="widget-avatar-spark">✦</span>
    </div>
  );
}

export { DENTAL_QUICK_ACTIONS, SendIcon, SparkleAvatar };
