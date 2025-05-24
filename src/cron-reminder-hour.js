const cron = require('node-cron');
const { bot, formatDateTimeRu, escapeMarkdownV2, escapeMarkdownV2Username, Task, User } = require('./utils'); 
const { adminIds } = require('../constants/constants');

console.log('⏰ Планировщик задач запущен...');

cron.schedule('*/30 * * * *', async () => {
  const now = new Date();
  const hourLater = new Date(now.getTime() + 60 * 60 * 1000);

  try {
    const tasks = await Task.find({
      isCompleted: false,
      $or: [
        { status: { $ne: 'overdue' } },
        { overdueNotified: { $ne: true } }
      ]
    });

    for (let task of tasks) {
      const deadline = new Date(task.deadline);
      if (isNaN(deadline.getTime())) continue;

      const deadlineStr = formatDateTimeRu(deadline);
      const assignedUsername = Array.isArray(task.assignedTo) ? task.assignedTo[0] : task.assignedTo;

      // 🔔 Напоминание за 1 час до дедлайна
      if (deadline > now && deadline <= hourLater && !task.notified) {
        const reminderText = `⏰ Напоминание: задача *${escapeMarkdownV2(task.title)}* должна быть завершена до *${escapeMarkdownV2(deadlineStr)}*`;

        try {
          if (assignedUsername) {
            const user = await User.findOne({ username: assignedUsername });
            if (user?.telegramId) {
              await bot.sendMessage(user.telegramId, reminderText, { parse_mode: 'MarkdownV2' });
            }
          } else {
            const users = await User.find({
              $or: [
                { department: task.department },
                { subadminDepartments: task.department }
              ]
            });

            for (let user of users) {
              if (user.telegramId) {
                await bot.sendMessage(user.telegramId, reminderText, { parse_mode: 'MarkdownV2' });
              }
            }
          }

          task.notified = true;
          await task.save();
        } catch (err) {
          console.error(`Ошибка при отправке напоминания: ${err.message}`);
        }
      }

      // ❗ Просроченные задачи
      if (deadline < now && task.status !== 'overdue') {
        const completedBy = task.completedBy || {};

        if (!assignedUsername && task.department) {
          const departmentUsers = await User.find({ department: task.department, role: 'user' });
          const notCompletedUsers = departmentUsers.filter(user => !completedBy[user.username]);

          const reportText = `🔸 ${escapeMarkdownV2(task.title)}\n` +
            `📄 Описание: ${escapeMarkdownV2(task.description)}\n` +
            `🏢 Отдел: ${escapeMarkdownV2(task.department)}\n` +
            `📅 Дедлайн: ${escapeMarkdownV2(deadlineStr)}\n` +
            `👤 Назначено: всем в отделе\n` +
            notCompletedUsers.map(user => `❌ Не выполнено сотрудником ${escapeMarkdownV2Username('@' + user.username)}`).join('\n');

          for (let adminId of adminIds) {
            try {
              await bot.sendMessage(adminId, reportText, { parse_mode: 'MarkdownV2' });
            } catch (e) {
              console.error(`Ошибка отправки отчёта администратору ${adminId}: ${e.message}`);
            }
          }

          const subadmins = await User.find({ subadminDepartments: task.department });
          for (let subadmin of subadmins) {
            if (subadmin.telegramId) {
              try {
                await bot.sendMessage(subadmin.telegramId, reportText, { parse_mode: 'MarkdownV2' });
              } catch (e) {
                console.error(`Ошибка отправки отчёта сабадминистратору @${subadmin.username}: ${e.message}`);
              }
            }
          }

          for (const user of notCompletedUsers) {
            if (user.telegramId) {
              try {
                const userMsg = escapeMarkdownV2(`❗️ Вы не выполнили задачу "${task.title}" вовремя.`);
                await bot.sendMessage(user.telegramId, userMsg, { parse_mode: 'MarkdownV2' });
              } catch (e) {
                console.error(`Ошибка отправки уведомления пользователю @${user.username}: ${e.message}`);
              }
            }
          }

          task.status = 'overdue';
          task.category = 'невыполненные';
          task.overdueNotified = true;
          await task.save();
        } else if (assignedUsername) {
          const responsible = `@${assignedUsername}`;
          let departmentDisplay = '';

          if (task.department) {
            departmentDisplay = escapeMarkdownV2(task.department);
          } else if (assignedUsername) {
            const assignedUser = await User.findOne({ username: assignedUsername });

            if (assignedUser) {
              if (assignedUser.subadminDepartments && assignedUser.subadminDepartments.length > 0) {
                departmentDisplay = 'Субадмин';
              } else if (assignedUser.role === 'admin') {
                departmentDisplay = 'Админ';
              } else {
                departmentDisplay = 'Пользователь';
              }
            } else {
              departmentDisplay = 'Неизвестно';
            }
          }

          const overdueText = `❌ Задача *"${escapeMarkdownV2(task.title)}"* \\(отдел: ${departmentDisplay}\\) не выполнена пользователем: ${escapeMarkdownV2Username(responsible)}\n\nДедлайн был: *${escapeMarkdownV2(deadlineStr)}*`;

          for (let adminId of adminIds) {
            try {
              await bot.sendMessage(adminId, overdueText, { parse_mode: 'MarkdownV2' });
            } catch (e) {
              console.error(`Ошибка отправки сообщения администратору ${adminId}: ${e.message}`);
            }
          }

          const subadmins = await User.find({ subadminDepartments: task.department });
          for (let subadmin of subadmins) {
            if (subadmin.telegramId) {
              try {
                await bot.sendMessage(subadmin.telegramId, overdueText, { parse_mode: 'MarkdownV2' });
              } catch (e) {
                console.error(`Ошибка отправки сообщения сабадминистратору @${subadmin.username}: ${e.message}`);
              }
            }
          }

          const user = await User.findOne({ username: assignedUsername });
          if (user?.telegramId) {
            try {
            const userMsg = `❗️ Задача *${escapeMarkdownV2(task.title)}* не была выполнена вовремя и теперь перемещена в \\\"Мои невыполненные задачи\\\"\\.`;
              await bot.sendMessage(user.telegramId, userMsg, { parse_mode: 'MarkdownV2' });
            } catch (e) {
              console.error(`Ошибка отправки уведомления пользователю @${assignedUsername}: ${e.message}`);
            }
          }

          task.status = 'overdue';
          task.category = 'невыполненные';
          task.overdueNotified = true;
          await task.save();
        }
      }

      // 🗑 Удаление задачи через 30 дней после дедлайна
      if (deadline < now && now - deadline >= 30 * 24 * 60 * 60 * 1000) {
        await Task.deleteOne({ _id: task._id });
      }
    }
  } catch (err) {
    console.error(`Ошибка при выполнении планировщика: ${err.message}`);
  }
});
