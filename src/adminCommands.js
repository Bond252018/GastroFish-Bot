const { adminState, bot, isValidUsername, escapeHTML, getKeyboard, departmentList, adminMainMenu, Document, User, Task } = require('./utils');
const { adminIds } = require('../constants/constants');
 
const {
  awaitingTaskDescription,
  awaitingTaskPhoto,
  awaitingDeadlineDate,
  awaitingManualDateInput,
  awaitingDeadlineTime,
  awaitingManualTimeInput,
} = require('./deadlineHandler');

const {
  handleUserCommands
} = require('./userCommands');  
const { handleAddUserFlow } = require('./addUserFlow');


async function handleAdminCommands(msg, text, username, adminIds) {
  const chatId = msg.chat.id;

   if (text === '👥 Список пользователей') {
  try {
    const users = await User.find({});
    if (users.length === 0) return bot.sendMessage(chatId, 'Нет зарегистрированных пользователей.');

    const sortedUsers = users.sort((a, b) => {
      const roleOrder = { admin: 0, subadmin: 1, user: 2 };
      return roleOrder[a.role] - roleOrder[b.role];
    });

    const userList = users.map(user => {
      const username = `@${user.username}`;
      
      if (user.role === 'admin') {
        return `${username} — Админ`;
      }
      
      if (user.role === 'subadmin') {
        // Если у субадмина есть выбранные департаменты, выводим их
        const departments = user.subadminDepartments.length > 0 
          ? user.subadminDepartments.join(', ') 
          : 'не указано';  // Если департаменты не выбраны, показываем "не указано"
        return `${username} — Субадмин ${departments}`;
      }

      // Для обычных пользователей
      return `${username} — ${user.department || 'не назначено'}`;
    }).join('\n');

    return bot.sendMessage(chatId, `Список пользователей:\n\n${userList}`, adminMainMenu);
  } catch (error) {
    return bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей. Попробуйте снова.');
  }
}

    if (text === '📥 Добавить пользователя') {
      adminState[username] = { step: 'awaitingUsername' };
      return bot.sendMessage(chatId, 'Введите username нового пользователя (в формате @username).');
    }

    if (adminState[username]) {
      const result = await handleAddUserFlow(bot, msg, adminState);

      if (result?.success) {
        await bot.sendMessage(chatId, 'Возвращаемся в главное меню.', adminMainMenu); 
      }
    }

    if (text === '❌ Удалить пользователя') {
      adminState[username] = { step: 'awaitingDeleteUsername' };
      return bot.sendMessage(chatId, 'Введите username пользователя для удаления (в формате @username).');
    }
    if (text === '📝 Поставить задачу') {
    if (!adminState[username]) {
      adminState[username] = {
        step: 'awaitingTarget',
        role: 'admin'
      };
    } else {
      adminState[username].step = 'awaitingTarget';
    }

   return bot.sendMessage(chatId, 'Кому поставить задачу?', getKeyboard({
      buttonsRows: [['📋 Подразделению', '👤 Администратору']],
      includeHome: true
    }));
  }
  

  // 📋 Подразделению
    if (adminState[username]?.step === 'awaitingTarget' && text === '📋 Подразделению') {
    adminState[username].step = 'awaitingDepartment';

     return bot.sendMessage(chatId, 'Выберите отдел:', getKeyboard({
    buttonsRows: departmentList.map(d => [`${d.emoji} ${d.name}`]),
    includeBack: true,
    includeHome: true
  }));
}
// Обработка кнопки "Назад" в выборе отдела
if (adminState[username]?.step === 'awaitingDepartment' && text === '🔙 Назад') {
  adminState[username].step = 'awaitingTarget';

  return bot.sendMessage(chatId, 'Кому поставить задачу?', getKeyboard({
    buttonsRows: [['📋 Подразделению', '👤 Администратору']],
    includeHome: true
  }));
}

// 🧍 Администратору
if (adminState[username]?.step === 'awaitingTarget') {
  if (text === '👤 Администратору') {
    const currentId = msg.from.id.toString();

    // Загружаем всех других админов из базы
    const otherAdmins = await User.find({
      role: 'admin',
      telegramId: { $ne: currentId }
    });

    if (!otherAdmins.length) {
      return bot.sendMessage(chatId, 'Нет других администраторов.');
    }

    adminState[username].step = 'awaitingAdmin';

  return bot.sendMessage(chatId, 'Выберите администратора:', getKeyboard({
      buttonsRows: otherAdmins.map(admin => [`@${admin.username}`]),
      includeBack: true,
      includeHome: true
    }));
  }
}
 // Обработка кнопки "Назад" в выборе администратора
if (adminState[username]?.step === 'awaitingAdmin' && text === '🔙 Назад') {
  adminState[username].step = 'awaitingTarget';

  return bot.sendMessage(chatId, 'Кому поставить задачу?', getKeyboard({
    buttonsRows: [['📋 Подразделению', '👤 Администратору']],
    includeHome: true
  }));
}
if (adminState[username]?.step === 'awaitingAdmin') {
    const targetUsername = text.replace('@', '').trim();

  const targetAdmin = await User.findOne({
    username: targetUsername,
    role: 'admin'
  });

  if (!targetAdmin) {
    return bot.sendMessage(chatId, 'Администратор не найден.');
  }

  // Устанавливаем те же поля, что и при выборе обычного пользователя
  adminState[username].target = 'admin';
  adminState[username].targetUsername = targetAdmin.username;
  adminState[username].targetTelegramId = targetAdmin.telegramId;
  adminState[username].step = 'awaitingTaskTitle';

  return bot.sendMessage(chatId, `Введите название задачи для администратора @${targetAdmin.username}:`);
}
    if (text === '👑 Назначить субадмина') {
      adminState[username] = { step: 'awaitingSubadminUsername' };
      return bot.sendMessage(chatId, 'Введите username пользователя, которого нужно назначить субадмином (в формате @username).');
    }

    if (adminState[username]?.step === 'awaitingSubadminUsername') {
      const subadminUsername = text.replace('@', '').trim();
      const userToAssign = await User.findOne({ username: subadminUsername });

      if (!userToAssign) {
        return bot.sendMessage(chatId, 'Пользователь не найден. Убедитесь, что он уже начал взаимодействие с ботом.');
      }

      adminState[username] = {
        step: 'choosingDepartments',
        subadminUsername: subadminUsername,
        selectedDepartments: []
      };

      return bot.sendMessage(chatId, `Выберите до 5 отделов, за которые будет отвечать @${subadminUsername}`, {
        reply_markup: {
          keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['✅ Готово', '❌ Отмена']],
          resize_keyboard: true
        }
      });
    }

    if (adminState[username]?.step === 'choosingDepartments') {
      const state = adminState[username];

      if (text === '✅ Готово') {
        if (state.selectedDepartments.length === 0) {
          return bot.sendMessage(chatId, 'Вы не выбрали ни одного отдела.');
        }

        const userToUpdate = await User.findOne({ username: state.subadminUsername });
        userToUpdate.role = 'subadmin';
        userToUpdate.subadminDepartments = state.selectedDepartments;
        await userToUpdate.save();

        delete adminState[username];
        return bot.sendMessage(chatId, `Пользователь @${userToUpdate.username} назначен субадмином в отделах: ${state.selectedDepartments.join(', ')}`, adminMainMenu);
      }

      if (text === '❌ Отмена') {
        delete adminState[username];
        return bot.sendMessage(chatId, 'Назначение субадмина отменено.', adminMainMenu);
      }

      const selected = departmentList.find(d => `${d.emoji} ${d.name}` === text);
      if (!selected) return bot.sendMessage(chatId, 'Выберите корректный отдел.');

      const name = selected.name;
      const alreadySelected = state.selectedDepartments.includes(name);

      if (alreadySelected) {
        state.selectedDepartments = state.selectedDepartments.filter(d => d !== name);
      } else {
        if (state.selectedDepartments.length >= 5) {
          return bot.sendMessage(chatId, 'Можно выбрать не более 5 отделов.');
        }
        state.selectedDepartments.push(name);
      }

      return bot.sendMessage(chatId, `Выбраны отделы: ${state.selectedDepartments.join(', ') || 'пока ничего'}.\nНажмите ✅ Готово для завершения или выберите еще.`, {
        reply_markup: {
          keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['✅ Готово', '❌ Отмена']],
          resize_keyboard: true
        }
      });
    }

    if (text === '🧹 Удалить субадмина') {
      adminState[username] = { step: 'awaitingRemoveSubadminUsername' };
      return bot.sendMessage(chatId, 'Введите username субадмина, которого нужно удалить (в формате @username).');
    }

    if (adminState[username]?.step === 'awaitingRemoveSubadminUsername') {
      const subadminUsername = text.replace('@', '').trim();
      const userToRemove = await User.findOne({ username: subadminUsername });

      if (!userToRemove) {
        return bot.sendMessage(chatId, 'Пользователь не найден. Убедитесь, что он уже начал взаимодействие с ботом.');
      }

      if (userToRemove.role !== 'subadmin') {
        return bot.sendMessage(chatId, 'Этот пользователь не является субадмином.');
      }

      userToRemove.role = 'user';  // или можно оставить, но убрать права субадмина
      userToRemove.subadminDepartments = [];  // Очистка подразделений

      await userToRemove.save();

      // Удаляем из состояния админа
      delete adminState[username];

      return bot.sendMessage(chatId, `Пользователь @${subadminUsername} больше не является субадмином. Его права были удалены.`, adminMainMenu);
    }

   if (text === '📗 Выполненные задачи' || text === '📘 Невыполненные задачи') {
  const isCompleted = text.includes('Выполненные');
  adminState[username] = {
    step: isCompleted ? 'awaitingDepartmentForCompletedTasks' : 'awaitingDepartmentForUncompletedTasks',
    isCompleted,
    mode: 'tasks'
  };

  return bot.sendMessage(chatId, `Выберите отдел для отображения ${isCompleted ? 'выполненных' : 'невыполненных'} задач:`, {
    reply_markup: {
      keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['🧑‍💼 По администраторам', '🏠 Главное меню']],
      resize_keyboard: true
    }
  });
}

