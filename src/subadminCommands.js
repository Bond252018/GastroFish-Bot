const { bot, adminState, subadminMenu, departmentList } = require('./utils');
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

 // Получаем все подразделения, за которые субадмин отвечает
 const subadminDepartments = user.subadminDepartments; // Массив с подразделениями, за которые субадмин отвечает

  if (text === '🏠 Главное меню') {
    delete adminState[username];
    return bot.sendMessage(chatId, 'Главное меню субадмина:', subadminMenu);
  }

  if (text === '👥 Мои сотрудники') {
    try {
      // Получим всех пользователей с ролью 'user' в одном из подразделений субадмина
      const users = await User.find({ department: { $in: subadminDepartments }, role: 'user' });

      if (!users.length) {
        return bot.sendMessage(chatId, `В ваших подразделениях нет сотрудников.`, subadminMenu);
      }

      const list = users.map(u => `@${u.username}`).join('\n');
      return bot.sendMessage(chatId, `👥 Сотрудники ваших подразделений:\n\n${list}`, subadminMenu);

    } catch (err) {
      return bot.sendMessage(chatId, 'Произошла ошибка при получении списка сотрудников. Попробуйте позже.', subadminMenu);
    }
  }

  if (text === '📝 Поставить задачу') {

    adminState[username] = {
      step: 'awaitingDepartmentSelection',
      subadminDepartments,
      role: 'subadmin'
    };

    // Формируем кнопки для выбора подразделений
    const departmentButtons = subadminDepartments.map(dep => {
      const department = departmentList.find(d => d.name === dep);
      return [`${department.emoji} ${department.name}`];
    });

    departmentButtons.push(['🏠 Главное меню']);
    return bot.sendMessage(chatId, 'Выберите подразделение:', {
      reply_markup: {
        keyboard: departmentButtons,
        resize_keyboard: true
      }
    });
}

if (adminState[username]) {
    const state = adminState[username];

    switch (state.step) {
      case 'awaitingDepartmentSelection':
        const departmentEntry = departmentList.find(dep => `${dep.emoji} ${dep.name}` === text);

        if (!departmentEntry || !subadminDepartments.includes(departmentEntry.name)) {
          return bot.sendMessage(chatId, 'Выберите подразделение из списка.');
        }
        
        state.selectedDepartment = departmentEntry.name;        
    
        state.step = 'awaitingTargetAudience'; // Переходим к следующему шагу выбора аудитории

        // Запрашиваем, кому поставить задачу
        return bot.sendMessage(chatId, 'Кому поставить задачу?', {
          reply_markup: {
            keyboard: [['📢 Всем сотрудникам отдела'], ['👤 Определённому пользователю'], ['🏠 Главное меню']],
            resize_keyboard: true
          }
        });

      case 'awaitingTargetAudience':
        if (text === '📢 Всем сотрудникам отдела') {
          state.target = 'all';  // Задача будет поставлена всем сотрудникам отдела
          state.step = 'awaitingTaskTitle';
          return bot.sendMessage(chatId, 'Введите название задачи.');
        }

        if (text === '👤 Определённому пользователю') {
          // Получаем список пользователей выбранного подразделения
          const users = await User.find({ department: state.selectedDepartment, role: 'user' });

          if (!users.length) {
            return bot.sendMessage(chatId, 'В выбранном отделе нет сотрудников.', subadminMenu);
          }

          const buttons = users.map(u => [`@${u.username}`]);
          buttons.push(['🏠 Главное меню']);

          state.target = 'user';  // Задача будет поставлена конкретному пользователю
          state.step = 'awaitingTargetUsername';

          return bot.sendMessage(chatId, 'Выберите пользователя:', {
            reply_markup: { keyboard: buttons, resize_keyboard: true }
          });
        }
        break;
    
  
      case 'awaitingTargetUsername':
        const targetUsername = text.startsWith('@') ? text.slice(1) : text;  // Извлекаем username пользователя
        const selectedUser = await User.findOne({ username: targetUsername });
  
        if (!selectedUser || selectedUser.department !== state.selectedDepartment) {
          return bot.sendMessage(chatId, 'Пользователь не найден в выбранном подразделении. Выберите другого.', {
            reply_markup: { keyboard: [['🏠 Главное меню']], resize_keyboard: true }
          });
        }
  
        // Записываем пользователя, которому будет поставлена задача
        state.targetUsername = selectedUser.username;
        state.step = 'awaitingTaskTitle';
        return bot.sendMessage(chatId, 'Введите название задачи.');
  
      case 'awaitingTaskTitle':
        state.title = text;  // Сохраняем название задачи
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
