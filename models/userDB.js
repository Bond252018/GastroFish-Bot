const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  department: { type: String, default: 'не назначено' },
  role: { type: String, enum: ['user', 'subadmin', 'admin'], default: 'user' },
  telegramId: { type: Number },
});


const User = mongoose.model('User', userSchema);
module.exports = User;