// 🔹 Вход в режим статистики
if (text === '📊 Статистика выполненных задач') {
  adminState[username] = {
    step: 'awaitingDepartmentForStats',
    mode: 'stats'
  };

  return bot.sendMessage(chatId, 'Выберите отдел для статистики:', {
    reply_markup: {
      keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['🧑‍💼 По администраторам', '🏠 Главное меню']],
      resize_keyboard: true
    }
  });
}

if (adminState[username]?.mode === 'tasks' && adminState[username]?.step?.startsWith('awaitingDepartmentFor')) {
  const mode = adminState[username].mode;
  const isCompleted = adminState[username].isCompleted;

  if (mode !== 'tasks') {
    adminState[username] = null;
    return bot.sendMessage(chatId, 'Некорректное состояние. Попробуйте сначала.', adminMainMenu);
  }

  if (text === '🧑‍💼 По администраторам') {
    const admins = await User.find({ role: 'admin' });
    const adminUsernames = admins.map(admin => `@${admin.username}`);
    adminState[username] = {
      step: isCompleted ? 'awaitingAdminForCompletedTasks' : 'awaitingAdminForUncompletedTasks',
      isCompleted,
      mode: 'tasks'    };

    return bot.sendMessage(chatId, 'Выберите администратора:', {
      reply_markup: {
        keyboard: chunk(adminUsernames, 2).concat([['🏠 Главное меню']]),
        resize_keyboard: true
      }
    });
  }

  const selectedDepartment = departmentList.find(d => `${d.emoji} ${d.name}` === text);
  if (!selectedDepartment) return bot.sendMessage(chatId, 'Выберите корректное подразделение.');

  adminState[username].department = selectedDepartment.name;

  try {
    const tasks = await Task.find({
      department: selectedDepartment.name,
      isCompleted
    }).sort({ [isCompleted ? 'completedAt' : 'createdAt']: -1 });

    if (tasks.length === 0) {
      adminState[username] = null;
      return bot.sendMessage(chatId, `В этом отделе пока нет ${isCompleted ? 'выполненных' : 'невыполненных'} задач ✅`, adminMainMenu);
    }

    // ⏳ Анимация
    const loadingSteps = ['⏳ Загрузка задач', '⏳⏳ Загрузка задач', '⏳⏳⏳ Загрузка задач'];
    let loadingMessage = await bot.sendMessage(chatId, loadingSteps[0], { disable_notification: true });
    for (let i = 1; i < loadingSteps.length; i++) {
      await new Promise(r => setTimeout(r, 500));
      await bot.editMessageText(loadingSteps[i], {
        chat_id: chatId,
        message_id: loadingMessage.message_id
      }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 300));
    await bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});

    const maxMessageLength = 4000;
    let currentPart = '';
    const parts = [];

    for (const task of tasks) {
      const deadline = new Date(task.deadline).toLocaleString('ru-RU');
      const completedAt = task.completedAt ? new Date(task.completedAt).toLocaleString('ru-RU') : '—';

      let taskText = `${isCompleted ? '✅' : '🔹'} <b>${escapeHTML(task.title)}</b>\n`;
      taskText += `📄 Описание: ${escapeHTML(task.description) || '—'}\n`;
      taskText += `🏢 Отдел: ${escapeHTML(task.department)}\n`;
      taskText += `📅 Дедлайн: ${escapeHTML(deadline)}\n`;
      if (isCompleted) taskText += `📆 Завершено: ${escapeHTML(completedAt)}\n`;
      taskText += task.assignedTo
        ? `👤 Исполнитель: @${escapeHTML(task.assignedTo)}\n`
        : `👤 Исполнитель: не указан\n`;
      taskText += '\n';

      if (currentPart.length + taskText.length > maxMessageLength) {
        parts.push(currentPart);
        currentPart = taskText;
      } else {
        currentPart += taskText;
      }
    }

    if (currentPart) parts.push(currentPart);

    await bot.sendMessage(chatId, `${isCompleted ? '📗 Выполненные' : '📘 Невыполненные'} задачи в отделе "${selectedDepartment.name}":`, { parse_mode: 'HTML' });
    for (const part of parts) {
      await bot.sendMessage(chatId, part, { parse_mode: 'HTML' });
    }

    adminState[username] = null;
    return bot.sendMessage(chatId, 'Возвращаемся в главное меню...', adminMainMenu);

  } catch (error) {
    console.error(error);
    adminState[username] = null;
    return bot.sendMessage(chatId, 'Произошла ошибка при получении задач. Попробуйте позже.');
  }
}

