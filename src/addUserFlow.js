const { isValidUsername, departmentList, User } = require('./utils');

async function handleAddUserFlow(bot, msg, stateStorage) {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const text = msg.text;
  const state = stateStorage[username];

  switch (state.step) {
    case 'awaitingUsername': {
      const usernameInput = text.trim().replace('@', '');
      if (!isValidUsername(text)) {
        await bot.sendMessage(chatId, 'Введите корректный username (например, @halyna_sichova).');
        return;
      }

      try {
        const existingUser = await User.findOne({ username: usernameInput });
        if (existingUser) {
          await bot.sendMessage(chatId, `Пользователь @${usernameInput} уже существует.`);
          return;
        }

        const newUser = new User({ username: usernameInput, department: 'не назначено' });
        await newUser.save();

        stateStorage[username] = {
          step: 'awaitingDepartmentForNewUserByUsername',
          username: usernameInput
        };

        await bot.sendMessage(chatId, `Пользователь @${usernameInput} успешно добавлен.`);
        await bot.sendMessage(chatId, 'Выберите подразделение для нового пользователя:', {
          reply_markup: {
            keyboard: [...departmentList.map(d => [`${d.emoji} ${d.name}`]), ['🏠 Главное меню']],
            resize_keyboard: true
          }
        });

        return;
      } catch (error) {
        await bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
        return;
      }
    }

    case 'awaitingDepartmentForNewUserByUsername': {
      const dept = departmentList.find(d => `${d.emoji} ${d.name}` === text);
      if (!dept) {
        await bot.sendMessage(chatId, 'Выберите корректное подразделение.');
        return;
      }

      const userToUpdate = await User.findOne({ username: state.username });
      if (!userToUpdate) {
        await bot.sendMessage(chatId, `Пользователь @${state.username} не найден.`);
        return;
      }

      userToUpdate.department = dept.name;
      await userToUpdate.save();

      delete stateStorage[username];

      await bot.sendMessage(chatId, `Пользователь @${userToUpdate.username} назначен в подразделение "${dept.name}".`);

      // НЕ делаем переход в меню — пусть вызывающий код сам решает
      return { success: true };
    }
  }
}

module.exports = {
  handleAddUserFlow
};
