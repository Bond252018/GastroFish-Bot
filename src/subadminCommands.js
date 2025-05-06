const { bot, adminState, subadminMenu } = require('./utils');
const User = require('../models/userDB');
const Task = require('../models/taskDB');

const {
  awaitingTaskDescription,
  awaitingTaskPhoto,
  awaitingDeadlineDate,
  awaitingManualDateInput,
  awaitingDeadlineTime,
  awaitingManualTimeInput
} = require('./deadlineHandler');
const { notifySubadminOnTaskCompletion } = require('./notifications'); 


async function handleSubadminCommands(msg, text, username) {
  const chatId = msg.chat.id;
  const user = await User.findOne({ username });

  if (!user || user.role !== 'subadmin') return;

  const department = user.department;

  if (text === '🏠 Главное меню') {
    delete adminState[username];
    return bot.sendMessage(chatId, 'Главное меню субадмина:', subadminMenu);
  }

  if (text === '👥 Мои сотрудники') {
    try {
      // Получим всех пользователей с ролью 'user' в отделе
      const users = await User.find({ department, role: 'user' });

      if (!users.length) {
        return bot.sendMessage(chatId, `В отделе "${department}" нет сотрудников.`, subadminMenu);
      }

      const list = users.map(u => `@${u.username}`).join('\n');
      return bot.sendMessage(chatId, `👥 Сотрудники отдела "${department}":\n\n${list}`, subadminMenu);

    } catch (err) {
      return bot.sendMessage(chatId, 'Произошла ошибка при получении списка сотрудников. Попробуйте позже.', subadminMenu);
    }
  }

  if (text === '📝 Поставить задачу') {
    adminState[username] = {
      step: 'awaitingTargetAudience',
      department: department,
      role: 'subadmin'
    };
    return bot.sendMessage(chatId, 'Кому поставить задачу?', {
      reply_markup: {
        keyboard: [['📢 Всем сотрудникам отдела'], ['👤 Определённому пользователю'], ['🏠 Главное меню']],
        resize_keyboard: true
      }
    });
  }

  if (adminState[username]) {
    const state = adminState[username];

    switch (state.step) {
      case 'awaitingTargetAudience':
        if (text === '📢 Всем сотрудникам отдела') {
          state.target = 'all';
          state.step = 'awaitingTaskTitle';
          return bot.sendMessage(chatId, 'Введите название задачи.');
        }

        if (text === '👤 Определённому пользователю') {
          const users = await User.find({ department });
          if (!users.length) return bot.sendMessage(chatId, 'В вашем отделе нет сотрудников.');

          state.target = 'user';
          state.step = 'awaitingTargetUsername';

          const buttons = users.map(u => [`@${u.username}`]);
          buttons.push(['🏠 Главное меню']);
          return bot.sendMessage(chatId, 'Выберите пользователя:', {
            reply_markup: { keyboard: buttons, resize_keyboard: true }
          });
        }
        break;

      case 'awaitingTargetUsername':
        const selectedUser = await User.findOne({ username: text.slice(1) }); // Ожидаем @username
        if (!selectedUser) {
          return bot.sendMessage(chatId, 'Пользователь не найден. Выберите другого.', {
            reply_markup: { keyboard: [['🏠 Главное меню']], resize_keyboard: true }
          });
        }

        state.targetUsername = selectedUser.username;
        state.step = 'awaitingTaskTitle';
        return bot.sendMessage(chatId, 'Введите название задачи.');

      case 'awaitingTaskTitle':
        state.title = text;
        state.step = 'awaitingTaskDescription';
        return bot.sendMessage(chatId, 'Введите описание задачи.');

      case 'awaitingTaskDescription':
        await awaitingTaskDescription(bot, chatId, adminState, username, text);
        break;

      case 'awaitingTaskPhoto':
        await awaitingTaskPhoto(bot, chatId, adminState, username, text);
        break;

      case 'awaitingDeadlineDate':
        await awaitingDeadlineDate(bot, chatId, adminState, username, text);
        break;

      case 'awaitingManualDateInput':
        await awaitingManualDateInput(bot, chatId, adminState, username, text);
        break;

      case 'awaitingDeadlineTime':
        await awaitingDeadlineTime(msg, bot, chatId, adminState, username, text);
        break;

      case 'awaitingManualTimeInput':
        await awaitingManualTimeInput(msg, bot, chatId, adminState, username, text);
        break;
    }
  }
}

// Завершение задачи
async function completeTask(taskId) {
  const task = await Task.findById(taskId);
  if (!task) return;

  task.status = 'completed';
  await task.save();

  await notifySubadminOnTaskCompletion(task); // Уведомление субадмина
}

module.exports = { handleSubadminCommands, completeTask };
