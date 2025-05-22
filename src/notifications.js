const { bot, formatDateTimeRu, escapeMarkdownV2, User } = require('./utils');
 
async function notifyCreatorOnTaskCompletion(task) {
  try {
const completedText = 
  escapeMarkdownV2('✅ Задача выполнена!') + '\n\n' +
  escapeMarkdownV2(`📌 Название: ${task.title}`) + '\n' +
  escapeMarkdownV2(`📝 Описание: ${task.description}`) + '\n' +
  escapeMarkdownV2(`🏢 Подразделение: ${task.department || 'Не указано'}`) + '\n' +
  escapeMarkdownV2(`📅 Дедлайн: ${formatDateTimeRu(task.deadline)}`) + '\n' +
  escapeMarkdownV2(`👤 Выполнил: ${task.completedBy || 'Неизвестно'}`);

    const creatorUsername = Array.isArray(task.username) ? task.username[0] : task.username;
    const creator = await User.findOne({ username: creatorUsername });

    if (!creator) return;
    
    const chatId = creator.telegramId || creator.userId;
    if (!chatId) return;
     
    // Уведомляем только того, кто создал задачу
    if (task.photo) {
      await bot.sendPhoto(chatId, task.photo, {
        caption: completedText,
        parse_mode: 'MarkdownV2',
      });
    } else {
      await bot.sendMessage(chatId, completedText, { parse_mode: 'MarkdownV2' });
    }
  } catch (error) {
  }
}

module.exports = { notifyCreatorOnTaskCompletion };
