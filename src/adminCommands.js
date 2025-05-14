const { isValidUsername, escapeHTML, departmentList, adminState, bot, Document, User, Task, adminMainMenu } = require('./utils');
const { adminIds } = require('../constants/constants');
 
const {
  awaitingTaskDescription,
  awaitingTaskPhoto,
  awaitingDeadlineDate,
  awaitingManualDateInput,
  awaitingDeadlineTime,
  awaitingManualTimeInput,
} = require('./deadlineHandler');


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

    if (text === '❌ Удалить пользователя') {
      adminState[username] = { step: 'awaitingDeleteUsername' };
      return bot.sendMessage(chatId, 'Введите username пользователя для удаления (в формате @username).');
    }
    if (text === '📝 Поставить задачу') {
      // Проверяем, существует ли уже запись для пользователя
      if (!adminState[username]) {
        adminState[username] = {
          step: 'awaitingDepartment', // Шаг для администратора
          role: 'admin' // Устанавливаем роль как 'admin' при создании новой записи
        };
      } else {
        // Если запись уже существует, не перезаписываем роль, только добавляем текущий шаг
        adminState[username].step = 'awaitingDepartment';
      }
      
      return bot.sendMessage(chatId, 'Выберите отдел:', {
        reply_markup: {
          keyboard: [
            ...departmentList.map(d => [`${d.emoji} ${d.name}`]),
            ['🏠 Главное меню']
          ],
          resize_keyboard: true
        }
      });
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

   
    if (text === '📋 Невыполненные задачи') {
      // Шаг 1: Админ выбирает отдел
      adminState[username] = { step: 'awaitingDepartmentForTasks' };
      return bot.sendMessage(chatId, 'Выберите отдел для отображения невыполненных задач:', {
        reply_markup: {
          keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['🏠 Главное меню']],
          resize_keyboard: true
        }
      });
    }
    
// Шаг 2: Фильтрация по выбранному отделу
if (adminState[username] && adminState[username].step === 'awaitingDepartmentForTasks') {
  const selectedDepartment = departmentList.find(d => `${d.emoji} ${d.name}` === text);
  if (!selectedDepartment) return bot.sendMessage(chatId, 'Выберите корректное подразделение.');

  adminState[username].department = selectedDepartment.name;

  try {
    // Анимация загрузки: создаём сообщение и обновляем его 3 раза с точками
    let loadingText = '🔄 Загружаем задачи';
    const loadingMessage = await bot.sendMessage(chatId, loadingText, { parse_mode: 'HTML' });

    // Обновляем сообщение с задержкой
    for (let i = 1; i <= 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await bot.editMessageText(`${loadingText}${'.'.repeat(i)}`, {
        chat_id: chatId,
        message_id: loadingMessage.message_id,
        parse_mode: 'HTML'
      });
    }

    const now = new Date();
    const tasks = await Task.find({
      department: selectedDepartment.name,
      status: { $in: ['pending', 'overdue'] },
      isCompleted: false
    }).sort({ deadline: 1 });

    let hasPendingTasks = false;
    const maxMessageLength = 4000;
    let currentPart = '';
    const parts = [];

    for (const task of tasks) {
      if (!task.deadline) continue; // защита от пустых дат

      const deadline = new Date(task.deadline);
      const deadlinePassed = deadline < now;
      const isExpired = deadlinePassed && (now - deadline > 24 * 60 * 60 * 1000);

      if (isExpired) {
        task.status = 'expired';
        await task.save();
        continue;
      }

      if (deadlinePassed) {
        hasPendingTasks = true;
        const deadlineStr = deadline.toLocaleString('ru-RU');

        let taskText = `🔸 <b>${escapeHTML(task.title)}</b>\n`;
        taskText += `📄 Описание: ${escapeHTML(task.description) || '—'}\n`;
        taskText += `🏢 Отдел: ${escapeHTML(task.department)}\n`;
        taskText += `📅 Дедлайн: ${escapeHTML(deadlineStr)}\n`;
        taskText += task.assignedTo
          ? `👤 Назначено: @${escapeHTML(task.assignedTo)}\n`
          : `👤 Назначено: всем в отделе\n`;
        taskText += '\n';

        if (currentPart.length + taskText.length > maxMessageLength) {
          parts.push(currentPart);
          currentPart = taskText;
        } else {
          currentPart += taskText;
        }
      }
    }

    if (currentPart) parts.push(currentPart);

    // Удаляем "загрузку..."
    await bot.deleteMessage(chatId, loadingMessage.message_id);

    if (!hasPendingTasks) {
      await bot.sendMessage(chatId, 'Все задачи в этом отделе выполнены ✅', adminMainMenu);
    } else {
      await bot.sendMessage(chatId, `📋 Невыполненные задачи в отделе "${selectedDepartment.name}":`, {
        parse_mode: 'HTML'
      });

      for (const part of parts) {
        await bot.sendMessage(chatId, part, { parse_mode: 'HTML' });
      }
    }

    adminState[username] = null;
    return bot.sendMessage(chatId, 'Возвращаемся в главное меню...', adminMainMenu);

  } catch (error) {
    console.error('Ошибка при получении задач:', error);
    return bot.sendMessage(chatId, 'Произошла ошибка при получении задач. Попробуйте позже.');
  }
}

