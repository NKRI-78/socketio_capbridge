const bcrypt = require("bcryptjs");

module.exports = {
  async checkPasswordEncrypt(password, passwordOld) {
    var isValid = await bcrypt.compare(password, passwordOld);
    return isValid;
  },
};