if (adminState[username]?.mode === 'tasks' && adminState[username]?.step?.startsWith('awaitingAdminFor')) {
  const isCompleted = adminState[username].isCompleted;
  const targetUsername = text.replace('@', '').trim();

  const targetAdmin = await User.findOne({
    username: targetUsername,
    role: 'admin'
  });

  if (!targetAdmin) {
    adminState[username] = null;
    return bot.sendMessage(chatId, 'Администратор не найден.');
  }

  try {
    const tasks = await Task.find({
      assignedTo: targetAdmin.username,
      isCompleted
    }).sort({ [isCompleted ? 'completedAt' : 'createdAt']: -1 });

    if (tasks.length === 0) {
      adminState[username] = null;
      return bot.sendMessage(chatId, `У администратора @${targetAdmin.username} нет ${isCompleted ? 'выполненных' : 'невыполненных'} задач. 📭`, adminMainMenu);
    }

    // ⏳ Анимация
    const loadingSteps = ['⏳ Загрузка задач', '⏳⏳ Загрузка задач', '⏳⏳⏳ Загрузка задач'];
    let loadingMessage = await bot.sendMessage(chatId, loadingSteps[0], { disable_notification: true });
    for (let i = 1; i < loadingSteps.length; i++) {
      await new Promise(r => setTimeout(r, 500));
      await bot.editMessageText(loadingSteps[i], {
        chat_id: chatId,
        message_id: loadingMessage.message_id
      }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 300));
    await bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});

    const maxMessageLength = 4000;
    let currentPart = '';
    const parts = [];

    for (const task of tasks) {
      const deadline = new Date(task.deadline).toLocaleString('ru-RU');
      const completedAt = task.completedAt ? new Date(task.completedAt).toLocaleString('ru-RU') : '—';

      let taskText = `${isCompleted ? '✅' : '🔹'} <b>${escapeHTML(task.title)}</b>\n`;
      taskText += `📄 Описание: ${escapeHTML(task.description) || '—'}\n`;
      taskText += `🏢 Отдел: ${escapeHTML(task.department)}\n`;
      taskText += `📅 Дедлайн: ${escapeHTML(deadline)}\n`;
      if (isCompleted) taskText += `📆 Завершено: ${escapeHTML(completedAt)}\n`;
      taskText += task.assignedTo
        ? `👤 Исполнитель: @${escapeHTML(task.assignedTo)}\n`
        : `👤 Исполнитель: не указан\n`;
      taskText += '\n';

      if (currentPart.length + taskText.length > maxMessageLength) {
        parts.push(currentPart);
        currentPart = taskText;
      } else {
        currentPart += taskText;
      }
    }

    if (currentPart) parts.push(currentPart);

    await bot.sendMessage(chatId, `${isCompleted ? '📗 Выполненные' : '📘 Невыполненные'} задачи администратора @${targetAdmin.username}:`, { parse_mode: 'HTML' });
    for (const part of parts) {
      await bot.sendMessage(chatId, part, { parse_mode: 'HTML' });
    }

    adminState[username] = null;
    return bot.sendMessage(chatId, 'Возвращаемся в главное меню...', adminMainMenu);

  } catch (error) {
    console.error(error);
    adminState[username] = null;
    return bot.sendMessage(chatId, 'Произошла ошибка при получении задач. Попробуйте позже.');
  }
}

