require('dotenv').config();  // Загружаем переменные из .env

const { notifyCreatorOnTaskCompletion } = require('./notifications'); 
const { bot, formatDateTimeRu, User, Task } = require('./utils');
const { adminIds } = require('../constants/constants');


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
    if (task) {
      const department = task.department || "Не указано";
      const deadline = task.deadline ? new Date(task.deadline) : null;

      const formattedDeadline = deadline 
        ? `${deadline.toLocaleDateString('ru-RU')} ${deadline.toLocaleTimeString('ru-RU')}` 
        : 'Без дедлайна';

      // Добавляем информацию о дедлайне в текст задачи
      const taskText = `📝 *Задача:* ${task.title}\n📌 *Описание:* ${task.description}\n🏢 *Подразделение:* ${department}\n📅 *Дедлайн:* ${formattedDeadline}\n\n✅ Чтобы выполнить, нажмите кнопку ниже:`;

      const inlineKeyboard = [
        [{ text: '✅ Выполнить', callback_data: `complete_task_${taskId}` }],
        [{ text: '🔙 Назад', callback_data: `back_to_tasks` }]
      ];

      if (task.photo) {
        await bot.deleteMessage(chatId, messageId).catch((err) => {
          console.warn('Не удалось удалить старое сообщение:', err.message);
        });

        await bot.sendPhoto(chatId, task.photo, {
          caption: taskText,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });
      } else {
        await bot.editMessageText(taskText, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });
      }
    } else {
      await bot.sendMessage(chatId, '❌ Задача не найдена.');
    }
  } catch (error) {
    console.error("Ошибка при обработке callback запроса:", error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке запроса.');
  }
}

