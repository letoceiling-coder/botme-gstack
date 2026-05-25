# Botme Operator Runtime — Self-Host

Готовый пакет для white-label кабинета оператора на вашем домене.

## Быстрый старт (3 шага)

### 1. Загрузите файлы на сервер

```bash
unzip botme-operator-runtime.zip -d /var/www/operator-runtime
cd /var/www/operator-runtime
```

### 2. Настройте `.env`

Файл `.env` уже содержит ваш runtime token и workspace ID — **ничего менять не нужно** для старта.

При необходимости отредактируйте:

- `BOTME_API_URL` — URL API Botme
- `BOTME_WS_URL` — WebSocket endpoint
- `DOMAIN` — ваш домен операторов

### 3. nginx + SSL

```bash
chmod +x install.sh
# Отредактируйте nginx.conf.example — укажите DOMAIN
sudo cp nginx.conf.example /etc/nginx/sites-available/operators.example.com.conf
sudo ln -sf /etc/nginx/sites-available/operators.example.com.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d operators.example.com
sudo nginx -t && sudo systemctl reload nginx
```

Откройте: `https://operators.example.com/operator.html`

---

## WebSocket proxy (обязательно)

```nginx
location /socket.io/ {
  proxy_pass https://agent.neeklo.ru/socket.io/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "Upgrade";
  proxy_set_header Host agent.neeklo.ru;
  proxy_read_timeout 86400;
}
```

## RTC / TURN

TURN сервер: `turn.neeklo.ru:3478` (UDP + TCP).  
Разрешите исходящие UDP/TCP к TURN из вашей сети.

## Permissions-Policy

```
Permissions-Policy: camera=*, microphone=*, autoplay=*, fullscreen=*, display-capture=*
```

## PM2 (опционально)

Статический хостинг через nginx достаточен. PM2 не требуется для runtime HTML.

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| «Не авторизован» | Token отозван — скачайте новый архив из Connection Center |
| WebSocket failed | Проверьте proxy `/socket.io/` с Upgrade headers |
| Нет видео | HTTPS + camera permissions + TURN |
| CORS ошибки | Проксируйте `/api/` через свой домен (см. nginx.conf.example) |

## Безопасность

- Не публикуйте `.env` в git
- Token привязан к workspace и доменам виджета
- При компрометации: Connection Center → «Перевыпустить подключение»