// 🔧 Вспомогательная функция
function chunk(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

// 🔹 Статистика: выбор отдела или администратора
if (adminState[username]?.mode === 'stats' && adminState[username]?.step === 'awaitingDepartmentForStats') {
  // Выбор администратора
  if (text === '🧑‍💼 По администраторам') {
    const admins = await User.find({ role: 'admin' });
    const adminUsernames = admins.map(admin => `@${admin.username}`);

    adminState[username] = {
      step: 'awaitingAdminForStats',
      mode: 'stats'
    };

    return bot.sendMessage(chatId, 'Выберите администратора для просмотра статистики:', {
      reply_markup: {
        keyboard: chunk(adminUsernames, 2).concat([['🏠 Главное меню']]),
        resize_keyboard: true
      }
    });
  }

  // Выбор отдела
  const selectedDepartment = departmentList.find(d => `${d.emoji} ${d.name}` === text);
  if (selectedDepartment) {
    adminState[username] = null;

    try {
      const tasks = await Task.find({ department: selectedDepartment.name });

      if (!tasks.length) {
        return bot.sendMessage(chatId, `📭 Нет задач в отделе "${selectedDepartment.name}".`, adminMainMenu);
      }

      const userStats = {};

      for (const task of tasks) {
        const user = task.assignedTo;
        if (!user) continue;

        if (!userStats[user]) {
          userStats[user] = { done: 0, notDone: 0, total: 0 };
        }

        userStats[user].total += 1;

        const isDone = task.isCompleted === true || task.isCompleted === 'true';
        if (isDone) {
          userStats[user].done += 1;
        } else {
          userStats[user].notDone += 1;
        }
      }

      const users = Object.entries(userStats).filter(([_, stats]) => stats.total > 0);
      if (!users.length) {
        return bot.sendMessage(chatId, `Нет активных данных по задачам в отделе "${selectedDepartment.name}".`, adminMainMenu);
      }

      let message = `📊 Статистика по отделу "${selectedDepartment.name}":\n\n`;

      for (const [user, stats] of users) {
        const { total, done, notDone } = stats;
        const donePercent = ((done / total) * 100).toFixed(1);
        const notDonePercent = ((notDone / total) * 100).toFixed(1);

        message += `👤 @${user}:\n`;
        message += `Всего задач: ${total}\n`;
        message += `✅ Выполнено: ${done} (${donePercent}%)\n`;
        message += `❌ Невыполнено: ${notDone} (${notDonePercent}%)\n\n`;
      }

      await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      return bot.sendMessage(chatId, 'Возвращаемся в главное меню...', adminMainMenu);
    } catch (err) {
      console.error(err);
      return bot.sendMessage(chatId, 'Ошибка при получении статистики.');
    }
  }

  return bot.sendMessage(chatId, 'Пожалуйста, выберите отдел из списка или нужную опцию.');
}

// 🔹 Статистика по выбранному администратору
if (adminState[username]?.mode === 'stats' && adminState[username]?.step === 'awaitingAdminForStats') {
  const selectedUsername = text.replace('@', '').trim();

  const admin = await User.findOne({ username: selectedUsername, role: 'admin' });
  if (!admin) {
    adminState[username] = null;
    return bot.sendMessage(chatId, 'Администратор не найден.');
  }

  try {
    const tasks = await Task.find({ assignedTo: selectedUsername });

    if (!tasks.length) {
      adminState[username] = null;
      return bot.sendMessage(chatId, `У администратора @${selectedUsername} нет задач. 📭`, adminMainMenu);
    }

    let done = 0, notDone = 0;
    for (const task of tasks) {
      Boolean(task.isCompleted) ? done++ : notDone++;
    }

    const total = done + notDone;
    const donePercent = ((done / total) * 100).toFixed(1);
    const notDonePercent = ((notDone / total) * 100).toFixed(1);

    const message = `📊 Статистика администратора @${selectedUsername}:\n\n` +
                    `Всего задач: ${total}\n` +
                    `✅ Выполнено: ${done} (${donePercent}%)\n` +
                    `❌ Невыполнено: ${notDone} (${notDonePercent}%)`;

    adminState[username] = null;
    await bot.sendMessage(chatId, message);
    return bot.sendMessage(chatId, 'Возвращаемся в главное меню...', adminMainMenu);

  } catch (error) {
    console.error(error);
    adminState[username] = null;
    return bot.sendMessage(chatId, 'Ошибка при получении статистики.');
  }
}

// Обработчик команды для удаления просроченных задач
if (text === '🧹 Удалить просроченные задачи') {
  adminState[username] = { step: 'awaitingDeleteTarget' };

  return bot.sendMessage(chatId, 'Кому удалить просроченные задачи?', {
    reply_markup: {
      keyboard: [
        ['📋 Подразделению', '👤 Администраторам'],
        ['🏠 Главное меню']
      ],
      resize_keyboard: true
    }
  });
}

if (
  adminState[username]?.step === 'awaitingDeleteTarget' &&
  text === '📋 Подразделению'
) {
  adminState[username].step = 'awaitingDepartmentForDelete';

  return bot.sendMessage(chatId, 'Выберите отдел для удаления просроченных задач:', {
    reply_markup: {
      keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['🏠 Главное меню']],
      resize_keyboard: true
    }
  });
}

