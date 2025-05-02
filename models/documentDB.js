const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  department: { type: String, required: true },
  fileName: { type: String, required: true },
  fileId: { type: String, required: true },  
  fileUrl: { type: String },  
  uploadedBy: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
