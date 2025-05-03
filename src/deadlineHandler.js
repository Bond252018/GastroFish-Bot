require('dotenv').config();

const { subadminMenu, adminMainMenu } = require('./utils');
const Task = require('../models/taskDB');
const { adminIds } = require('../constants/constants');


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
    const deadline = new Date(year, month - 1, day, hours, minutes);
  
    if (isNaN(deadline.getTime())) {
      return bot.sendMessage(chatId, '❌ Некорректная дата или время. Попробуйте снова.');
    }
  
    adminState[username].deadline = deadline;
  
    // Сохранение задачи
    const task = new Task({
      title: adminState[username].title,
      description: adminState[username].description,
      department: adminState[username].department,
      username,
      photo: adminState[username].photo || null,
      assignedTo: adminState[username].target === 'user' ? adminState[username].targetUsername : null,
      deadline,
      status: 'pending',
      notified: false
    });
  
    await task.save();
    delete adminState[username];
    
await bot.sendMessage(chatId, `✅ Задача добавлена!
📌 Название: ${task.title}
📝 Описание: ${task.description}
📅 Дедлайн: ${deadline.toLocaleString('ru-RU')}
🏢 Отдел: ${task.department}
👤 Назначено: ${task.assignedTo ? `@${task.assignedTo}` : 'всем сотрудникам отдела'}`);
    
    
    const userId = msg.from.id;
    
    let role = adminState[userId]?.role;
    
    if (!role) {
      if (adminIds.includes(userId)) {
        role = 'admin';
      } else {
        role = 'subadmin';
      }
    }

  // Возвращаем в соответствующее главное меню в зависимости от роли
  if (role === 'admin') {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню администратора.', adminMainMenu);
  } else if (role === 'subadmin') {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню субадминистратора.', subadminMenu);
  }
}    

async function awaitingManualTimeInput(msg, bot, chatId, adminState, username, text) {
    if (!/^\d{2}:\d{2}$/.test(text)) {
      return bot.sendMessage(chatId, 'Введите время в формате ЧЧ:ММ, например: 18:00');
    }
  
    const manualDate = adminState[username].deadlineDate;
    const manualTime = text;
    const [d, m, y] = manualDate.split('.');
    const [h, min] = manualTime.split(':');
    const manualDeadline = new Date(y, m - 1, d, h, min);
  
    if (isNaN(manualDeadline.getTime())) {
      return bot.sendMessage(chatId, '❌ Некорректная дата или время. Попробуйте снова.');
    }
  
    // Сохраняем дату и время
    adminState[username].deadline = manualDeadline;
  
    // Сохраняем задачу
    const task = new Task({
      title: adminState[username].title,
      description: adminState[username].description,
      department: adminState[username].department,
      username,
      photo: adminState[username].photo || null,
      assignedTo: adminState[username].target === 'user' ? adminState[username].targetUsername : null,
      deadline: adminState[username].deadline,
      status: 'pending',
      notified: false
    });
  
    await task.save();
    delete adminState[username];
  
await bot.sendMessage(chatId, `✅ Задача добавлена!
📌 Название: ${task.title}
📝 Описание: ${task.description}
📅 Дедлайн: ${manualDeadline.toLocaleString('ru-RU')}
🏢 Отдел: ${task.department}
👤 Назначено: ${task.assignedTo ? `@${task.assignedTo}` : 'всем сотрудникам отдела'}`);
  
    const userId = msg.from.id;
    
    let role = adminState[userId]?.role;
    
    if (!role) {
      if (adminIds.includes(userId)) {
        role = 'admin';
      } else {
        role = 'subadmin';
      }
    }

  // Возвращаем в соответствующее главное меню в зависимости от роли
  if (role === 'admin') {
  await bot.sendMessage(chatId, 'Возвращаемся в главное меню администратора.', adminMainMenu);
  } else if (role === 'subadmin') {
  await bot.sendMessage(chatId, 'Возвращаемся в главное меню субадминистратора.', subadminMenu);
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
