const { bot, formatDateTimeRu, User } = require('./utils');
const { adminIds } = require('../constants/constants');


async function notifyCreatorOnTaskCompletion(task) {
  try {
    const department = task.department || 'Не указано';
    const formattedDeadline = formatDateTimeRu(task.deadline);
    const completedText = `✅ Задача выполнена!\n\n📌 *Название:* ${task.title}\n📝 *Описание:* ${task.description}\n🏢 *Отдел:* ${department}\n📅 *Дедлайн:* ${formattedDeadline}\n👤 *Выполнил:* ${task.completedBy || 'Неизвестно'}`;
    // Получаем username того, кто поставил задачу
    const creatorUsername = Array.isArray(task.username) ? task.username[0] : task.username;
    const creator = await User.findOne({ username: creatorUsername });

    if (!creator) {
      return;
    }

     // Если задача от субадмина — отправляем только ему
     const chatId = creator.telegramId || creator.userId;
     if (!chatId) return;
 
     if (creator.role === 'subadmin') {
       // Уведомляем только субадмина
       if (task.photo) {
         await bot.sendPhoto(chatId, task.photo, {
           caption: completedText,
           parse_mode: 'Markdown',
         });
       } else {
         await bot.sendMessage(chatId, completedText, { parse_mode: 'Markdown' });
       }
     } else if (creator.role === 'admin') {
       // Если задача от админа — уведомляем только администраторов
       for (const adminId of adminIds) {
         if (task.photo) {
           await bot.sendPhoto(adminId, task.photo, {
             caption: completedText,
             parse_mode: 'Markdown',
           });
         } else {
           await bot.sendMessage(adminId, completedText, { parse_mode: 'Markdown' });
         }
       }
     }
 
   } catch (error) {
  }
}

module.exports = { notifyCreatorOnTaskCompletion };
