require('dotenv').config(); 

const { bot, adminMainMenu, subadminMenu, userMenu, User } = require('./utils');
const { handleAdminCommands } = require('./adminCommands');
const { handleSubadminCommands } = require('./subadminCommands');
const { handleUserCommands } = require('./userCommands');
require('./cron-reminder-hour');
const { adminIds } = require('../constants/constants');
 

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const telegramId = msg.from.id;

  if (!username) {
    bot.sendMessage(chatId, "У вашего аккаунта отсутствует username. Установите его в настройках Telegram.");
    return;
  }

  let user = await User.findOne({ username });

  // ✅ Админ может заходить без предварительной регистрации
  if (adminIds.includes(telegramId)) {
    if (!user) {
      user = new User({
        username: msg.from.username || 'без_username',
        telegramId,
        chatId,
        department: 'не назначено',
        role: 'admin',
      });
    } else {
      user.role = 'admin';
      user.telegramId = telegramId;
      user.chatId = chatId;
    }

    await user.save();
    bot.sendMessage(chatId, "Добро пожаловать, администратор!", adminMainMenu);
    return;
  }

  // ❌ Остальные должны быть добавлены вручную
  if (!user) {
    bot.sendMessage(chatId, "Вы не зарегистрированы в системе. Обратитесь к администратору для доступа.");
    return;
  }

  // Обновление chatId / telegramId при необходимости
  let updated = false;

  if (user.telegramId !== telegramId) {
    user.telegramId = telegramId;
    updated = true;
  }

  if (!user.chatId || user.chatId !== chatId) {
    user.chatId = chatId;
    updated = true;
  }

  if (updated) {
    await user.save();
  }

 // 👥 Меню по роли
if (user.role === 'subadmin') {
  // Проверяем, есть ли у субадмина выбранные отделы
  if (user.subadminDepartments && user.subadminDepartments.length > 0) {
    // Создаем строку с отделами, разделёнными запятой
    const departmentsList = user.subadminDepartments.join(', ');

    // Отправляем сообщение с подставленными отделами
    bot.sendMessage(chatId, `Добро пожаловать, субадмин отдела(ов): "${departmentsList}"!`, subadminMenu);
  } else {
    // Если у субадмина нет выбранных отделов
    bot.sendMessage(chatId, 'У вас нет выбранных отделов.', subadminMenu);
  }
} else {
  // Для других ролей (например, для пользователей)
  bot.sendMessage(chatId, `Добро пожаловать! Ваш отдел: ${user.department}`, userMenu);
}

  await handleUserCommands(msg, '', username);
});


bot.on('message', async (msg) => {
  const text = msg.text?.trim();
  const username = msg.from.username;
  const telegramId = msg.from.id;

  if (!text || !username) return;

  const user = await User.findOne({ username });
  if (!user) {
    return;
  }

  if (adminIds.includes(telegramId)) {
    return handleAdminCommands(msg, text, username, adminIds);
  }

  if (user.role === 'subadmin') {
    return handleSubadminCommands(msg, text, username);
  }

  return handleUserCommands(msg, text, username);
});




