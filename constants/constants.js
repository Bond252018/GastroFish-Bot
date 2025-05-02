const adminIds = process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10));

module.exports = {
  adminIds,
};
