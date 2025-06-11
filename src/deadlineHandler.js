require('dotenv').config();

const { subadminMenu, adminMainMenu, userMenu, User } = require('./utils');
const Task = require('../models/taskDB');
const { adminIds } = require('../constants/constants');

function convertUkraineLocalToUTC(year, month, day, hours, minutes) {
  const localDate = new Date(Date.UTC(year, month, day, hours, minutes));
  const uaTimeZone = 'Europe/Kyiv';
  const tzOffsetMinutes = -new Date(localDate.toLocaleString('en-US', { timeZone: uaTimeZone })).getTimezoneOffset();
  const utcDate = new Date(Date.UTC(year, month, day, hours, minutes));
  utcDate.setMinutes(utcDate.getMinutes() - tzOffsetMinutes);
  return utcDate;
}

// Функция для отправки сообщения с клавиатурой
function sendKeyboard(bot, chatId, message, keyboard) {
  return bot.sendMessage(chatId, message, {
    reply_markup: { keyboard: keyboard, resize_keyboard: true }
  });
}

// Логика для шага "awaitingTaskDescription"
async function awaitingTaskDescription(bot, chatId, adminState, username, text) {
    
    // Проверяем, если username не был передан или пуст, выводим ошибку
    if (!username) {
      if (bot && typeof bot.sendMessage === 'function') {
        return bot.sendMessage(chatId, 'Ошибка: не удалось получить ваш username.');
      } else {
        return;  // Выход из функции, если bot не поддерживает sendMessage
      }
    }
  
    // Проверяем, существует ли adminState[username], и инициализируем его, если нужно
    if (!adminState[username]) {
      adminState[username] = {
        description: '',
        step: '',
        title: '',
        department: '',
        photo: null,
        deadlineDate: '',
        deadline: null,
        target: '',
        targetUsername: null
      };
    }
  
    // Устанавливаем описание и шаг для текущего пользователя
    adminState[username].description = text;
    adminState[username].step = 'awaitingTaskPhoto';
  
    // Возвращаем клавиатуру с шагами
    return sendKeyboard(bot, chatId, 'Прикрепите фото к задаче (или пропустите этот шаг).', [
      ['🚫 Пропустить', '📸 Прикрепить фото'],
      ['🏠 Главное меню']
    ]);
}

// Логика для шага "awaitingTaskPhoto"
async function awaitingTaskPhoto(bot, chatId, adminState, username, text) {
  if (text === '🚫 Пропустить') {
    adminState[username].step = 'awaitingDeadlineDate';
    const dateOptions = [];
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      dateOptions.push([dateStr]);
    }
    dateOptions.push(['⌨️ Ввести вручную']);
    dateOptions.push(['🏠 Главное меню']);
    return sendKeyboard(bot, chatId, 'Выберите дату дедлайна или введите вручную:', dateOptions);
  }

  if (text === '📸 Прикрепить фото') {
    adminState[username].step = 'awaitingPhotoUpload';
    return bot.sendMessage(chatId, 'Отправьте фото задачи.');
  }
}

// Логика для шага "awaitingDeadlineDate"
async function awaitingDeadlineDate(bot, chatId, adminState, username, text) {
  if (text === '⌨️ Ввести вручную') {
    adminState[username].step = 'awaitingManualDateInput';
    return bot.sendMessage(chatId, 'Введите дату вручную в формате ДД.ММ.ГГГГ, например: 22.04.2025');
  }

  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    return bot.sendMessage(chatId, 'Введите дату в формате ДД.ММ.ГГГГ или выберите из списка.');
  }
  
  adminState[username].deadlineDate = text;
  adminState[username].step = 'awaitingDeadlineTime';
  return sendKeyboard(bot, chatId, 'Теперь выберите время дедлайна:', [
    ['09:00', '12:00'],
    ['15:00', '18:00'],
    ['21:00', '⌨️ Ввести вручную'],
    ['🏠 Главное меню']
  ]);
}

