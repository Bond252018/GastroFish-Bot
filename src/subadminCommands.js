const { bot, getKeyboard, adminState, subadminMenu, departmentList } = require('./utils');
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
    role: 'subadmin',
  };

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
     case 'awaitingDepartment':
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

              // Ищем пользователей и субадминов в выбранном департаменте, исключая самого субадмина
    const users = await User.find({
      $and: [
        {
          $or: [
            { department: department },
            { subadminDepartments: department }
          ]
        },
        { username: { $ne: username } }  // исключаем самого себя
      ],
      role: { $in: ['user', 'subadmin'] } // учитываем роли (если нужно)
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

// Завершение задачи
async function completeTask(taskId) {
  const task = await Task.findById(taskId);
  if (!task) return;

  task.status = 'completed';
  await task.save();

  await notifySubadminOnTaskCompletion(task); // Уведомление субадмина
}

module.exports = { handleSubadminCommands, completeTask };
