require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const QRCode = require('qrcode');
const bot = require('./bot');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(
  cookieSession({
    name: 'admin_session',
    secret: process.env.SESSION_SECRET || 'dev-secret',
    maxAge: 12 * 60 * 60 * 1000, // 12 часов
  })
);

// ---------------------------------------------------------------------------
// Telegram: запускаем бота через long polling (проще всего для старта;
// для продакшена можно переключить на webhook — см. README).
// ---------------------------------------------------------------------------
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ---------------------------------------------------------------------------
// Проверка подписи Telegram WebApp initData — подтверждает, что запрос
// в мини-приложение реально пришёл из Telegram от конкретного пользователя.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// ---------------------------------------------------------------------------
function verifyInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date')) * 1000;
  if (Date.now() - authDate > 24 * 60 * 60 * 1000) return null; // старше суток

  return JSON.parse(params.get('user'));
}

function requireTelegramUser(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const user = initData && verifyInitData(initData);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.telegramUser = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ---------------------------------------------------------------------------
// API для гостя (мини-приложение)
// ---------------------------------------------------------------------------

app.get('/api/me', requireTelegramUser, async (req, res) => {
  const guest = await db.getGuest(req.telegramUser.id);
  res.json({ guest });
});

app.get('/api/my-visits', requireTelegramUser, async (req, res) => {
  const guest = await db.getGuest(req.telegramUser.id);
  if (!guest) return res.json({ visits: [] });
  const visits = await db.getVisitsByGuest(req.telegramUser.id);
  res.json({ visits });
});

// ---------------------------------------------------------------------------
// API для админки (защищено паролем, не Telegram-аккаунтом)
// ---------------------------------------------------------------------------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'wrong_password' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/admin/visits', requireAdmin, async (req, res) => {
  const visits = await db.getAllVisits();
  res.json({ visits });
});

app.get('/api/admin/codes', requireAdmin, async (req, res) => {
  const codes = await db.listActiveCodes();
  res.json({ codes });
});

// Сгенерировать новый код для QR (например, на смену/день) + сразу вернуть
// картинку QR (PNG), которую можно вывести на планшет официанта или распечатать.
app.post('/api/admin/codes/new', requireAdmin, async (req, res) => {
  const { label, expiresInHours } = req.body || {};
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expires_at = expiresInHours
    ? new Date(Date.now() + Number(expiresInHours) * 3600 * 1000).toISOString()
    : null;

  await db.createActiveCode({ code, label, expires_at });

  const deepLink = `https://t.me/${process.env.BOT_USERNAME}?start=checkin_${code}`;
  const qrDataUrl = await QRCode.toDataURL(deepLink, { width: 500 });

  res.json({ code, deepLink, qrDataUrl, expires_at });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
