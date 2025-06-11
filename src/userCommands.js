require('dotenv').config();  // Загружаем переменные из .env

const { notifyCreatorOnTaskCompletion } = require('./notifications'); 
const { bot, adminState, formatDateTimeRu, escapeMarkdownV2, getKeyboard, userMenu, departmentList, User, Task } = require('./utils');
const { adminIds } = require('../constants/constants');

const {
  awaitingTaskDescription,
  awaitingTaskPhoto,
  awaitingDeadlineDate,
  awaitingManualDateInput,
  awaitingDeadlineTime,
  awaitingManualTimeInput,
} = require('./deadlineHandler');

// Функция для отправки сообщений с кнопками
async function sendTasksMessage(chatId, tasks) {
  const tasksText = tasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n');
  const inlineKeyboard = tasks.map((task) => ({
    text: `Подробнее: ${task.title}`,
    callback_data: `view_task_${task._id}`
  }));

  const message = await bot.sendMessage(chatId, `Ваши незавершённые задачи:\n${tasksText}`, {
    reply_markup: { inline_keyboard: inlineKeyboard.map(button => [button]) }
  });

  // Сохраняем messageId в базе данных
  tasks.forEach(async (task) => {
    await Task.findByIdAndUpdate(task._id, { messageId: message.message_id });
  });
}

 // Функция для обработки просмотра задачи