if (text === '📗 Выполненные задачи') {
  adminState[username] = { step: 'awaitingDepartmentForCompletedTasks' };
  return bot.sendMessage(chatId, 'Выберите отдел для отображения выполненных задач:', {
    reply_markup: {
      keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['🏠 Главное меню']],
      resize_keyboard: true
    }
  });
}

if (adminState[username] && adminState[username].step === 'awaitingDepartmentForCompletedTasks') {
  const selectedDepartment = departmentList.find(d => `${d.emoji} ${d.name}` === text);
  if (!selectedDepartment) return bot.sendMessage(chatId, 'Выберите корректное подразделение.');

  adminState[username].department = selectedDepartment.name;

  try {
    const tasks = await Task.find({
      department: selectedDepartment.name,
      isCompleted: true
    }).sort({ completedAt: -1 });

    if (tasks.length === 0) {
      return bot.sendMessage(chatId, 'В этом отделе пока нет выполненных задач ✅', adminMainMenu);
    }

    // ⏳ Анимация загрузки
    const loadingSteps = ['⏳ Загрузка задач', '⏳⏳ Загрузка задач', '⏳⏳⏳ Загрузка задач'];
    let loadingMessage = await bot.sendMessage(chatId, loadingSteps[0], { disable_notification: true });

    for (let i = 1; i < loadingSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await bot.editMessageText(loadingSteps[i], {
        chat_id: chatId,
        message_id: loadingMessage.message_id
      }).catch(() => {});
    }

    // Удалить сообщение после "анимации"
    await new Promise(resolve => setTimeout(resolve, 300));
    await bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});

    const maxMessageLength = 4000;
    let currentPart = '';
    const parts = [];

    for (const task of tasks) {
      const completedAt = task.completedAt
        ? new Date(task.completedAt).toLocaleString('ru-RU')
        : '—';
      const deadline = new Date(task.deadline).toLocaleString('ru-RU');

      let taskText = `✅ <b>${escapeHTML(task.title)}</b>\n`;
      taskText += `📄 Описание: ${escapeHTML(task.description) || '—'}\n`;
      taskText += `🏢 Отдел: ${escapeHTML(task.department)}\n`;
      taskText += `📅 Дедлайн: ${escapeHTML(deadline)}\n`;
      taskText += `📆 Завершено: ${escapeHTML(completedAt)}\n`;
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

    await bot.sendMessage(chatId, `📗 Выполненные задачи в отделе "${selectedDepartment.name}":`, { parse_mode: 'HTML' });

    for (const part of parts) {
      await bot.sendMessage(chatId, part, { parse_mode: 'HTML' });
    }

    adminState[username] = null;
    return bot.sendMessage(chatId, 'Возвращаемся в главное меню...', adminMainMenu);

  } catch (error) {
    return bot.sendMessage(chatId, 'Произошла ошибка при получении задач. Попробуйте позже.');
  }
}


