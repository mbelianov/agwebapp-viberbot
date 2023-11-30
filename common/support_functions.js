
exports.concatHexCharCode = (inputStr) => {
  let outputStr = "";
  for (let i = 0; i < inputStr.length; i++) {
    outputStr += inputStr.charCodeAt(i).toString(16);
  }
  return outputStr;
}

exports.removeNullParams = (jsonObject) => {
  for (let key in jsonObject) {
    if (jsonObject[key] === null) {
      delete jsonObject[key];
    } else if (typeof jsonObject[key] === "object") {
      this.removeNullParams(jsonObject[key]);
    }
  }
  return jsonObject;
}