async function handleViewTask(chatId, messageId, taskId) {
  try {
    const task = await Task.findById(taskId);
    if (!task) {
      await bot.sendMessage(chatId, '❌ Задача не найдена.');
      return;
    }

    const department = task.department || "Не указано";
    const deadline = task.deadline ? new Date(task.deadline) : null;
    const formattedDeadline = deadline 
      ? `${deadline.toLocaleDateString('ru-RU')} ${deadline.toLocaleTimeString('ru-RU')}` 
      : 'Без дедлайна';

    const taskText = `📝 *Задача:* ${escapeMarkdownV2(task.title)}\n📌 *Описание:* ${escapeMarkdownV2(task.description)}\n🏢 *Подразделение:* ${escapeMarkdownV2(department)}\n📅 *Дедлайн:* ${escapeMarkdownV2(formattedDeadline)}\n\n✅ Чтобы выполнить, нажмите кнопку ниже:`;

    const inlineKeyboard = [
      [{ text: '✅ Выполнить', callback_data: `complete_task_${taskId}` }],
      [{ text: '🔙 Назад', callback_data: `back_to_tasks` }]
    ];

    if (task.photo) {
      await bot.deleteMessage(chatId, messageId).catch(() => {}); // Удаляем старое сообщение
      await bot.sendPhoto(chatId, task.photo, {
        caption: taskText,
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
    } else {
      await bot.editMessageText(taskText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
    }

  } catch (error) {
    await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке запроса.');
  }
}

// Функция для завершения задачи
async function handleCompleteTask(chatId, taskId, callbackQuery) {
  try {
    const task = await Task.findById(taskId);
    if (!task) {
      return bot.sendMessage(chatId, 'Задача не найдена.');
    }

    const username = callbackQuery.from.username || 'Неизвестно';

    if (!username || username === 'Неизвестно') {
    }

    // Убедимся, что задача не была завершена этим пользователем ранее
    if (!task.completedBy) {
      task.completedBy = [];
    }

    if (!task.completedBy.includes(username)) {
      task.completedBy.push(username); // Добавляем пользователя в список завершивших
    }

    // Проверяем, завершили ли все пользователи задачу
    const allUsers = await User.find({ department: task.department }); // Все пользователи отдела
    const allCompleted = allUsers.every(user => task.completedBy.includes(user.username)); 

    if (allCompleted) {
      task.isCompleted = true; // Если все завершили, задача завершена
      task.status = 'completed'; // ✅ Меняем статус
      task.completedAt = new Date(); // Устанавливаем дату завершения
    }

    await task.save();

    // Уведомляем администратора о завершении задачи
    await notifyCreatorOnTaskCompletion(task);

    // Удаляем сообщение с задачей
    if (task.messageId) {
        await bot.deleteMessage(chatId, task.messageId).catch((err) => {
      });
    }

    // Обновляем список задач пользователя
    const user = await User.findOne({ userId: chatId });
    if (user) {
      const userTasks = await Task.find({ assignedTo: user.username, isCompleted: false });
      if (userTasks.length > 0) {
        await sendTasksMessage(chatId, userTasks);
      }
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Произошла ошибка при завершении задачи.');
  }
} 

// Обработчик callback_query для завершения задачи и других действий
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;
  const username = callbackQuery.from.username;

  try {
    // Проверяем callback_data для завершения задачи
    if (callbackData.startsWith('complete_task_')) {
      const taskId = callbackData.split('_')[2]; // Извлекаем ID задачи
      await handleExecuteTask(chatId, taskId, callbackQuery); // Передаем callbackQuery в функцию
    }

    // Обработка других действий, например, просмотра задачи
    if (callbackData.startsWith('view_task_')) {
      const taskId = callbackData.split('_')[2];
      await handleViewTask(chatId, callbackQuery.message.message_id, taskId);
    }

 const pendingPhotoUploads = {};

 if (callbackData.startsWith('attach_photo_')) {
  const taskId = callbackData.split('_')[2];
  pendingPhotoUploads[chatId] = { taskId, username: callbackQuery.from.username };

  await bot.sendMessage(chatId, '📷 Пожалуйста, отправьте фото для задачи.');
}

// Глобальный обработчик сообщений, размещайте внизу основного файла
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Проверяем, ожидается ли фото
  const pending = pendingPhotoUploads[chatId];
  if (!pending) return;

  // Если отправлено не фото — просим фото
  if (!msg.photo) {
    return bot.sendMessage(chatId, '❌ Ожидается фото. Пожалуйста, отправьте изображение.');
  }

  const { taskId, username } = pending;
  delete pendingPhotoUploads[chatId]; // Удаляем ожидание

  try {
    const task = await Task.findById(taskId);
    if (!task) {
      return bot.sendMessage(chatId, '❌ Задача не найдена.');
    }

    const photo = msg.photo[msg.photo.length - 1].file_id;
    task.photo = photo;

    if (!Array.isArray(task.assignedTo)) {
      task.assignedTo = [];
    }

    if (!task.completedBy.includes(username)) {
      task.completedBy.push(username);
    }

    const allCompleted = task.assignedTo.every(user => task.completedBy.includes(user));
    if (allCompleted) {
      task.isCompleted = true;
      task.completedAt = new Date();
    }

    await task.save();

    await bot.sendMessage(chatId, `✅ Задача "${task.title}" была успешно завершена с прикрепленным фото.`);
    await notifyCreatorOnTaskCompletion(task);

    if (task.messageId) {
      await bot.deleteMessage(chatId, task.messageId).catch(err => {
    });
  }

  } catch (error) {
    await bot.sendMessage(chatId, '❌ Произошла ошибка при завершении задачи.');
  }
});

 // Обработка кнопки "❌ Пропустить" — завершение задачи без фото
if (callbackData.startsWith('skip_task_')) {
  const taskId = callbackData.split('_')[2]; // Извлекаем ID задачи
  const task = await Task.findById(taskId);

  if (task) {
    // Убедимся, что задача не завершена
    if (task.isCompleted) {
      return bot.sendMessage(chatId, `❌ Задача "${task.title}" уже завершена.`);
    }

    // Убедимся, что assignedTo — это массив, если нет, то создадим пустой массив
    if (!Array.isArray(task.assignedTo)) {
      task.assignedTo = [];
    }

    // Проверим, что пользователь не завершил задачу ранее
    if (!task.completedBy.includes(callbackQuery.from.username)) {
      task.completedBy.push(callbackQuery.from.username); // Добавляем имя пользователя в массив
    }

    // Проверяем, завершили ли все пользователи задачу
    const allCompleted = task.assignedTo.every(user => task.completedBy.includes(user));

    // Если все пользователи завершили задачу, то помечаем её как завершённую
    if (allCompleted) {
      task.isCompleted = true;
      task.completedAt = new Date(); // Устанавливаем дату завершения
    }

    await task.save();

    // Отправляем сообщение текущему пользователю
    await bot.sendMessage(chatId, `✅ Задача "${task.title}" была успешно завершена без фото.`);

    // Завершаем задачу, если это нужно
    await handleCompleteTask(chatId, taskId, callbackQuery);  
  } else {
    return bot.sendMessage(chatId, "Задача не найдена.");
  }
}

 // Обработка кнопки "Назад"
if (callbackData === 'back_to_tasks') {
  const user = await User.findOne({ username: username });

  if (user) {
    // Получаем только актуальные задачи, назначенные этому пользователю
    const userTasks = await Task.find({
      assignedTo: username, // Задачи только для этого пользователя
      isCompleted: false,    // Только незавершённые задачи
      status: { $ne: 'overdue' },  // Задачи, которые не просрочены
      deadline: { $gt: new Date() } // Дедлайн ещё не прошёл
    });

    if (userTasks.length > 0) {
      // Если задачи есть, отправляем их
      await sendTasksMessage(chatId, userTasks);
    } else {
      // Если задач нет, информируем пользователя
      await bot.sendMessage(chatId, 'У вас нет незавершённых задач.');
    }
  } else {
    // Если данные пользователя не найдены
    await bot.sendMessage(chatId, 'Ваши данные не найдены в системе.');
  }
}
} catch (error) {
await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке запроса.');
}
});

 // Обработчик команды "📋 Мои задачи"