// Функция для завершения задачи
async function handleCompleteTask(chatId, taskId, callbackQuery) {
  try {
    const task = await Task.findById(taskId);
    if (!task) {
      console.log(`Задача с ID ${taskId} не найдена`);
      return bot.sendMessage(chatId, 'Задача не найдена.');
    }

    const username = callbackQuery.from.username || 'Неизвестно';

    if (!username || username === 'Неизвестно') {
      console.warn('Не удалось получить username, используется значение по умолчанию.');
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
      task.completedAt = new Date(); // Устанавливаем дату завершения
    }

    await task.save();

    console.log(`Задача "${task.title}" завершена пользователем ${username}`);

    // Уведомляем администратора о завершении задачи
    await notifyCreatorOnTaskCompletion(task);

    // Удаляем сообщение с задачей
    if (task.messageId) {
      await bot.deleteMessage(chatId, task.messageId).catch((err) => {
        console.warn('❌ Не удалось удалить сообщение с задачей:', err.message);
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
    console.error('Ошибка при завершении задачи:', error);
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
        console.warn('❌ Не удалось удалить сообщение с задачей:', err.message);
      });
    }

  } catch (error) {
    console.error('Ошибка при завершении задачи с фото:', error);
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
    // Получаем только незавершённые задачи, назначенные этому пользователю
    const userTasks = await Task.find({ 
      assignedTo: username, // Задачи только для этого пользователя
      isCompleted: false 
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
console.error('Ошибка при обработке callback запроса:', error);
await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке запроса.');
}
});

 // Обработчик команды "📋 Мои задачи"
async function handleUserCommands(msg, text, username) {
  const chatId = msg.chat.id;

  // Обработчик команды "📋 Мои задачи"
  if (text === '📋 Мои задачи' && !adminIds.includes(msg.from.id)) {
    try {
      const user = await User.findOne({ username: username });
      if (!user) {
        return bot.sendMessage(chatId, 'Ваши данные не найдены в системе.');
      }

      console.log(`Пользователь ${username} найден, ищем его задачи...`);

      // Получаем задачи пользователя, включая просроченные
      const userTasks = await Task.find({
        assignedTo: username,
        isCompleted: false,
        $or: [{ status: { $ne: 'overdue' } }] // Исключаем просроченные задачи
      });

      if (userTasks.length > 0) {
        await sendTasksMessage(chatId, userTasks);
      } else {
        await bot.sendMessage(chatId, 'У вас нет незавершённых задач.');
      }
    } catch (error) {
      console.error("Ошибка при получении задач:", error);
      await bot.sendMessage(chatId, 'Произошла ошибка при обработке вашего запроса.');
    }
  }

  // Обработчик команды "📋 Мои невыполненные задачи"
  if (text === '📋 Мои невыполненные задачи') {
    try {
      const user = await User.findOne({ username: username });
      if (!user) {
        return bot.sendMessage(chatId, '❌ Не удалось найти информацию о вашем пользователе.');
      }

      console.log(`Пользователь ${username} запрашивает невыполненные задачи...`);

      // Получаем время для фильтрации задач за последние 24 часа
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Ищем невыполненные задачи, созданные за последние 24 часа
      const tasks = await Task.find({
        assignedTo: user.username,
        isCompleted: false,
        createdAt: { $gte: oneDayAgo }  // Только задачи, созданные за последние сутки
      });

      if (tasks.length === 0) {
        return bot.sendMessage(chatId, '📋 У вас нет невыполненных задач за последние 24 часа.');
      }

      let taskList = '📋 *Мои невыполненные задачи (за сутки):*\n';
      tasks.forEach(task => {
        const deadlineStr = formatDateTimeRu(new Date(task.deadline));
        taskList += `- ${task.title} (🕒 ${deadlineStr})\n`;
      });
      await bot.sendMessage(chatId, taskList, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error("Ошибка при получении задач:", error);
      await bot.sendMessage(chatId, 'Произошла ошибка при обработке вашего запроса.');
    }
  }

  // Обработчик команды "📂 Задачи отдела"
  if (text === '📂 Задачи отдела' && !adminIds.includes(msg.from.id)) {
    try {
      const user = await User.findOne({ username: username });
      if (!user) {
        return bot.sendMessage(chatId, 'Ваши данные не найдены в системе.');
      }

      console.log(`Пользователь ${username} запрашивает задачи отдела (${user.department})`);

      // Получаем задачи отдела, исключая те, которые назначены текущему пользователю
      const departmentTasks = await Task.find({
        department: user.department,  // Фильтруем по отделу
        isCompleted: false,           // Только незавершенные задачи
        assignedTo: { $nin: [user.username] },  // Исключаем задачи, назначенные пользователю
        status: { $ne: 'overdue' },   // Исключаем просроченные задачи
        $or: [
          { assignedTo: { $exists: false } },  // Задачи без назначения
          { assignedTo: null }  // Задачи, которые не назначены никому
        ]
      });

      if (departmentTasks.length > 0) {
        await sendTasksMessage(chatId, departmentTasks);
      } else {
        await bot.sendMessage(chatId, 'В вашем отделе нет незавершённых задач.');
      }
    } catch (error) {
      console.error("Ошибка при получении задач отдела:", error);
      await bot.sendMessage(chatId, 'Произошла ошибка при обработке запроса.');
    }
  }

  // Обработчик команды "📂 Невыполненные задачи отдела"
  if (text === '📂 Невыполненные задачи отдела') {
    try {
      const user = await User.findOne({ username: username });
      if (!user) {
        return bot.sendMessage(chatId, '❌ Не удалось найти информацию о вашем пользователе.');
      }

      const department = user.department;
      if (!department) {
        return bot.sendMessage(chatId, '❌ Вы не назначены в отдел.');
      }

      // Получаем время для фильтрации задач за последние 24 часа
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Ищем невыполненные задачи для отдела, которые не назначены пользователю, созданные за последние 24 часа
      const tasks = await Task.find({
        department,
        isCompleted: false,
        createdAt: { $gte: oneDayAgo }, // Только задачи, созданные за последние сутки
        assignedTo: { $ne: user.username }, // Исключаем задачи, назначенные на текущего пользователя
        $or: [
          { assignedTo: { $in: [null] } },     // Задачи, не назначенные никому
          { assignedTo: { $exists: false } }    // Задачи без назначения
        ]
      });

      if (tasks.length === 0) {
        return bot.sendMessage(chatId, '📂 В вашем отделе нет _групповых_ невыполненных задач за последние сутки.');
      }

      let taskList = '📂 *Невыполненные задачи отдела (за сутки):*\n';
      tasks.forEach(task => {
        const deadlineStr = formatDateTimeRu(new Date(task.deadline));
        taskList += `- ${task.title} (🕒 ${deadlineStr})\n`;
      });
      await bot.sendMessage(chatId, taskList, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error("Ошибка при получении невыполненных задач отдела:", error);
      await bot.sendMessage(chatId, 'Произошла ошибка при обработке запроса.');
    }
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
    const taskText = `📝 *Задача:* ${task.title}\n📌 *Описание:* ${task.description}\n\n❓ Что хотите сделать с этой задачей?`;

    const inlineKeyboard = [
      [{ text: '📸 Прикрепить фото', callback_data: `attach_photo_${taskId}` }],
      [{ text: '❌ Пропустить', callback_data: `skip_task_${taskId}` }],
      [{ text: '🔙 Назад', callback_data: `back_to_tasks` }]
    ];

    await bot.sendMessage(chatId, taskText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  } catch (error) {
    console.error('Ошибка при обработке выполнения задачи:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка.');
  }
}

module.exports = { handleUserCommands };