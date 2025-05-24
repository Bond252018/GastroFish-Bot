require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const Document = require('../models/documentDB');
const User = require('../models/userDB');
const Task = require('../models/taskDB');
 

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGO_URI;
 
if (!token || !mongoURI) {
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI, {
  socketTimeoutMS: 30000,  // Увеличиваем таймаут сокета до 30 секунд
  serverSelectionTimeoutMS: 30000,  // Увеличиваем таймаут выбора сервера до 30 секунд
  connectTimeoutMS: 30000,  // Увеличиваем таймаут подключения до 30 секунд
})
.then(() => {
  console.log('✅ Connected to MongoDB');
})
.catch(err => {
  console.log('❌ Error happened while establishing the MongoDB connection', err);
  process.exit(1);
});

// Функция для проверки формата username
function isValidUsername(username) {
  const usernameRegex = /^@[a-zA-Z0-9_]+$/; // Регулярное выражение для формата @username
  return usernameRegex.test(username);
}

function escapeHTML(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeMarkdownV2(str) {
  if (typeof str !== 'string') {
    return String(str);
  }
  
  return str
    .replace(/\\/g, '\\\\')  // сначала экранируем обратный слеш
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}


function formatDateTimeRu(date) {
  if (!date) return 'Не указано';

  return new Date(date).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

const departmentList = [
  { name: "Склад", emoji: "📦" },
  { name: "Устричный бар", emoji: "🦪" },
  { name: "Фреш витрина", emoji: "🧊" },
  { name: "Кухня верх", emoji: "👨‍🍳" },
  { name: "Доставка", emoji: "🚚" },
  { name: "Офики", emoji: "🧑‍💼" },
  { name: "Бухгалтерия", emoji: "💰" },
  { name: "SMM", emoji: "📱" },
  { name: "Клининг", emoji: "🧹" },
  { name: "Инженерка", emoji: "🛠️" },
  { name: "Обвалка", emoji: "🥩" },
  { name: "Заготовка", emoji: "🔪" },
  { name: "ФК", emoji: "🍣" },
  { name: "Суши бар", emoji: "🍣" },
  { name: "Витрина", emoji: "🏪" },
  { name: "Бар", emoji: "🍹" },
  { name: "7-й Склад", emoji: "🏢" },
  { name: "Руководители", emoji: "👔" }
];
  
const adminState = {};

const adminMainMenu = {
  reply_markup: {
    keyboard: [
      ['👥 Список пользователей', '📥 Добавить пользователя'],
      ['❌ Удалить пользователя', '📝 Поставить задачу'],
      ['👑 Назначить субадмина', '🧹 Удалить субадмина'],
      ['📋 Невыполненные задачи', '📗 Выполненные задачи'],
      ['🧹 Удалить просроченные задачи', '📊 Статистика выполненных заказов'],
      [ '📋 Мои задачи', '📋 Мои невыполненные задачи'],
      ['📂 Документы'],  
      ['🏠 Главное меню'],
    ],
    resize_keyboard: true,
  }
};

const subadminMenu = {
  reply_markup: {
    keyboard: [
      ['👥 Мои сотрудники', '📝 Поставить задачу'], 
       [ '📋 Мои задачи', '📋 Мои невыполненные задачи'],
      ['🏠 Главное меню']
    ],
    resize_keyboard: true
  }
};


// Главное меню для пользователей
const userMenu = {
  reply_markup: {
    keyboard: [
      ['📋 Мои задачи', '📋 Мои невыполненные задачи'],
      [' 📄 Мои документы'],
    ],
    resize_keyboard: true,
  }
};


// Экспортируем необходимые данные
module.exports = { bot, isValidUsername, escapeHTML, escapeMarkdownV2, formatDateTimeRu,  departmentList, adminState, adminMainMenu, subadminMenu, userMenu, Document, User, Task };
