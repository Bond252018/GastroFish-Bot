const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  telegramId: { type: Number, required: false },
  chatId: { type: Number },
  department: { type: String, default: 'не назначено' },
  role: { type: String, default: 'user' }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
 