async function handleUserCommands(msg, text, username) {
  const chatId = msg.chat.id;

   try {
    const user = await User.findOne({ username });
    if (!user) {
      return bot.sendMessage(chatId, '❌ Не удалось найти информацию о вашем пользователе.');
    }

    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    if (text === '📋 Мои задачи') {
      const userTasks = await Task.find({
        assignedTo: username,
        isCompleted: false,
        status: { $ne: 'overdue' },
        deadline: { $gt: now }
      });

      if (userTasks.length > 0) {
        await sendTasksMessage(chatId, userTasks);
      } else {
        await bot.sendMessage(chatId, '📋 У вас нет активных задач.');
      }
    }

    if (text === '📋 Мои невыполненные задачи') {
      const recentTasks = await Task.find({
        assignedTo: username,
        isCompleted: false,
        createdAt: { $gte: oneDayAgo },
        completedBy: { $ne: username }
      });

      const overdueTasks = await Task.find({
        assignedTo: username,
        isCompleted: false,
        status: 'overdue'
      });

      const allTasks = [...recentTasks, ...overdueTasks];

      // Убираем дубликаты по _id
      const uniqueTasksMap = new Map();
      allTasks.forEach(task => {
        uniqueTasksMap.set(task._id.toString(), task);
      });
      const uniqueTasks = Array.from(uniqueTasksMap.values());

      if (uniqueTasks.length === 0) {
        return bot.sendMessage(chatId, '📋 У вас нет невыполненных задач.');
      }

      let taskList = '📋 *Мои невыполненные задачи за 24 часа:*\n';
      uniqueTasks.forEach(task => {
        const deadlineStr = formatDateTimeRu(new Date(task.deadline));
        const overdueMark = task.status === 'overdue' ? '❗️' : '';
        taskList += `- ${overdueMark} ${task.title} (🕒 ${deadlineStr})\n`;
      });

      await bot.sendMessage(chatId, taskList, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('❌ Ошибка при обработке задач:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при обработке вашего запроса.');
  }
    await handleTaskCreationOnly(msg, text, username); 
}

// Обработчик только для "📝 Поставить задачу"
async function handleTaskCreationOnly(msg, text, username) {
  const chatId = msg.chat.id;

  // Проверяем, что это НЕ админ (админы обрабатываются в другом месте)
  if (!adminIds.includes(msg.from.id)) {

    const state = adminState[username];

    // Обработка главного меню
    if (text === '🏠 Главное меню') {
      delete adminState[username];
      return bot.sendMessage(chatId, 'Главное меню пользователя:', userMenu);
    }
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return bot.sendMessage(chatId, '❌ Не удалось найти информацию о вашем пользователе.');
    }

    // Проверка: пользователь уже в процессе постановки задачи
    if (adminState[username]) {
      return handleTaskSteps(msg, text, username);
    }

if (text === '📝 Поставить задачу') {
  if (user.role !== 'user') return;

  const departmentsFromDB = await User.distinct('subadminDepartments', { role: 'subadmin' });

  if (!departmentsFromDB.length) {
    return bot.sendMessage(chatId, '❌ Нет доступных департаментов.');
  }

  const availableDepartments = departmentList.filter(dep => departmentsFromDB.includes(dep.name));
  const buttons = availableDepartments.map(dep => [`${dep.emoji} ${dep.name}`]);
  buttons.push(['🏠 Главное меню']);

  // 👉 Устанавливаем состояние пользователя
  adminState[username] = {
    step: 'awaitingDepartmentForTask'
  };

  return bot.sendMessage(chatId, 'Выберите отдел:', {
    reply_markup: {
      keyboard: buttons,
      resize_keyboard: true
    }
  });
}

  } catch (error) {
    console.error('❌ Ошибка при постановке задачи:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при обработке запроса.');
  }
}

async function handleTaskSteps(msg, text, username) {
  const chatId = msg.chat.id;
  const state = adminState[username];
  if (!state) return;

  switch (state.step) {
    case 'awaitingDepartmentForTask': {
  // 🔍 Ищем департамент по полному совпадению кнопки
  const matchedDep = departmentList.find(dep => text === `${dep.emoji} ${dep.name}`);

  if (!matchedDep) {
    return bot.sendMessage(chatId, '❌ Пожалуйста, выберите отдел из списка.');
  }

  const selectedDepartment = matchedDep.name;

  const subadmins = await User.find({
    role: 'subadmin',
    subadminDepartments: selectedDepartment
  });

  if (!subadmins.length) {
    return bot.sendMessage(chatId, '❌ В этом департаменте нет субадминов.');
  }

  state.department = selectedDepartment;
  state.step = 'awaitingTargetSubadmin';
  state.availableTargets = subadmins.map(u => u.username);

  const buttons = subadmins.map(u => [u.username]);
  buttons.push(['🔙 Назад' , '🏠 Главное меню']);

  return bot.sendMessage(chatId, `Выберите субадмина из отдела ${selectedDepartment}:`, {
    reply_markup: {
      keyboard: buttons,
      resize_keyboard: true
    }
  });
}
   case 'awaitingTargetSubadmin': {
  if (text === '🔙 Назад') {
    const departmentsFromDB = await User.distinct('subadminDepartments', { role: 'subadmin' });
    const availableDepartments = departmentList.filter(dep => departmentsFromDB.includes(dep.name));
    const buttons = availableDepartments.map(dep => [`${dep.emoji} ${dep.name}`]);

    adminState[username].step = 'awaitingDepartmentForTask';

    return bot.sendMessage(chatId, 'Выберите отдел:', getKeyboard({
      buttonsRows: buttons,
      includeBack: false,
      includeHome: true
    }));
  }

  const selectedUser = await User.findOne({ username: text });
  if (!selectedUser || selectedUser.role !== 'subadmin') {
    return bot.sendMessage(chatId, '❌ Выберите субадмина из предложенного списка.');
  }

  adminState[username].targetUsername = selectedUser.username;
  adminState[username].step = 'awaitingTaskTitle';

  return bot.sendMessage(chatId, 'Введите название задачи.', getKeyboard({
    buttonsRows: [],
    includeBack: true,
    includeHome: true
  }));
}
   case 'awaitingTaskTitle': {
  if (text === '🔙 Назад') {
    // Возврат на выбор субадмина
    const selectedDepartment = state.department;
    const subadmins = await User.find({
      role: 'subadmin',
      subadminDepartments: selectedDepartment
    });

    if (!subadmins.length) {
      return bot.sendMessage(chatId, '❌ В этом департаменте нет субадминов.');
    }

    state.step = 'awaitingTargetSubadmin';
    state.availableTargets = subadmins.map(u => u.username);

    const buttons = subadmins.map(u => [u.username]);
    buttons.push(['🔙 Назад', '🏠 Главное меню']);

    return bot.sendMessage(chatId, `Выберите субадмина из отдела ${selectedDepartment}:`, {
      reply_markup: {
        keyboard: buttons,
        resize_keyboard: true
      }
    });
  }

  // Если не «Назад», сохраняем название задачи и переходим к описанию
  state.title = text;
  state.step = 'awaitingTaskDescription';

  return bot.sendMessage(chatId, 'Введите описание задачи.', getKeyboard({
    buttonsRows: [],
    includeBack: true,
    includeHome: true
  }));
}

    case 'awaitingTaskDescription': {
      if (text === '🔙 Назад') {
        state.step = 'awaitingTaskTitle';
        return bot.sendMessage(chatId, 'Введите название задачи.', getKeyboard({
          buttonsRows: [],
          includeBack: true,
          includeHome: true
        }));
      }
      return awaitingTaskDescription(bot, chatId, adminState, username, text);
    }

    case 'awaitingTaskPhoto': {
      return awaitingTaskPhoto(bot, chatId, adminState, username, text);
    }

    case 'awaitingDeadlineDate': {
      return awaitingDeadlineDate(bot, chatId, adminState, username, text);
    }

    case 'awaitingManualDateInput': {
      return awaitingManualDateInput(bot, chatId, adminState, username, text);
    }

    case 'awaitingDeadlineTime': {
      return awaitingDeadlineTime(msg, bot, chatId, adminState, username, text);
    }

    case 'awaitingManualTimeInput': {
      return awaitingManualTimeInput(msg, bot, chatId, adminState, username, text);
    }

    default:
      return;
  }
}

// Функция для выполнения задачи с предложением прикрепить фото или пропустить
async function handleExecuteTask(chatId, taskId, callbackQuery) {
  try {
    const task = await Task.findById(taskId);
    if (!task) {
      return bot.sendMessage(chatId, 'Задача не найдена.');
    }

    const username = callbackQuery.from.username || 'Неизвестно';

    // Формируем сообщение с вариантами
const taskText = `📝 *Задача:* ${escapeMarkdownV2(task.title)}\n📌*Описание:* ${escapeMarkdownV2(task.description)}\n\n❓ Что хотите сделать с этой задачей?`;

    const inlineKeyboard = [
      [{ text: '📸 Прикрепить фото', callback_data: `attach_photo_${taskId}` }],
      [{ text: '❌ Пропустить', callback_data: `skip_task_${taskId}` }],
      [{ text: '🔙 Назад', callback_data: `back_to_tasks` }]
    ];

   await bot.sendMessage(chatId, taskText, {
  parse_mode: 'MarkdownV2',
  reply_markup: { inline_keyboard: inlineKeyboard }
});

  } catch (error) {
    await bot.sendMessage(chatId, '❌ Произошла ошибка.');
  }
}


module.exports = {
  handleUserCommands,
  handleExecuteTask,
  handleCompleteTask,
  handleViewTask,
  sendTasksMessage
};
