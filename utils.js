const bcrypt = require("bcryptjs");

module.exports = {
  async checkPasswordEncrypt(password, passwordOld) {
    var isValid = await bcrypt.compare(password, passwordOld);
    return isValid;
  },
  formatCurrency(amount) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  },
};
