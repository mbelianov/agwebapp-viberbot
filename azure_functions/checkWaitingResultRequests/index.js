const axios = require('axios');

const myAxios = axios.create({
    baseURL: 'https://chatapi.viber.com',
    headers: {
      "X-Viber-Auth-Token": process.env.VIBER_AUTH_TOKEN_DEV,
      "Content-Type": "application/json"
    }
  });

module.exports = async function (context, myTimer) {
    var timeStamp = new Date().toISOString();

    //context.log('JavaScript timer trigger function ran!', timeStamp);
    
    let registeredRequests = context.bindings.rResultRequests;
    let doctors = context.bindings.rDoctors;
    doctors.forEach(async doctor => {

        await myAxios.post('/pa/send_message', {
            "receiver": doctor.viber_id,
            "min_api_version": 1,
            "type": "text",
            "sender": { "name": "Асистент" },
            "text": `Чакащи за резултати: ${registeredRequests.length}`,
            "keyboard": {
              "Type": "keyboard",
              "Buttons": [{
                "Columns": 6, "Rows": 1, "ActionType": "reply", "TextSize": "regular",
                "ActionBody": "---resultrequests", "Text": "Резултати"
              }]
            }
          })
            .then(res => { context.log.verbose(res) })
            .catch(error => { context.log.error(error) })
        
    });
};