// Логика для шага "awaitingManualDateInput"
async function awaitingManualDateInput(bot, chatId, adminState, username, text) {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    return bot.sendMessage(chatId, 'Неверный формат. Введите дату в формате ДД.ММ.ГГГГ');
  }

   const [day, month, year] = text.split('.').map(Number);
  const enteredDate = new Date(year, month - 1, day);  
  enteredDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (enteredDate < today) {
    return bot.sendMessage(chatId, 'Эта дата уже прошла. Пожалуйста, введите сегодняшнюю или будущую дату.');
  }

  adminState[username].deadlineDate = text;
  adminState[username].step = 'awaitingDeadlineTime';
  return sendKeyboard(bot, chatId, 'Теперь выберите время дедлайна:', [
    ['09:00', '12:00'],
    ['15:00', '18:00'],
    ['21:00', '⌨️ Ввести вручную'],
    ['🏠 Главное меню']
  ]);
}

// Логика для шага "awaitingDeadlineTime"
async function awaitingDeadlineTime(msg, bot, chatId, adminState, username, text) {
    if (text === '⌨️ Ввести вручную') {
      adminState[username].step = 'awaitingManualTimeInput';
      return bot.sendMessage(chatId, 'Введите время вручную в формате ЧЧ:ММ, например: 18:00');
    }
  
    if (!/^\d{2}:\d{2}$/.test(text)) {
      return bot.sendMessage(chatId, 'Введите время в формате ЧЧ:ММ, например: 18:00');
    }
  
    const datePart = adminState[username].deadlineDate;
    const timePart = text;
    const [day, month, year] = datePart.split('.');
    const [hours, minutes] = timePart.split(':');
    const deadline = convertUkraineLocalToUTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
  
 // Проверяем, что дата и время не в прошлом
    const currentTime = new Date();
    if (deadline < currentTime) {
      return bot.sendMessage(chatId, '❌ Дедлайн не может быть в прошлом. Попробуйте выбрать другую дату и время.');
    }

    if (isNaN(deadline.getTime())) {
      return bot.sendMessage(chatId, '❌ Некорректная дата или время. Попробуйте снова.');
    }

    adminState[username].deadline = deadline;

if (adminState[username].target === 'user' || adminState[username].target === 'admin') {
      // Задача для одного конкретного пользователя
      const task = new Task({
        title: adminState[username].title,
        description: adminState[username].description,
        department: adminState[username].selectedDepartment || adminState[username].department,
        username,
        photo: adminState[username].photo || null,
        assignedTo: adminState[username].targetUsername,
        deadline,
        status: 'pending',
        notified: false
      });
    
      await task.save();
     // Получаем данные о цели назначения задачи
      const targetDisplay = adminState[username].target === 'admin' ? 'администратора' : 'пользователя';
      const assignedTo = adminState[username].targetUsername; // Username пользователя
      const targetTelegramId = adminState[username].targetTelegramId; // Telegram ID

      // Проверяем, что у нас есть Telegram ID или Username для отправки
      let targetChatId = null;

      // Если есть Telegram ID, отправляем через него
      if (targetTelegramId) {
        targetChatId = targetTelegramId;
      } 
      // Если нет Telegram ID, но есть Username, ищем chatId по username
      else if (assignedTo) {
        const recipient = await User.findOne({ username: assignedTo });

        if (!recipient || !recipient.telegramId) {
          console.error('❌ Не найден пользователь или у него нет Telegram ID');
          await bot.sendMessage(chatId, 'Ошибка: не удалось отправить задачу — Telegram ID пользователя не найден.');
          return;
        }

        targetChatId = recipient.telegramId;
      } else {
        console.error('❌ Не найден ни Telegram ID, ни Username для назначения задачи.');
        await bot.sendMessage(chatId, 'Ошибка: не найден пользователь для назначения задачи.');
        return;
      }

        // Уведомляем исполнителя
        await bot.sendMessage(
          targetChatId,
         `📬 Вам назначена новая задача:\n\n📌 Название: ${task.title}\n📝 Описание: ${task.description}\n📅 Дедлайн: ${task.deadline.toLocaleString('ru-RU')}\n\nℹ️ Для просмотра и выполнения задачи зайдите в раздел «Мои задачи» в меню.`
        );

        // Подтверждение отправителю
        await bot.sendMessage(
          chatId,
          `✅ Задача добавлена для ${targetDisplay} @${assignedTo}\n\n📌 Название: ${task.title}\n📝 Описание: ${task.description}\n📅 Дедлайн: ${task.deadline.toLocaleString('ru-RU')}\n🏢 Отдел: ${task.department}\n`
        );

        delete adminState[username]; // ✅ Сброс шага


     } else {
      // Задача для всех в отделе
        // Для администратора или субадмина
        let departmentToUse;

        if (adminState[username].subadminDepartments && adminState[username].subadminDepartments.length > 0) {
          // Если это субадмин, берем департамент из selectedDepartment, если он есть
          departmentToUse = adminState[username].selectedDepartment || adminState[username].subadminDepartments[0]; // Берем первый департамент из списка
        } else {
          // Если это админ, берем департамент из selectedDepartment или department
          departmentToUse = adminState[username].selectedDepartment || adminState[username].department;
        }

        // Запрос пользователей на основе выбранного департамента
          let departmentUsers = await User.find({
            $or: [
              { department: departmentToUse }, // Обычные пользователи в департаменте
              { subadminDepartments: departmentToUse } // Субадмины в департаменте
            ]
          });   
          
          departmentUsers = departmentUsers.filter(user => user.username !== username);
          

        // Массив для сохранения задач
        const tasksToSend = [];
        const assignedUsers = []; // Массив для хранения ников пользователей, которым назначены задачи

        // Перебираем пользователей 
        for (const user of departmentUsers) {
        
          // Создаем задачу для остальных пользователей
          const task = new Task({
            title: adminState[username].title, // Название задачи
            description: adminState[username].description, // Описание задачи
            department: departmentToUse, // Выбранный департамент
            username, // Название пользователя
            photo: adminState[username].photo || null, // Фото (если есть)
            assignedTo: user.username, // Пользователь, которому назначается задача
            deadline, // Дедлайн задачи
            status: 'pending', // Статус задачи
            notified: false // Не уведомлено
          });

          // Сохраняем задачу
          await task.save();

          // Добавляем задачу в массив для дальнейшей отправки
          tasksToSend.push(task);
          
          // Добавляем ник пользователя в массив assignedUsers
          assignedUsers.push(user.username);

          // Уведомляем пользователя, если у него есть Telegram ID
          if (user.telegramId) {
           await bot.sendMessage(
            user.telegramId,
            `📬 Вам назначена новая задача:\n\n📌 Название: ${task.title}\n📝 Описание: ${task.description}\n📅 Дедлайн: ${task.deadline.toLocaleString('ru-RU')}\n\nℹ️ Для просмотра и выполнения задачи зайдите в раздел «Мои задачи» в меню.`
          );
          } else {
            console.warn(`⚠️ Пользователь ${user.username} не имеет telegramId`);
          }
        }
        // После сохранения всех задач отправляем информацию
        if (departmentUsers.length > 0) {
          const task = tasksToSend[0]; // Берем первую задачу для отправки данных
          await bot.sendMessage(chatId, `✅ Задача добавлена для сотрудников отдела ${departmentToUse} (${tasksToSend.length} человек)\n\n📌 Название: ${task.title}\n📝 Описание: ${task.description}\n📅 Дедлайн: ${task.deadline.toLocaleString('ru-RU')}\n🏢 Отдел: ${task.department}\n\n📝 Задача назначена пользователям: ${assignedUsers.join(', ')}`);
        } else {
          await bot.sendMessage(chatId, `В выбранном департаменте (${departmentToUse}) нет сотрудников для назначения задачи.`);
        }
      }
      
        delete adminState[username]; // ✅ Сброс шага

  const userId = msg.from.id;
  const user = await User.findOne({ username });

  let role = null;

  // 1. По базе данных
  if (user && user.role) {
    role = user.role;
  }

  // 2. Если в базе нет — проверим по adminState
  if (!role) {
    if (adminState[username]?.role) {
      role = adminState[username].role;
    } else if (adminState[userId]?.role) {
      role = adminState[userId].role;
    }
  }

  // 3. Если всё ещё нет — по списку adminIds
  if (!role) {
    if (adminIds.includes(userId)) {
      role = 'admin';
    } else if (user && user.subadminDepartments?.length) {
      // Если есть департаменты — это субадмин
      role = 'subadmin';
    } else {
      role = 'user';
    }
  }

  // 4. Отправка меню по роли
  if (role === 'admin') {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню администратора.', adminMainMenu);
  } else if (role === 'subadmin') {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню субадминистратора.', subadminMenu);
  } else {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню пользователя.', userMenu);
  }
}   

