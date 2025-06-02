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

const {
  handleUserCommands
} = require('./userCommands');  

const { handleAddUserFlow } = require('./addUserFlow');

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
    // Получаем всех пользователей с ролью 'user' в подразделениях субадмина
    const users = await User.find({
      department: { $in: subadminDepartments },
      role: 'user'
    });

    if (!users.length) {
      return bot.sendMessage(chatId, `В ваших подразделениях нет сотрудников.`, subadminMenu);
    }

    const list = users
      .map(u => `@${u.username} — ${u.department}`)
      .join('\n');

    return bot.sendMessage(
      chatId,
      `👥 Сотрудники ваших подразделений:\n\n${list}`,
      subadminMenu
    );

  } catch (err) {
    console.error('Ошибка при получении списка сотрудников:', err);
    return bot.sendMessage(chatId, 'Произошла ошибка при получении списка сотрудников. Попробуйте позже.', subadminMenu);
  }
}

 // Обработка кнопки "📝 Поставить задачу"
if (text === '📝 Поставить задачу') {
  adminState[username] = {
    step: 'awaitingTarget',
    subadminDepartments,
    role: 'subadmin'
  };

  return bot.sendMessage(chatId, 'Кому поставить задачу?', {
    reply_markup: {
      keyboard: [
        ['📋 Подразделению', '👤 Администратору'],
        ['🏠 Главное меню']
      ],
      resize_keyboard: true
    }
  });
}

// 👉 Подразделению
if (adminState[username]?.step === 'awaitingTarget' && text === '📋 Подразделению') {
  const state = adminState[username];
  state.step = 'awaitingDepartmentSelection';

  const departmentButtons = state.subadminDepartments.map(dep => {
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

// 👉 Администратору
if (adminState[username]?.step === 'awaitingTarget' && text === '👤 Администратору') {
  const currentId = msg.from.id.toString();

  const otherAdmins = await User.find({
    role: 'admin'
  });

  if (!otherAdmins.length) {
    return bot.sendMessage(chatId, 'Нет доступных администраторов.');
  }

  adminState[username].step = 'awaitingAdmin';

  return bot.sendMessage(chatId, 'Выберите администратора:', {
    reply_markup: {
      keyboard: [
        ...otherAdmins.map(admin => [`@${admin.username}`]),
        ['🏠 Главное меню']
      ],
      resize_keyboard: true
    }
  });
}

// 🧍 Обработка выбранного администратора
if (adminState[username]?.step === 'awaitingAdmin') {
  const targetUsername = text.replace('@', '').trim();

  const targetAdmin = await User.findOne({
    username: targetUsername,
    role: 'admin'
  });

  if (!targetAdmin) {
    return bot.sendMessage(chatId, 'Администратор не найден.');
  }

  adminState[username].target = 'admin';
  adminState[username].targetUsername = targetAdmin.username;
  adminState[username].targetTelegramId = targetAdmin.telegramId;
  adminState[username].step = 'awaitingTaskTitle';

  return bot.sendMessage(chatId, `Введите название задачи для администратора @${targetAdmin.username}:`);
}

if (text === '📥 Добавить пользователя') {
  adminState[username] = { step: 'awaitingUsername', role: 'subadmin' };
  return bot.sendMessage(chatId, 'Введите username нового пользователя (в формате @username).');
}

if (adminState[username]) {
  const state = adminState[username];

  // Пробуем обработать добавление пользователя
  const result = await handleAddUserFlow(bot, msg, adminState);

  // Если это была логика добавления — и она завершилась
  if (result?.success && state.step === 'awaitingDepartmentForNewUserByUsername') {
    await bot.sendMessage(chatId, 'Возвращаемся в главное меню субадминистратора.', subadminMenu);
    return;
  }

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
          // Получаем всех сотрудников отдела, исключая текущего субадмина
          const users = await User.find({
            department: state.selectedDepartment,
            role: 'user',
            username: { $ne: username }  // Исключаем по username
          });

          if (!users.length) {
            return bot.sendMessage(chatId, 'В отделе нет других сотрудников, кроме вас.', subadminMenu);
          }

          state.target = 'all';
          state.recipients = users.map(u => u.telegramId);  // Сохраняем получателей
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
     return;
  }
  await handleUserCommands(msg, text, username);
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
