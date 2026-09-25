const { Telegraf, Markup } = require('telegraf');
const db = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Временное хранилище: telegram_id -> код чек-ина, который ждём подтвердить
// контактом (если гость пишет боту впервые). Живёт, пока процесс жив —
// этого достаточно, т.к. шаг "поделиться контактом" происходит сразу.
const pendingCheckin = new Map();

function miniAppUrl(path = '') {
  return `${process.env.PUBLIC_URL}${path}`;
}

async function processCheckin(ctx, telegramId, code) {
  const valid = await db.isCodeValid(code);
  if (!valid) {
    await ctx.reply(
      '⚠️ Этот QR уже не действует. Попросите официанта показать актуальный код.'
    );
    return;
  }
  await db.addVisit({ telegram_id: telegramId, checkin_code: code });
  const visits = await db.getVisitsByGuest(telegramId);
  await ctx.reply(
    `✅ Визит зафиксирован!\nВсего визитов: ${visits.length}\n\n` +
      `Посмотреть историю — /history`
  );
}

bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const payload = ctx.startPayload; // например "checkin_A1B2C3"
  const existingGuest = await db.getGuest(telegramId);

  if (payload && payload.startsWith('checkin_')) {
    const code = payload.replace('checkin_', '');

    if (existingGuest) {
      await processCheckin(ctx, telegramId, code);
      return;
    }

    // Гость новый — сначала просим номер телефона, код чек-ина запоминаем
    pendingCheckin.set(telegramId, code);
    await ctx.reply(
      `Добро пожаловать! Это бот программы посещений бара.\n\n` +
        `Чтобы зафиксировать визит, поделитесь, пожалуйста, номером телефона — ` +
        `он нужен, чтобы находить вас в списке гостей.`,
      Markup.keyboard([
        Markup.button.contactRequest('📱 Поделиться номером телефона'),
      ])
        .oneTime()
        .resize()
    );
    return;
  }

  if (!existingGuest) {
    pendingCheckin.delete(telegramId);
    await ctx.reply(
      `Добро пожаловать! Это бот программы посещений бара.\n\n` +
        `Чтобы начать, поделитесь, пожалуйста, номером телефона.`,
      Markup.keyboard([
        Markup.button.contactRequest('📱 Поделиться номером телефона'),
      ])
        .oneTime()
        .resize()
    );
    return;
  }

  await ctx.reply(
    `Привет, ${existingGuest.name}! 👋\n\n` +
      `Чтобы зафиксировать визит — отсканируйте QR у официанта.\n` +
      `Посмотреть свою историю — /history`
  );
});

bot.on('contact', async (ctx) => {
  const telegramId = ctx.from.id;
  const contact = ctx.message.contact;

  // Разрешаем делиться только своим контактом, не чужим
  if (contact.user_id && contact.user_id !== telegramId) {
    await ctx.reply('Пожалуйста, поделитесь своим собственным контактом.');
    return;
  }

  const name =
    [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') ||
    'Гость';

  await db.upsertGuest({
    telegram_id: telegramId,
    name,
    phone: contact.phone_number,
  });

  await ctx.reply('Спасибо! Вы зарегистрированы. 🎉', Markup.removeKeyboard());

  const pendingCode = pendingCheckin.get(telegramId);
  if (pendingCode) {
    pendingCheckin.delete(telegramId);
    await processCheckin(ctx, telegramId, pendingCode);
  } else {
    await ctx.reply(
      `Чтобы зафиксировать визит — отсканируйте QR у официанта.\n` +
        `Посмотреть свою историю — /history`
    );
  }
});

bot.command('history', async (ctx) => {
  const telegramId = ctx.from.id;
  const guest = await db.getGuest(telegramId);
  if (!guest) {
    await ctx.reply('Вы ещё не зарегистрированы — отправьте /start.');
    return;
  }
  const visits = await db.getVisitsByGuest(telegramId);
  if (visits.length === 0) {
    await ctx.reply('Пока нет ни одного визита.');
    return;
  }
  const lines = visits
    .slice(0, 20)
    .map((v, i) => {
      const d = new Date(v.created_at);
      const dateStr = d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${i + 1}. ${dateStr}`;
    })
    .join('\n');
  await ctx.reply(`Ваши визиты (всего: ${visits.length}):\n\n${lines}`);
});

module.exports = bot;
