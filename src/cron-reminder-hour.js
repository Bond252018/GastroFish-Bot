const cron = require('node-cron');
const { bot, formatDateTimeRu, escapeMarkdownV2, escapeMarkdownV2Username, Task, User } = require('./utils'); 
const { adminIds } = require('../constants/constants');

console.log('⏰ Планировщик задач запущен...');

cron.schedule('*/5 * * * *', async () => {
  const now = new Date();
  const hourLater = new Date(now.getTime() + 60 * 60 * 1000);

  try {
    const tasks = await Task.find({ isCompleted: false }); // Получаем все незавершенные задачи

    for (let task of tasks) {
      const deadline = new Date(task.deadline);

      if (isNaN(deadline.getTime())) {
        continue;
      }

      const deadlineStr = formatDateTimeRu(deadline);

      // 🔔 Напоминание за 1 час до дедлайна
      if (deadline > now && deadline <= hourLater && !task.notified) {
const reminderText = `⏰ Напоминание: задача *${escapeMarkdownV2(task.title)}* должна быть завершена до *${escapeMarkdownV2(deadlineStr)}*`;

        try {
          if (task.assignedTo) {
            // Назначено конкретному пользователю (независимо от роли)
            const user = await User.findOne({ username: task.assignedTo });
            if (user?.telegramId) {
              await bot.sendMessage(user.telegramId, reminderText, { parse_mode: 'MarkdownV2' });
            }
          } else {
            // Назначено всем сотрудникам или субадминам департамента
            const department = task.department;
            const users = await User.find({
              $or: [
                { department: department },           // обычные пользователи департамента
                { subadminDepartments: department }    // субадмины, которые ответственны за департамент
              ]
            });

            for (let user of users) {
              if (!user.telegramId) continue;
              await bot.sendMessage(user.telegramId, reminderText, { parse_mode: 'MarkdownV2' });
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
        if (!task.assignedTo && task.department) {
          const completedBy = task.completedBy || {};
          const departmentUsers = await User.find({ department: task.department, role: 'user' });

          const notCompletedUsers = departmentUsers.filter(user => !completedBy[user.username]);

      const reportText = `🔸 ${escapeMarkdownV2(task.title)}\n` +
  `📄 Описание: ${escapeMarkdownV2(task.description)}\n` +
  `🏢 Отдел: ${escapeMarkdownV2(task.department)}\n` +
  `📅 Дедлайн: ${escapeMarkdownV2(deadlineStr)}\n` +
  `👤 Назначено: всем в отделе\n` +
  notCompletedUsers
  .map(user => `❌ Не выполнено сотрудником ${escapeMarkdownV2Username('@' + user.username)}`)
  .join('\n');


          // Админам и субадминам
         if (task.createdByAdminId) {
          await bot.sendMessage(task.createdByAdminId, reportText, { parse_mode: 'MarkdownV2' });
        } else {
          // fallback — если не указано, отправим всем (чтобы ничего не пропустить)
          for (let adminId of adminIds) {
            await bot.sendMessage(adminId, reportText, { parse_mode: 'MarkdownV2' });
          }
        }

          // Уведомления для субадминов департамента
          const subadmins = await User.find({ subadminDepartments: task.department });
          for (let subadmin of subadmins) {
            if (subadmin.telegramId) {
              await bot.sendMessage(subadmin.telegramId, reportText, { parse_mode: 'MarkdownV2' });
            }
          }

          // Пользователям
         for (const user of notCompletedUsers) {
          if (user.telegramId) {
            await bot.sendMessage(
              user.telegramId,
              `❗️ Вы не выполнили задачу "${escapeMarkdownV2(task.title)}" вовремя.`,
              { parse_mode: 'MarkdownV2' }
            );
          }
        }

          task.status = 'overdue';
          task.category = 'невыполненные';
          await task.save();
        } else if (task.assignedTo) {
          // Задача назначена одному сотруднику
          const responsible = task.assignedTo ? '@' + task.assignedTo : 'всем сотрудникам отдела';

          for (let adminId of adminIds) {
        await bot.sendMessage(
          adminId,
            `❌ Задача *"${escapeMarkdownV2(task.title)}"* \\(отдел: ${escapeMarkdownV2(task.department)}\\) не выполнена пользователем: ${escapeMarkdownV2Username(responsible)}\n\nДедлайн был: *${escapeMarkdownV2(deadlineStr)}*`,
            { parse_mode: 'MarkdownV2' }
          );
        }

          // Уведомления для субадминов департамента
          const subadmins = await User.find({ subadminDepartments: task.department });
          for (let subadmin of subadmins) {
            if (subadmin.telegramId) {
              await bot.sendMessage(
                subadmin.telegramId,
                `❌ Задача *"${escapeMarkdownV2(task.title)}"* \\(отдел: ${escapeMarkdownV2(task.department)}\\) не выполнена пользователем: ${escapeMarkdownV2Username(responsible)}\n\nДедлайн был: *${escapeMarkdownV2(deadlineStr)}*`,
                { parse_mode: 'MarkdownV2' }
              );
            }
          }

         const user = await User.findOne({ username: task.assignedTo });

          if (user?.telegramId) {
            await bot.sendMessage(
              user.telegramId,
              `❗️ Задача "${escapeMarkdownV2(task.title)}" не была выполнена вовремя и теперь перемещена в "Мои невыполненные задачи".`,
              { parse_mode: 'MarkdownV2' }
            );
          }

          task.status = 'overdue';
          task.category = 'невыполненные';
          task.overdueNotified = true; // помечаем, что уведомление отправлено
          await task.save();
        }
      }

      // Удаление задачи через 30 дней после дедлайна
      if (deadline < now && now - deadline >= 30 * 24 * 60 * 60 * 1000) {
        await Task.deleteOne({ _id: task._id });
      }
    }
  } catch (err) {
    console.error(`Ошибка при выполнении планировщика: ${err.message}`);
  }
});
