require('dotenv').config(); 

const { bot, adminMainMenu, subadminMenu, userMenu, User } = require('./utils');
const { handleAdminCommands } = require('./adminCommands');
const { handleSubadminCommands } = require('./subadminCommands');
const { handleUserCommands } = require('./userCommands');
require('./cron-reminder-hour');
const { adminIds } = require('../constants/constants');


bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id; // Telegram chat ID
  const username = msg.from.username;
  const telegramId = msg.from.id; // Это Telegram ID, его мы и будем сохранять

  console.log("Получено сообщение от пользователя:", msg.from);

  if (!username) {
    bot.sendMessage(chatId, "У вашего аккаунта отсутствует username. Установите его в настройках Telegram.");
    return;
  }

  // Проверяем, есть ли пользователь в базе данных
  let user = await User.findOne({ username });

  if (!user) {
    user = new User({
      username,
      telegramId, // 👈 сохраняем telegramId, а не userId
      department: 'не назначено',
    });

    try {
      await user.save();
      console.log(`Пользователь ${username} был добавлен в базу данных.`);
    } catch (error) {
      console.error("Ошибка при добавлении пользователя:", error);
      bot.sendMessage(chatId, "Произошла ошибка при сохранении пользователя.");
      return;
    }
  } else if (!user.telegramId || user.telegramId !== telegramId) {
    // Обновим telegramId, если он ещё не записан или изменился
    user.telegramId = telegramId;
    await user.save();
  }

  // Приветственное сообщение в зависимости от роли
  if (adminIds.includes(telegramId)) {
    console.log(`Пользователь ${username} (${telegramId}) является администратором.`);
    user.role = 'admin';
    await user.save();
    bot.sendMessage(chatId, `Добро пожаловать, администратор!`, adminMainMenu);
  } else if (user.role === 'subadmin') {
    console.log(`Пользователь ${username} (${telegramId}) является субадмином.`);
    bot.sendMessage(chatId, `Добро пожаловать, субадмин отдела "${user.department}"!`, subadminMenu);
  } else {
    console.log(`Пользователь ${username} (${telegramId}) не является админом.`);
    bot.sendMessage(chatId, `Добро пожаловать! Ваш отдел: ${user.department}`, userMenu);
  }

  // Вызываем handleUserCommands для /start
  await handleUserCommands(msg, '', username);
});


bot.on('message', async (msg) => {
  const text = msg.text?.trim();
  const username = msg.from.username;
  const telegramId = msg.from.id;

  console.log(`Получено сообщение от ${username}: ${text}`);

  if (!text || !username) return;

  const user = await User.findOne({ username });
  if (!user) return;

  if (adminIds.includes(telegramId)) {
    console.log(`Обработка команды администратора от ${username} (${telegramId}): ${text}`);
    return handleAdminCommands(msg, text, username, adminIds);
  }

  if (user.role === 'subadmin') {
    console.log(`Обработка команды субадмина от ${username}: ${text}`);
    return handleSubadminCommands(msg, text, username);
  }

  console.log(`Обработка команды пользователя от ${username}: ${text}`);
  return handleUserCommands(msg, text, username);
});


