const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  department: { type: String },
  isCompleted: { type: Boolean, default: false },
  completedBy: { type: [String], default: [] }, // Массив строк для отслеживания завершивших пользователей
  completedAt: { type: Date },
  photo: { type: String },
  assignedTo: {
    type: [String],
    default: []
  },
  username: {
    type: [String],
    required: false
  },
  deadline: { type: Date },
  status: { type: String, default: 'pending' },
  notified: { type: Boolean, default: false },
  overdueNotified: { type: Boolean, default: false },   // для уведомления о просрочке
  createdByAdminId: { type: String }
}, {
  timestamps: true // ⏱️ автоматически добавляет createdAt и updatedAt
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
