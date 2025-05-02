const cron = require('node-cron');
const {bot, formatDateTimeRu, Task, User } = require('./utils'); // Убедитесь, что пути к моделям и боту корректны
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
        console.warn(`⚠️ Неверная дата дедлайна у задачи "${task.title}": ${task.deadline}`);
        continue;
      }

      const deadlineStr = formatDateTimeRu(deadline);

      // 🔔 Напоминание за 1 час до дедлайна
      if (deadline > now && deadline <= hourLater && !task.notified) {
        const reminderText = `⏰ Напоминание: задача *"${task.title}"* должна быть завершена до *${deadlineStr}*`;

        // Отправка напоминаний пользователям
        if (task.assignedTo) {
          // Назначено конкретному пользователю
          const user = await User.findOne({ username: task.assignedTo, role: 'user' });
          if (user?.telegramId && user.role !== 'subadmin') { // Проверка на роль субадмина
            try {
              await bot.sendMessage(user.telegramId, reminderText, { parse_mode: 'Markdown' });
              console.log(`📩 Напоминание отправлено @${user.username}`);
            } catch (err) {
              console.error(`❌ Ошибка при отправке @${user.username}:`, err.message);
            }
          }
        } else {
          // Назначено всем сотрудникам отдела
          const users = await User.find({ department: task.department, role: 'user' });
          for (let user of users) {
            if (!user.telegramId || user.role === 'subadmin') continue; // Пропускаем субадминов
            try {
              await bot.sendMessage(user.telegramId, reminderText, { parse_mode: 'Markdown' });
              console.log(`📩 Напоминание отправлено @${user.username}`);
            } catch (err) {
              console.error(`❌ Ошибка при отправке @${user.username}:`, err.message);
            }
          }
        }

        task.notified = true;
        await task.save();
      }

    // ❗ Просроченные задачи
if (deadline < now && task.status !== 'overdue') {
  if (!task.assignedTo && task.department) {
    const completedBy = task.completedBy || {};
    const departmentUsers = await User.find({ department: task.department, role: 'user' });

    const notCompletedUsers = departmentUsers.filter(user => !completedBy[user.username]);

    const reportText = `🔸 ${task.title}
📄 Описание: ${task.description}
🏢 Отдел: ${task.department}
📅 Дедлайн: ${deadlineStr}
👤 Назначено: всем в отделе
${notCompletedUsers.map(user => `❌ Не выполнено сотрудником @${user.username}`).join('\n')}`;

    // Админам
    for (let adminId of adminIds) {
      await bot.sendMessage(adminId, reportText, { parse_mode: 'Markdown' });
    }

    // Пользователям
    for (const user of notCompletedUsers) {
      if (user.telegramId) {
        await bot.sendMessage(user.telegramId, `❗️ Вы не выполнили задачу "${task.title}" вовремя.`, { parse_mode: 'Markdown' });
      }
    }

    task.status = 'overdue';
    task.category = 'невыполненные';
    await task.save();
    console.log(`⚠️ Задача "${task.title}" просрочена — не выполнена сотрудниками: ${notCompletedUsers.map(u => u.username).join(', ')}`);
  } else if (task.assignedTo) {
    // Задача назначена одному сотруднику
    const user = await User.findOne({ username: task.assignedTo });
    const responsible = `@${task.assignedTo}`;

    for (let adminId of adminIds) {
      await bot.sendMessage(
        adminId,
        `❌ Задача *"${task.title}"* (отдел: ${task.department}) не выполнена пользователем: ${responsible}\n\nДедлайн был: *${deadlineStr}*`,
        { parse_mode: 'Markdown' }
      );
    }

    if (user?.telegramId && user.role !== 'subadmin') {
      await bot.sendMessage(user.telegramId, `❗️ Задача "${task.title}" не была выполнена вовремя и теперь перемещена в "Мои невыполненные задачи".`, { parse_mode: 'Markdown' });
    }

    task.status = 'overdue';
    task.category = 'невыполненные';
    await task.save();
    console.log(`⚠️ Задача "${task.title}" была просрочена и перемещена в категорию "невыполненные".`);
  }
}
      // Удаление задачи через 30 дней после дедлайна
      if (deadline < now && now - deadline >= 30 * 24 * 60 * 60 * 1000) {
        await Task.deleteOne({ _id: task._id });
        console.log(`🗑️ Задача "${task.title}" была удалена, так как прошло 30 дней с дедлайна.`);
      }      
    }
  } catch (err) {
    console.error('❌ Ошибка планировщика задач:', err);
  }
});