async function awaitingManualTimeInput(msg, bot, chatId, adminState, username, text) {
    if (!/^\d{2}:\d{2}$/.test(text)) {
      return bot.sendMessage(chatId, 'Введите время в формате ЧЧ:ММ, например: 18:00');
    }
  
  const manualDate = adminState[username].deadlineDate; // дата в формате 'дд.мм.гггг'
  const manualTime = text; // время в формате 'чч:мм'

  // Преобразуем дату и время в числа
  const [d, m, y] = manualDate.split('.').map(Number);
  const [h, min] = manualTime.split(':').map(Number);

  // Конвертируем в UTC
  const manualDeadline = convertUkraineLocalToUTC(y, m - 1, d, h, min);

    // Проверяем, что дата и время не в прошлом
      const currentTime = new Date();
      if (manualDeadline < currentTime) {
        return bot.sendMessage(chatId, '❌ Дедлайн не может быть в прошлом. Попробуйте выбрать другую дату и время.');
      }

  if (isNaN(manualDeadline.getTime())) {
    return bot.sendMessage(chatId, '❌ Некорректная дата или время. Попробуйте снова.');
  }
  
    // Сохраняем дату и время
    adminState[username].deadline = manualDeadline;
  
    if (adminState[username].target === 'user' || adminState[username].target === 'admin') {
      // Задача для одного конкретного пользователя
      const task = new Task({
        title: adminState[username].title,
        description: adminState[username].description,
        department: adminState[username].selectedDepartment || adminState[username].department,
        username,
        photo: adminState[username].photo || null,
        assignedTo: adminState[username].targetUsername,
        deadline: manualDeadline,
        status: 'pending',
        notified: false
      });
    
      await task.save();
     // Получаем данные о цели назначения задачи
      const targetDisplay = adminState[username].target === 'admin' ? 'администратора' : 'пользователя';
      const assignedTo = adminState[username].targetUsername; // Username пользователя
      const targetTelegramId = adminState[username].targetTelegramId; // Telegram ID

      // Проверяем, что у нас есть Telegram ID или Username для отправки
      let targetChatId = null;

      // Если есть Telegram ID, отправляем через него
      if (targetTelegramId) {
        targetChatId = targetTelegramId;
      } 
      // Если нет Telegram ID, но есть Username, ищем chatId по username
      else if (assignedTo) {
        const recipient = await User.findOne({ username: assignedTo });

        if (!recipient || !recipient.telegramId) {
          console.error('❌ Не найден пользователь или у него нет Telegram ID');
          await bot.sendMessage(chatId, 'Ошибка: не удалось отправить задачу — Telegram ID пользователя не найден.');
          return;
        }

        targetChatId = recipient.telegramId;
      } else {
        console.error('❌ Не найден ни Telegram ID, ни Username для назначения задачи.');
        await bot.sendMessage(chatId, 'Ошибка: не найден пользователь для назначения задачи.');
        return;
      }

        // Уведомляем исполнителя
        await bot.sendMessage(
          targetChatId,
         `📬 Вам назначена новая задача:\n\n📌 Название: ${task.title}\n📝 Описание: ${task.description}\n📅 Дедлайн: ${task.deadline.toLocaleString('ru-RU')}\n\nℹ️ Для просмотра и выполнения задачи зайдите в раздел «Мои задачи» в меню.`
        );

        // Подтверждение отправителю
        await bot.sendMessage(
          chatId,
          `✅ Задача добавлена для ${targetDisplay} @${assignedTo}\n\n📌 Название: ${task.title}\n📝 Описание: ${task.description}\n📅 Дедлайн: ${task.deadline.toLocaleString('ru-RU')}\n🏢 Отдел: ${task.department}\n`
        );

        delete adminState[username]; // ✅ Сброс шага
 
     } else {
      // Задача для всех в отделе
        // Для администратора или субадмина
        let departmentToUse;

        if (adminState[username].subadminDepartments && adminState[username].subadminDepartments.length > 0) {
          // Если это субадмин, берем департамент из selectedDepartment, если он есть
          departmentToUse = adminState[username].selectedDepartment || adminState[username].subadminDepartments[0]; // Берем первый департамент из списка
        } else {
          // Если это админ, берем департамент из selectedDepartment или department
          departmentToUse = adminState[username].selectedDepartment || adminState[username].department;
        }

        // Запрос пользователей на основе выбранного департамента
          let departmentUsers = await User.find({
            $or: [
              { department: departmentToUse }, // Обычные пользователи в департаменте
              { subadminDepartments: departmentToUse } // Субадмины в департаменте
            ]
          });   
               
        const tasksToSend = [];
        const assignedUsers = [];  

         for (const user of departmentUsers) {
          const task = new Task({
            title: adminState[username].title,  
            description: adminState[username].description, 
            department: departmentToUse,  
            username,  
            photo: adminState[username].photo || null,  
            assignedTo: user.username,  
            deadline: manualDeadline,
            status: 'pending',  
            notified: false  
          });

          // Сохраняем задачу
          await task.save();

          // Добавляем задачу в массив для дальнейшей отправки
          tasksToSend.push(task);
          
          // Добавляем ник пользователя в массив assignedUsers
          assignedUsers.push(user.username);

          // Уведомляем пользователя, если у него есть Telegram ID
          if (user.telegramId) {
           await bot.sendMessage(
            user.telegramId,
            `📬 Вам назначена новая задача:\n\n📌 Название: ${task.title}\n📝 Описание: ${task.description}\n📅 Дедлайн: ${task.deadline.toLocaleString('ru-RU')}\n\nℹ️ Для просмотра и выполнения задачи зайдите в раздел «Мои задачи» в меню.`
          );
          } else {
            console.warn(`⚠️ Пользователь ${user.username} не имеет telegramId`);
          }
        }

        // После сохранения всех задач отправляем информацию
        if (departmentUsers.length > 0) {
          const task = tasksToSend[0]; // Берем первую задачу для отправки данных
          await bot.sendMessage(chatId, `✅ Задача добавлена для сотрудников отдела ${departmentToUse} (${tasksToSend.length} человек)\n\n📌 Название: ${task.title}\n📝 Описание: ${task.description}\n📅 Дедлайн: ${task.deadline.toLocaleString('ru-RU')}\n🏢 Отдел: ${task.department}\n\n📝 Задача назначена пользователям: ${assignedUsers.join(', ')}`);
        } else {
          await bot.sendMessage(chatId, `В выбранном департаменте (${departmentToUse}) нет сотрудников для назначения задачи.`);
        }
      }
    
  const userId = msg.from.id;
  const user = await User.findOne({ username });

  let role = null;

  // 1. По базе данных
  if (user && user.role) {
    role = user.role;
  }

  // 2. Если в базе нет — проверим по adminState
  if (!role) {
    if (adminState[username]?.role) {
      role = adminState[username].role;
    } else if (adminState[userId]?.role) {
      role = adminState[userId].role;
    }
  }

  // 3. Если всё ещё нет — по списку adminIds
  if (!role) {
    if (adminIds.includes(userId)) {
      role = 'admin';
    } else if (user && user.subadminDepartments?.length) {
      // Если есть департаменты — это субадмин
      role = 'subadmin';
    } else {
      role = 'user';
    }
  }

  // 4. Отправка меню по роли
  if (role === 'admin') {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню администратора.', adminMainMenu);
  } else if (role === 'subadmin') {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню субадминистратора.', subadminMenu);
  } else {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню пользователя.', userMenu);
  }
}

module.exports = {
  awaitingTaskDescription,
  awaitingTaskPhoto,
  awaitingDeadlineDate,
  awaitingManualDateInput,
  awaitingDeadlineTime,
  awaitingManualTimeInput
};
