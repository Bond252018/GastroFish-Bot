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

  if (adminIds.includes(msg.from.id)) {
    if (text === '🏠 Главное меню') {
      delete adminState[username];
      return bot.sendMessage(chatId, 'Действие отменено. Возвращаемся в главное меню.', adminMainMenu);
    }

    if (text === '👥 Список пользователей') {
      try {
        const users = await User.find({});
        if (users.length === 0) return bot.sendMessage(chatId, 'Нет зарегистрированных пользователей.');

        const userList = users.map(user => `@${user.username} — ${user.department}`).join('\n');
        return bot.sendMessage(chatId, `Список пользователей:\n\n${userList}`, adminMainMenu);
      } catch (error) {
        console.error('Ошибка при получении списка пользователей:', error);
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
        console.log(`Создана запись adminState для ${username} с ролью admin`);
      } else {
        // Если запись уже существует, не перезаписываем роль, только добавляем текущий шаг
        adminState[username].step = 'awaitingDepartment';
        console.log(`Запись для ${username} обновлена, роль уже установлена как ${adminState[username].role}`);
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

    if (text === '🧹 Удалить субадмина') {
      adminState[username] = { step: 'awaitingRemoveSubadminUsername' };
      return bot.sendMessage(chatId, 'Введите username субадмина, которого нужно удалить (в формате @username).');
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
    const now = new Date();
    // Получаем все задачи для выбранного отдела со статусом 'pending' или 'overdue'
    const tasks = await Task.find({
      department: selectedDepartment.name,
      status: { $in: ['pending', 'overdue'] }
    }).sort({ deadline: 1 });

    let message = `📋 Невыполненные задачи в отделе "${escapeHTML(selectedDepartment.name)}":\n\n`;
    let hasPendingTasks = false;

    for (const task of tasks) {
      const deadline = new Date(task.deadline);
      const deadlinePassed = deadline < now;
      const isExpired = deadlinePassed && (now - deadline > 24 * 60 * 60 * 1000);

      if (isExpired) {
        console.log(`Задача "${task.title}" просрочена и будет помечена как "expired".`);
        task.status = 'expired';
        await task.save();
        continue;
      }

      if (deadlinePassed) {
        hasPendingTasks = true;
        const deadlineStr = deadline.toLocaleString('ru-RU');

        message += `🔸 <b>${escapeHTML(task.title)}</b>\n`;
        message += `📄 Описание: ${escapeHTML(task.description) || '—'}\n`;
        message += `🏢 Отдел: ${escapeHTML(task.department)}\n`;
        message += `📅 Дедлайн: ${escapeHTML(deadlineStr)}\n`;

        if (task.assignedTo) {
          message += `👤 Назначено: @${escapeHTML(task.assignedTo)}\n`;
        } else {
          message += `👤 Назначено: всем в отделе\n`;
        }

        message += '\n';
      }
    }

    if (!hasPendingTasks) {
      // Если нет невыполненных задач, сообщаем и возвращаем в главное меню
      await bot.sendMessage(chatId, 'Все задачи в этом отделе выполнены ✅', adminMainMenu);
    } else {
      const maxMessageLength = 4000; // с запасом
      let currentPart = '';
      const parts = [];
      
      for (const task of tasks) {
        const deadline = new Date(task.deadline);
        const deadlinePassed = deadline < now;
        const isExpired = deadlinePassed && (now - deadline > 24 * 60 * 60 * 1000);
        if (isExpired) {
          task.status = 'expired';
          await task.save();
          continue;
        }
      
        if (deadlinePassed) {
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
      
      // Отправляем заголовок один раз
      await bot.sendMessage(chatId, `📋 Невыполненные задачи в отделе "${selectedDepartment.name}":`, { parse_mode: 'HTML' });
      
      // Отправляем части
      for (const part of parts) {
        await bot.sendMessage(chatId, part, { parse_mode: 'HTML' });
      }      
    }

    // Возвращаем в главное меню
    return bot.sendMessage(chatId, 'Возвращаемся в главное меню...', adminMainMenu);

  } catch (error) {
    console.error('❌ Ошибка при получении невыполненных задач:', error);
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
      status: 'overdue'
    });

    if (expiredTasks.length === 0) {
      return bot.sendMessage(chatId, 'Нет просроченных задач в этом отделе для удаления.', adminMainMenu);
    }

    // Удаляем все просроченные задачи из выбранного отдела
    await Task.deleteMany({
      department: selectedDepartment.name,
      status: 'overdue'
    });

    // Отправляем сообщение, что задачи были удалены и возвращаем в главное меню
    return bot.sendMessage(chatId, `Все просроченные задачи из отдела "${selectedDepartment.name}" были удалены.`, adminMainMenu);
  } catch (error) {
    console.error('❌ Ошибка при удалении просроченных задач:', error);
    return bot.sendMessage(chatId, 'Произошла ошибка при удалении просроченных задач. Попробуйте позже.');
  }
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
      status: 'overdue'
    });

    if (expiredTasks.length === 0) {
      return bot.sendMessage(chatId, 'Нет просроченных задач в этом отделе для удаления.', adminMainMenu);
    }

    // Удаляем все просроченные задачи из выбранного отдела
    await Task.deleteMany({
      department: selectedDepartment.name,
      status: 'overdue'
    });

    // Отправляем сообщение, что задачи были удалены и возвращаем в главное меню
    return bot.sendMessage(chatId, `Все просроченные задачи из отдела "${selectedDepartment.name}" были удалены.`, adminMainMenu);
  } catch (error) {
    console.error('❌ Ошибка при удалении просроченных задач:', error);
    return bot.sendMessage(chatId, 'Произошла ошибка при удалении просроченных задач. Попробуйте позже.');
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
            console.error('Ошибка при добавлении пользователя:', error);
            return bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
          }
          case 'awaitingSubadminUsername':
            if (!isValidUsername(text)) {
              return bot.sendMessage(chatId, 'Введите корректный username в формате @username (например, @ivan_petrov).');
            }

            const subUsername = text.trim().replace('@', '');
            const targetUser = await User.findOne({ username: subUsername });

            if (!targetUser) {
              return bot.sendMessage(chatId, `Пользователь @${subUsername} не найден.`);
            }

            if (!targetUser.department || targetUser.department === 'не назначено') {
              return bot.sendMessage(chatId, `У пользователя @${subUsername} не назначен отдел. Назначьте сначала отдел.`);
            }

            targetUser.role = 'subadmin';
            await targetUser.save();

            delete adminState[username];

            return bot.sendMessage(chatId, `✅ Пользователь @${subUsername} назначен субадмином отдела "${targetUser.department}".`, adminMainMenu);

            
        case 'awaitingRemoveSubadminUsername':
          if (!isValidUsername(text)) {
            return bot.sendMessage(chatId, 'Введите корректный username в формате @username (например, @ivan_petrov).');
          }
        
          const delSubUsername = text.trim().replace('@', '');
          const subUser = await User.findOne({ username: delSubUsername });
        
          if (!subUser) {
            return bot.sendMessage(chatId, `Пользователь @${delSubUsername} не найден.`);
          }
        
          if (subUser.role !== 'subadmin') {
            return bot.sendMessage(chatId, `Пользователь @${delSubUsername} не является субадмином.`);
          }
        
          subUser.role = 'user';
          await subUser.save();
        
          delete adminState[username];
        
          return bot.sendMessage(chatId, `🧹 Права субадмина у пользователя @${delSubUsername} сняты.`, adminMainMenu);
            
        

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
            console.error('Ошибка при удалении пользователя:', error);
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
            const users = await User.find({ department: adminState[username].department });
            if (!users.length) return bot.sendMessage(chatId, 'В выбранном отделе нет пользователей.');

            adminState[username].target = 'user';
            adminState[username].step = 'awaitingTargetUsername';

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
    console.error('❌ Ошибка при сохранении фото задачи:', error);
    return bot.sendMessage(chatId, 'Произошла ошибка при обработке фото. Попробуйте снова.');
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const userId = msg.from.id;
  const text = msg.text?.trim();
  const state = adminState[username];

  console.log("Получен текст от пользователя:", text);

  // --- Только админ может начать "📂 Документы"
  if (text === '📂 Документы') {
    if (!adminIds.includes(userId)) {
      console.log(`❌ Пользователь @${username} (${userId}) попытался получить доступ к документам без прав.`);
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

    if (text === '🏠 Главное меню') {
      delete adminState[username];
      return bot.sendMessage(chatId, 'Вы вернулись в главное меню.');
    }

    const selectedDepartment = departmentList.find(d => `${d.emoji} ${d.name}` === text);
    if (selectedDepartment) {
      // Обновляем состояние и сохраняем выбранное подразделение
      adminState[username] = { 
        ...state, 
        step: 'awaitingDocumentUpload',  // Переходим к этапу ожидания документа
        department: selectedDepartment.name
      };
      console.log(`Выбрано подразделение: ${selectedDepartment.name}`);
      return bot.sendMessage(chatId, `Вы выбрали подразделение: ${selectedDepartment.name}. Пожалуйста, загрузите PDF-документ.`);
    } else {
      return bot.sendMessage(chatId, 'Пожалуйста, выберите подразделение из списка.');
    }
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
        console.log('✅ Документ сохранён в базе данных.');

        const usersInDepartment = await User.find({ department });
        if (usersInDepartment.length === 0) {
          return bot.sendMessage(chatId, `⚠️ В подразделении ${department} нет зарегистрированных пользователей.`);
        }
          // Отправка документа всем пользователям подразделения
          for (const user of usersInDepartment) {
            if (!user.chatId) {
              console.error(`❌ У пользователя ${user.username} отсутствует chatId.`);
              continue; // Пропускаем этого пользователя, если у него нет chatId
            }

            try {
              await bot.sendDocument(user.chatId, fileUrl, { caption: '📎 Новый документ для вашего отдела.' });
            } catch (error) {
              console.error(`❌ Ошибка при отправке документа пользователю ${user.chatId}:`, error.message);
            }
          }

        // Очистка состояния после завершения
        delete adminState[username]; // Состояние очищается, чтобы не было повторного запроса на выбор подразделения

      } catch (error) {
        // Логируем ошибку, но не показываем сообщение пользователю
        console.error('❌ Ошибка при сохранении документа или отправке:', error);
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
    console.error('❌ Ошибка при получении документов для пользователя:', error);
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
    console.log(`❌ Пользователь @${username} (${userId}) попытался загрузить документ без прав.`);
    return bot.sendMessage(chatId, '⛔ У вас нет прав загружать документы.');
  }

  console.log(`Загружен документ от ${username}`);

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
        console.log('✅ Документ сохранён в базе данных.');

        const usersInDepartment = await User.find({ department });
        if (usersInDepartment.length === 0) {
          return bot.sendMessage(chatId, `⚠️ В подразделении ${department} нет зарегистрированных пользователей.`);
        }

        // Отправка документа всем пользователям подразделения
        for (const user of usersInDepartment) {
          if (!user.chatId) {
            console.error(`❌ У пользователя ${user.username} отсутствует chatId. Пропускаем.`);
            continue; // Пропускаем пользователя без chatId
          }

          try {
            await bot.sendDocument(user.chatId, fileUrl, { caption: '📎 Новый документ для вашего отдела.' });
          } catch (error) {
            console.error(`❌ Ошибка при отправке документа пользователю ${user.username} (chatId: ${user.chatId}):`, error.message);
          }
        }

        // Очищаем состояние после завершения отправки
        delete adminState[username]; // Состояние очищается, чтобы не было повторного запроса на выбор подразделения
        return bot.sendMessage(chatId, `✅ Документ успешно отправлен всем пользователям отдела ${department}.`, adminMainMenu); // Переход в главное меню

      } catch (error) {
        console.error('❌ Ошибка при сохранении документа или отправке:', error);
      }
    } else {
      return bot.sendMessage(chatId, 'Пожалуйста, загрузите документ в формате PDF.');
    }
  } else {
    return bot.sendMessage(chatId, 'Пожалуйста, сначала выберите подразделение.');
  }
});

module.exports = { handleAdminCommands };
