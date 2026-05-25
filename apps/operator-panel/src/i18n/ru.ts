export const opRu = {
  title: 'Панель оператора',
  online: 'На линии',
  offline: 'Не в сети',
  reconnecting: 'Переподключение…',
  connecting: 'Подключение…',
  conversations: 'Диалоги',
  search: 'Поиск посетителей…',
  noVisitors: 'Нет активных посетителей',
  selectVisitor: 'Выберите диалог слева',
  visitor: 'Посетитель',
  page: 'Страница',
  device: 'Устройство',
  duration: 'На сайте',
  reconnects: 'Переподключения',
  control: 'Управление',
  takeover: 'Перехватить чат',
  release: 'Вернуть AI',
  sendPlaceholder: 'Напишите сообщение…',
  send: 'Отправить',
  typing: 'печатает…',
  unread: 'непрочитано',
  activeCalls: 'Активные звонки',
  callVoice: 'Голосовой звонок',
  callVideo: 'Видеозвонок',
  hangUp: 'Завершить',
  incomingCall: 'Входящий звонок',
  outgoingCall: 'Исходящий звонок',
  acceptCall: 'Принять',
  declineCall: 'Отклонить',
  callActive: 'Видеозвонок активен',
  fullscreen: 'На весь экран',
  pip: 'Мини-окно',
  screenShare: 'Демонстрация экрана',
  audioOutput: 'Устройство вывода',
  networkQuality: 'Качество сети',
  rtcDiagnostics: 'Диагностика связи',
  kbSuggestions: 'Подсказки из базы знаний',
  leadInfo: 'Контактные данные',
  runtimeDiagnostics: 'Состояние runtime',
  enableVoice: 'Включить голос',
  enableVideo: 'Включить видео',
  authorAi: 'AI',
  authorOperator: 'Оператор',
  authorVisitor: 'Посетитель',
  systemTakeover: 'Оператор подключился к диалогу',
  systemRelease: 'Диалог возвращён AI-ассистенту',
  controlAi: 'AI-ассистент',
  controlOperator: 'Оператор',
  controlHybrid: 'Смешанный режим',
  controlRtc: 'Видеозвонок активен',
  statusOnline: 'В сети',
  statusIdle: 'Неактивен',
  quickReplies: ['Здравствуйте!', 'Одну минуту, уточню', 'Могу помочь с записью', 'Передаю специалисту'],
} as const;

export function controlModeLabel(mode: string): string {
  switch (mode) {
    case 'OPERATOR':
      return opRu.controlOperator;
    case 'HYBRID':
      return opRu.controlHybrid;
    case 'RTC_ACTIVE':
      return opRu.controlRtc;
    default:
      return opRu.controlAi;
  }
}