// Шаг 2: Фильтрация по выбранному отделу для удаления просроченных задач
if (adminState[username] && adminState[username].step === 'awaitingDepartmentForDelete') {
  const selectedDepartment = departmentList.find(d => `${d.emoji} ${d.name}` === text);
  
  if (!selectedDepartment) {
    return bot.sendMessage(chatId, 'Выберите корректное подразделение.');
  }

  adminState[username] = null; // Сбросим состояние заранее

  try {
    // Находим и удаляем просроченные задачи из выбранного отдела
    const result = await Task.deleteMany({
      department: selectedDepartment.name,
      status: { $in: ['overdue', 'expired'] }
    });

    if (result.deletedCount === 0) {
      return bot.sendMessage(chatId, '🧹✅ Нет просроченных задач в этом отделе для удаления.', adminMainMenu);
    }

    return bot.sendMessage(
      chatId,
      `✅ Удалено ${result.deletedCount} просроченных задач из отдела "${selectedDepartment.name}".`,
      adminMainMenu
    );
  } catch (error) {
    console.error('Ошибка при удалении задач отдела:', error);
    return bot.sendMessage(chatId, 'Произошла ошибка при удалении просроченных задач. Попробуйте позже.', adminMainMenu);
  }
}

if (
  adminState[username]?.step === 'awaitingDeleteTarget' &&
  text === '👤 Администраторам'
) {
  try {
    // Находим всех администраторов
    const admins = await User.find({ role: 'admin' });

    if (!admins.length) {
      adminState[username] = null;
      return bot.sendMessage(chatId, 'Администраторы не найдены.', adminMainMenu);
    }

    const usernames = admins.map(a => a.username);

    // Сначала проверим, есть ли вообще задачи
    const tasksToDelete = await Task.find({
      assignedTo: { $in: usernames },
      status: { $in: ['overdue', 'expired', 'pending'] }
    });

    if (tasksToDelete.length === 0) {
      adminState[username] = null;
      return bot.sendMessage(chatId, 'Нет просроченных задач, назначенных администраторам.', adminMainMenu);
    }

    // Удаляем задачи
    const result = await Task.deleteMany({
      assignedTo: { $in: usernames },
      status: { $in: ['overdue', 'expired', 'pending'] }
    });

    adminState[username] = null;

    return bot.sendMessage(
      chatId,
      `✅ Удалено ${result.deletedCount} просроченных задач, назначенных администраторам.`,
      adminMainMenu
    );
  } catch (error) {
    console.error('Ошибка при удалении задач администраторов:', error);
    adminState[username] = null;
    return bot.sendMessage(chatId, 'Произошла ошибка при удалении задач.', adminMainMenu);
  }
}

    if (adminState[username]) {
      const state = adminState[username];

      switch (state.step) {
          case 'awaitingDeleteUsername':
          const delUsername = text.trim().replace('@', '');

          // Проверка на корректность введённого username
          if (!isValidUsername(text)) {
            return bot.sendMessage(chatId, 'Введите корректный username (например, @halyna_sichova).');
          }

          if (!delUsername) return bot.sendMessage(chatId, 'Введите корректный username (например, @halyna_sichova).');

          try {
            const userToDelete = await User.findOne({ username: delUsername });
            if (!userToDelete) return bot.sendMessage(chatId, `Пользователь @${delUsername} не найден.`);

            await User.deleteOne({ username: delUsername });
            delete adminState[username];
            bot.sendMessage(chatId, `Пользователь @${delUsername} был успешно удалён.`);
            return bot.sendMessage(chatId, 'Возвращаемся в главное меню.', adminMainMenu);
          } catch (error) {
            return bot.sendMessage(chatId, 'Произошла ошибка при удалении пользователя. Попробуйте снова.');
          }

          case 'awaitingDepartment':
          const selected = departmentList.find(d => `${d.emoji} ${d.name}` === text);
          if (!selected) return bot.sendMessage(chatId, 'Выберите корректное подразделение.');

          adminState[username] = { step: 'awaitingTargetAudience', department: selected.name };
          return bot.sendMessage(chatId, 'Кому назначить задачу?', getKeyboard({
            buttonsRows: [
              ['📢 Всем сотрудникам отдела'],
              ['👤 Определённому пользователю']
            ],
            includeBack: true,
            includeHome: true
          }));

          case 'awaitingTargetAudience':
           if (text === '🔙 Назад') {
            adminState[username].step = 'awaitingDepartment';

              return bot.sendMessage(chatId, 'Выберите отдел:', getKeyboard({
              buttonsRows: departmentList.map(d => [`${d.emoji} ${d.name}`]),
              includeBack: true,
              includeHome: true
            }));
          }
          if (text === '📢 Всем сотрудникам отдела') {
            const department = adminState[username]?.department;

            if (!department) {
              return bot.sendMessage(chatId, 'Выберите департамент.');
            }

            // Ищем пользователей, которые либо в выбранном департаменте, либо являются субадминами этого департамента
            const users = await User.find({
              $or: [
                { department: department },
                { subadminDepartments: department }
              ]
            });

            if (!users.length) {
              return bot.sendMessage(chatId, 'В выбранном департаменте нет пользователей.');
            }

            adminState[username].target = 'all';
            adminState[username].step = 'awaitingTaskTitle';
            return bot.sendMessage(chatId, 'Введите название задачи.', getKeyboard({
            buttonsRows: [], // никаких дополнительных кнопок
            includeBack: true,
            includeHome: true
          }));
        }

          if (text === '👤 Определённому пользователю') {
            const department = adminState[username]?.department;

            if (!department) {
              return bot.sendMessage(chatId, 'Выберите департамент.');
            }

            // Ищем пользователей, которые либо в выбранном департаменте, либо являются субадминами этого департамента
            const users = await User.find({
              $or: [
                { department: department },  // обычные пользователи в департаменте
                { subadminDepartments: department }  // субадмины, которые ответственны за департамент
              ]
            });

            if (!users.length) {
              return bot.sendMessage(chatId, 'В выбранном департаменте нет пользователей.');
            }

            adminState[username].target = 'user';
            adminState[username].step = 'awaitingTargetUsername';

            // Создаем кнопки для всех найденных пользователей
            const buttons = users.map(u => [`@${u.username}`]);
            buttons.push(['🔙 Назад' , '🏠 Главное меню']);

            return bot.sendMessage(chatId, 'Выберите пользователя:', {
              reply_markup: { keyboard: buttons, resize_keyboard: true }
            });
          }

          return bot.sendMessage(chatId, 'Выберите один из предложенных вариантов.');

          case 'awaitingTargetUsername':
            if (text === '🔙 Назад') {
              adminState[username].step = 'awaitingTargetAudience';
              return bot.sendMessage(chatId, 'Кому назначить задачу?', getKeyboard({
                buttonsRows: [
                  ['📢 Всем сотрудникам отдела'],
                  ['👤 Определённому пользователю']
                ],
                includeBack: true,
                includeHome: true
              }));
            } 
            const targetUsername = text.trim().replace('@', '');
            const exists = await User.findOne({ username: targetUsername });
            if (!exists) return bot.sendMessage(chatId, `Пользователь @${targetUsername} не найден.`);
          
            adminState[username].targetUsername = targetUsername;
            adminState[username].step = 'awaitingTaskTitle';
            return bot.sendMessage(chatId, 'Введите название задачи.');
          
          case 'awaitingTaskTitle':
            if (text === '🔙 Назад') {
              adminState[username].step = 'awaitingTargetAudience';
              return bot.sendMessage(chatId, 'Кому назначить задачу?', getKeyboard({
                buttonsRows: [
                  ['📢 Всем сотрудникам отдела'],
                  ['👤 Определённому пользователю']
                ],
                includeBack: true,
                includeHome: true
              }));
            }
            adminState[username].title = text;
            adminState[username].step = 'awaitingTaskDescription';
            return bot.sendMessage(chatId, 'Введите описание задачи.');
      }
    }
     await handleUserCommands(msg, text, username);
  }
  
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const fileId = msg.photo[msg.photo.length - 1].file_id;

  const state = adminState[username];
  if (!state || state.step !== 'awaitingPhotoUpload') return;

  try {
    adminState[username].photo = fileId;
    adminState[username].step = 'awaitingDeadlineDate';

    const now = new Date();
    const dateOptions = [];

    for (let i = 0; i < 5; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      dateOptions.push([dateStr]);
    }

    dateOptions.push(['⌨️ Ввести вручную']);
    dateOptions.push(['🏠 Главное меню']);

    return bot.sendMessage(chatId, '📸 Фото получено!\nТеперь выберите дату дедлайна или введите вручную:', {
      reply_markup: {
        keyboard: dateOptions,
        resize_keyboard: true
      }
    });

  } catch (error) {
    return bot.sendMessage(chatId, 'Произошла ошибка при обработке фото. Попробуйте снова.');
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const userId = msg.from.id;
  const text = msg.text?.trim();
  const state = adminState[username];

  if (adminIds.includes(msg.from.id)) {
    if (text === '🏠 Главное меню') {
      delete adminState[username];
      return bot.sendMessage(chatId, 'Действие отменено. Возвращаемся в главное меню.', adminMainMenu);
    }
  }

  // --- Только админ может начать "📂 Документы"
  if (text === '📂 Документы') {
    if (!adminIds.includes(userId)) {
      return bot.sendMessage(chatId, '⛔ У вас нет прав для доступа к этому разделу.');
    }
    
    if (adminState[username]?.step === 'awaitingDepartmentForDocuments') {
      return bot.sendMessage(chatId, 'Вы уже выбираете подразделение для отправки документа.');
    }

    adminState[username] = { step: 'awaitingDepartmentForDocuments' };
    return bot.sendMessage(chatId, 'Выберите подразделение для отправки документа:', {
      reply_markup: {
        keyboard: [
          ...departmentList.map(d => [`${d.emoji} ${d.name}`]),
          ['🏠 Главное меню']  
        ],
        resize_keyboard: true
      }
    });
  }

  // --- Выбор подразделения
  if (state?.step === 'awaitingDepartmentForDocuments') {
    if (!adminIds.includes(userId)) {
      return bot.sendMessage(chatId, '⛔ Только администратор может выбрать подразделение.');
    }
  
    const selectedDepartment = departmentList.find(d => `${d.emoji} ${d.name}` === text);
  
    // ✅ Проверка на корректность выбора
    if (!selectedDepartment) {
      return bot.sendMessage(chatId, 'Выберите корректное подразделение.');
    }
  
    // Обновляем состояние
    adminState[username] = { 
      ...state, 
      step: 'awaitingDocumentUpload',
      department: selectedDepartment.name
    };
    return bot.sendMessage(chatId, `Вы выбрали подразделение: ${selectedDepartment.name}. Пожалуйста, загрузите PDF-документ.`);
  }
  
  // --- Ожидание документа
  if (state?.step === 'awaitingDocumentUpload') {
    // Проверка на текст: если это текстовое сообщение, не обрабатываем его
    if (text) {
      return bot.sendMessage(chatId, '❌ Пожалуйста, загрузите PDF-документ, а не отправляйте текст.');
    }

    // Если это документ
    if (msg.document) {
      const fileId = msg.document.file_id;
      const fileName = msg.document.file_name;

      // Проверка, что это именно PDF
      if (!fileName.endsWith('.pdf')) {
        return bot.sendMessage(chatId, '❌ Пожалуйста, загрузите документ в формате PDF.');
      }

      const fileUrl = await bot.getFileLink(fileId);

      const department = adminState[username].department;

      try {
        const newDocument = new Document({
          department,
          fileName,
          fileUrl,
          uploadedBy: username,
        });

        await newDocument.save();

        const usersInDepartment = await User.find({ department });
        if (usersInDepartment.length === 0) {
          return bot.sendMessage(chatId, `⚠️ В подразделении ${department} нет зарегистрированных пользователей.`);
        }
          // Отправка документа всем пользователям подразделения
          for (const user of usersInDepartment) {
            if (!user.chatId) {
              continue; // Пропускаем этого пользователя, если у него нет chatId
            }

            try {
              await bot.sendDocument(user.chatId, fileUrl, { caption: '📎 Новый документ для вашего отдела.' });
            } catch (error) {
            }
          }

        // Очистка состояния после завершения
        delete adminState[username]; // Состояние очищается, чтобы не было повторного запроса на выбор подразделения

      } catch (error) {
      }
    } else {
      return bot.sendMessage(chatId, '❌ Ожидается только PDF-документ. Пожалуйста, загрузите PDF.');
    }
  }

    // --- Логика для пользователя: просмотр документов своего отдела
if (text === '📄 Мои документы') {
  try {
    const user = await User.findOne({ username });

    if (!user || !user.department) {
      return bot.sendMessage(chatId, '❗ Вы не зарегистрированы или у вас не указано подразделение.');
    }

    const docs = await Document.find({ department: user.department }).sort({ createdAt: -1 }).limit(10);

    if (docs.length === 0) {
      return bot.sendMessage(chatId, `📁 В подразделении "${user.department}" пока нет документов.`);
    }

    // Создаем inline клавиатуру с документами
    const inlineKeyboard = docs.map(doc => {
      return [
        {
          text: doc.fileName,
          url: doc.fileUrl, // можно добавить ссылку на документ
        }
      ];
    });

    return bot.sendMessage(chatId, 'Вот последние документы для вашего отдела:', {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      }
    });

  } catch (error) {
    return bot.sendMessage(chatId, 'Произошла ошибка при получении документов. Попробуйте позже.');
  }
}
  // --- Фото ожидалось, но пришло не то
  if (state?.step === 'awaitingPhotoUpload' && !msg.photo) {
    return bot.sendMessage(chatId, '❌ Ожидается только фото. Пожалуйста, отправьте изображение.');
  }
});

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const userId = msg.from.id;

  // Проверка прав администратора
  if (!adminIds.includes(userId)) {
    return bot.sendMessage(chatId, '⛔ У вас нет прав загружать документы.');
  }

  if (adminState[username]?.department) {
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;
    const fileUrl = await bot.getFileLink(fileId);

    if (fileName.endsWith('.pdf')) {
      const department = adminState[username].department;

      try {
        const newDocument = new Document({
          department,
          fileName,
          fileUrl,
          uploadedBy: username,
          fileId: msg.document.file_id,  
        });

        await newDocument.save();

        const usersInDepartment = await User.find({ department });
        if (usersInDepartment.length === 0) {
          return bot.sendMessage(chatId, `⚠️ В подразделении ${department} нет зарегистрированных пользователей.`);
        }

        // Отправка документа всем пользователям подразделения
        for (const user of usersInDepartment) {
          if (!user.chatId) {
            continue; // Пропускаем пользователя без chatId
          }

          try {
            await bot.sendDocument(user.chatId, fileUrl, { caption: '📎 Новый документ для вашего отдела.' });
          } catch (error) {
        }
      }

        // Очищаем состояние после завершения отправки
        delete adminState[username]; // Состояние очищается, чтобы не было повторного запроса на выбор подразделения
        return bot.sendMessage(chatId, `✅ Документ успешно отправлен всем пользователям отдела ${department}.`, adminMainMenu); // Переход в главное меню

      } catch (error) {
      }
    } else {
      return bot.sendMessage(chatId, 'Пожалуйста, загрузите документ в формате PDF.');
    }
  } else {
    return bot.sendMessage(chatId, 'Пожалуйста, сначала выберите подразделение.');
  }
});

module.exports = { handleAdminCommands };