// Обработчик команды для удаления просроченных задач
if (text === '🧹 Удалить просроченные задачи') {
  adminState[username] = { step: 'awaitingDepartmentForDelete' };

  return bot.sendMessage(chatId, 'Выберите отдел для удаления просроченных задач:', {
    reply_markup: {
      keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['⬅️ Главное меню']],
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

  adminState[username].department = selectedDepartment.name;

  try {
    // Находим все просроченные задачи для выбранного отдела
    const expiredTasks = await Task.find({
      department: selectedDepartment.name,
      status: { $in: ['overdue', 'expired'] }
    });

    if (expiredTasks.length === 0) {
      // Очистка состояния перед возвратом в главное меню
      adminState[username] = null;
      return bot.sendMessage(chatId, 'Нет просроченных задач в этом отделе для удаления.', adminMainMenu);
    }

    // Удаляем все просроченные задачи из выбранного отдела
    await Task.deleteMany({
      department: selectedDepartment.name,
      status: { $in: ['overdue', 'expired'] }
    });

    // Очистка состояния перед возвратом в главное меню
    adminState[username] = null;

    // Отправляем сообщение, что задачи были удалены и возвращаем в главное меню
    return bot.sendMessage(chatId, `Все просроченные задачи из отдела "${selectedDepartment.name}" были удалены.`, adminMainMenu);
  } catch (error) {
    // Очистка состояния при ошибке
    adminState[username] = null;
    return bot.sendMessage(chatId, 'Произошла ошибка при удалении просроченных задач. Попробуйте позже.');
  }
}

if (text === '📊 Статистика выполненных заказов') {
  adminState[username] = { step: 'awaitingDepartmentForStats' };
  return bot.sendMessage(chatId, 'Выберите отдел для статистики:', {
    reply_markup: {
      keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['🏠 Главное меню']],
      resize_keyboard: true
    }
  });
}

if (adminState[username]?.step === 'awaitingDepartmentForStats') {
  const selectedDepartment = departmentList.find(d => `${d.emoji} ${d.name}` === text);
  if (!selectedDepartment) {
    return bot.sendMessage(chatId, 'Выберите корректный отдел.');
  }

  adminState[username] = null;

  try {
    const [completedTasks, pendingTasks] = await Promise.all([
      Task.find({ department: selectedDepartment.name, isCompleted: true }),
      Task.find({ department: selectedDepartment.name, isCompleted: false })
    ]);

    const userStats = {};

    // Считаем выполненные
    for (const task of completedTasks) {
      const user = task.assignedTo;
      if (!user) continue;
      if (!userStats[user]) userStats[user] = { done: 0, notDone: 0 };
      userStats[user].done += 1;
    }

    // Считаем невыполненные
    for (const task of pendingTasks) {
      const user = task.assignedTo;
      if (!user) continue;
      if (!userStats[user]) userStats[user] = { done: 0, notDone: 0 };
      userStats[user].notDone += 1;
    }

    if (Object.keys(userStats).length === 0) {
      return bot.sendMessage(chatId, 'Нет данных по задачам в этом отделе.', adminMainMenu);
    }

    let message = `📊 Статистика по отделу "${selectedDepartment.name}":\n\n`;

    for (const [user, stats] of Object.entries(userStats)) {
      message += `👤 @${user}:\n✅ Выполнено: ${stats.done}\n❌ Невыполнено: ${stats.notDone}\n\n`;
    }

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return bot.sendMessage(chatId, 'Возвращаемся в главное меню...', adminMainMenu);


  } catch (error) {
    console.error(error);
    return bot.sendMessage(chatId, 'Произошла ошибка при получении статистики.');
  }
}

    if (adminState[username]) {
      const state = adminState[username];

      switch (state.step) {
        case 'awaitingUsername':
          const usernameInput = text.trim().replace('@', '');
          if (!isValidUsername(text)) {
            return bot.sendMessage(chatId, 'Введите корректный username (например, @ivan_petrov).');
          }

          try {
            const existingUser = await User.findOne({ username: usernameInput });
            if (existingUser) return bot.sendMessage(chatId, `Пользователь @${usernameInput} уже существует.`);

            const newUser = new User({ username: usernameInput, department: 'не назначено' });
            await newUser.save();

            adminState[username] = { step: 'awaitingDepartmentForNewUserByUsername', username: usernameInput };
            bot.sendMessage(chatId, `Пользователь @${usernameInput} успешно добавлен.`);
            return bot.sendMessage(chatId, 'Выберите подразделение для нового пользователя:', {
              reply_markup: { keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['🏠 Главное меню']], resize_keyboard: true }
            });
          } catch (error) {
            return bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
          }     

        case 'awaitingDepartmentForNewUserByUsername':
          const dept = departmentList.find(d => `${d.emoji} ${d.name}` === text);
          if (!dept) return bot.sendMessage(chatId, 'Выберите корректное подразделение.');

          const userToUpdate = await User.findOne({ username: adminState[username].username });
          if (!userToUpdate) return bot.sendMessage(chatId, `Пользователь @${adminState[username].username} не найден.`);

          userToUpdate.department = dept.name;
          await userToUpdate.save();

          delete adminState[username];
          bot.sendMessage(chatId, `Пользователь @${userToUpdate.username} назначен в подразделение "${dept.name}".`);
          return bot.sendMessage(chatId, 'Возвращаемся в главное меню.', adminMainMenu);

          case 'awaitingDeleteUsername':
          const delUsername = text.trim().replace('@', '');

          // Проверка на корректность введённого username
          if (!isValidUsername(text)) {
            return bot.sendMessage(chatId, 'Введите корректный username (например, @ivan_petrov).');
          }

          if (!delUsername) return bot.sendMessage(chatId, 'Введите корректный username (например, @ivan_petrov).');

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
          return bot.sendMessage(chatId, 'Кому назначить задачу?', {
            reply_markup: {
              keyboard: [['📢 Всем сотрудникам отдела'], ['👤 Определённому пользователю'], ['🏠 Главное меню']],
              resize_keyboard: true
            }
          });

        case 'awaitingTargetAudience':
          if (text === '📢 Всем сотрудникам отдела') {
            adminState[username].target = 'all';
            adminState[username].step = 'awaitingTaskTitle';
            return bot.sendMessage(chatId, 'Введите название задачи.');
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
            buttons.push(['🏠 Главное меню']);

            return bot.sendMessage(chatId, 'Выберите пользователя:', {
              reply_markup: { keyboard: buttons, resize_keyboard: true }
            });
          }

          return bot.sendMessage(chatId, 'Выберите один из предложенных вариантов.');

          case 'awaitingTargetUsername':
            const targetUsername = text.trim().replace('@', '');
            const exists = await User.findOne({ username: targetUsername });
            if (!exists) return bot.sendMessage(chatId, `Пользователь @${targetUsername} не найден.`);
          
            adminState[username].targetUsername = targetUsername;
            adminState[username].step = 'awaitingTaskTitle';
            return bot.sendMessage(chatId, 'Введите название задачи.');
          

          case 'awaitingTaskTitle':
            adminState[username].title = text;
            adminState[username].step = 'awaitingTaskDescription';
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
