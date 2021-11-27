const axios = require('axios');
const Api2Pdf = require('api2pdf');
const bodimed = require('./helpers/bodimed_connect');
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');


const myAxios = axios.create({
  baseURL: 'https://chatapi.viber.com',
  headers: {
    "X-Viber-Auth-Token": process.env.VIBER_AUTH_TOKEN,
    "Content-Type": "application/json"
  }
});

let richMediaContent = {
  "ButtonsGroupColumns": 6,
  "ButtonsGroupRows": 6,
  "Buttons": []
}

const assistant = new AssistantV2({
  authenticator: new IamAuthenticator({ apikey: process.env.IBM_WATSON_API_KEY }),
  serviceUrl: 'https://api.eu-de.assistant.watson.cloud.ibm.com',
  version: '2021-06-14'
});

module.exports = async function (context, myQueueItem) {
  let doctors = context.bindings.rDoctors;

  if (myQueueItem.event === "message") {
    context.log('Processing new mesasage from the queue');
    context.log(myQueueItem);

    let tracking_data = myQueueItem.message.tracking_data ? JSON.parse(myQueueItem.message.tracking_data) : { timestamp: 0, data: {} };

    if (tracking_data.timestamp < (Date.now() - 270 * 1000)) // 3 min timeout
      tracking_data.data = {};

    let i = doctors.findIndex(doctor => doctor.viber_id == myQueueItem.sender.id);

    if (i >= 0) {

      let re_001 = /^[a-zа-я]{1,}$/gi
      if (re_001.test(myQueueItem.message.text)) {
        const patients = await bodimed.getPatients(context, myQueueItem.message.text);
        let count = 0;
        richMediaContent["Buttons"].length = 0;
        patients.patientsList.forEach(patient => {
          if (count < 9) { // we show only first 9 patients
            count++
            richMediaContent["Buttons"].push({
              "Columns": 6, "Rows": 2, "ActionType": "reply", "TextHAlign": "left",
              "Text": `<font color=#323232><b>${patient.bodimed_patient_name} ${patient.bodimed_patient_surname} ${patient.bodimed_patient_familyname}</b></font><font color=#777777><br>ЕГН: ${patient.bodimed_patient_egn}</font>`,
              "ActionBody": `?idnap=${patient.bodimed_patient_id}&pass=${patient.bodimed_patient_password}`,
            })
          }
        })

        await myAxios.post('/pa/send_message', {
          "receiver": myQueueItem.sender.id,
          "min.api.version": 1,
          "type": "text",
          "sender": { "name": "Асистент" },
          "text": `${count} от ${patients.patientsList.length}`
        })
          .then(res => { context.log.verbose(res) })
          .catch(error => { context.log.error(error) })

        return await myAxios.post('/pa/send_message', {
          "receiver": myQueueItem.sender.id,
          "min_api_version": 7,
          "type": "rich_media",
          "sender": { "name": "Асистент" },
          "rich_media": richMediaContent
        })
          .then(res => { context.log.verbose(res) })
          .catch(error => { context.log.error(error) })
      }

      let re_002 = /^\?idnap=[0-9]+&pass=[0-9]+$/gi
      if (re_002.test(myQueueItem.message.text)) {
        var a2pClient = new Api2Pdf(process.env.API2PDF_KEY);
        const result = await bodimed.getResults(context, myQueueItem.message.text);
        return await a2pClient.chromeHtmlToImage(result.result)
          .then(async (result) => {
            const msgData = {
              "receiver": myQueueItem.sender.id,
              "min_api_version": 1,
              "type": "url",
              "sender": { "name": "Асистент" },
              "media": result.FileUrl
            };
            return await myAxios.post('/pa/send_message', msgData)
              .then(res => { context.log.verbose(res) })
              .catch(error => { context.log.error("send_message POST error: ", error) })

          })
          .catch(error => { context.log.error("api2pdf error: ", error) });
      }
    }

    let re_000 = /^add uin:[0-9]{10}pass:[a-zа-я0-9]{1,}$/gi //new user in Doctor role
    let re_000_uin = /uin:[0-9]{10}/gi
    let re_000_pass = /pass:[a-zа-я0-9]{1,}/gi
    if (re_000.test(myQueueItem.message.text)) {
      let reply = "Вие сте оторизиран.";

      if (doctors.length >= 50) {// max 50 users with a 'Doctor' role
        reply = "Достигнат максимален брой оторизирани потребители";
      }
      else {
        if (i == -1) {
          context.bindings.wDoctors = [];
          context.bindings.wDoctors.push({
            PartitionKey: "Partition",
            RowKey: myQueueItem.sender.id,
            uin: myQueueItem.message.text.match(re_000_uin)[0].substr(-10),
            pass: myQueueItem.message.text.match(re_000_pass)[0].substr(5),
            name: myQueueItem.sender.name,
            viber_id: myQueueItem.sender.id
          })
        }
        else {
          reply = "Недопустима повторна оторизация."
        }
      }

      return await myAxios.post('/pa/send_message', {
        "receiver": myQueueItem.sender.id,
        "min.api.version": 1,
        "type": "text",
        "sender": { "name": "Асистент" },
        "text": reply
      })
        .then(res => { context.log.verbose(res) })
        .catch(error => { context.log.error(error) })
    }

    let re_003 = /^delete uin:[0-9]{10}$/gi //delete this profile from doctors table
    if (re_003.test(myQueueItem.message.text)) {
      let reply = "Тази операция още не се поддържа.";

      return await myAxios.post('/pa/send_message', {
        "receiver": myQueueItem.sender.id,
        "min.api.version": 1,
        "type": "text",
        "sender": { "name": "Асистент" },
        "text": reply
      })
        .then(res => { context.log.verbose(res) })
        .catch(error => { context.log.error(error) })
    }

    let watson = tracking_data.data.watson ? tracking_data.data.watson : {}
    //let responses
    if (!watson.session_id) {
      await assistant.createSession({
        assistantId: process.env.IBM_WATSON_ASSISTANT_ID
      })
        .then(response => {
          context.log.verbose("opening new Watson session:", JSON.stringify(response.result, null, 2));
          watson.session_id = response.result.session_id;
        })
        .catch(err => { context.log.error(err) });
    }

    await sendMessageToWatson(myQueueItem.sender.id, watson.session_id, myQueueItem.message.text, null, context);
    /*
    await assistant.message({
      input: {
        text: myQueueItem.message.text,
        //intents: tracking_data.data.watson_intents,
        options: { return_context: true },
      },
      userId: myQueueItem.sender.id,
      assistantId: process.env.IBM_WATSON_ASSISTANT_ID,
      sessionId: watson.session_id
    })
      .then(async (resp) => {
        context.log("response from watson:", JSON.stringify(resp.result, null, 2));
        watson.intents = resp.result.output.intents;
        let responses = resp.result.output.generic
        tracking_data.data.watson = watson;
        tracking_data.timestamp = Date.now();
        for (i = 0; Array.isArray(responses) && i < responses.length; i++) {//context.log(responses[i].text)
          if (responses[i].response_type === "option") {
            let richMediaContent = { "ButtonsGroupRows": 2, "ButtonsGroupColumns": 4, "Buttons": [] }
            responses[i].options.forEach((option, index) => {
              richMediaContent.Buttons.push({
                "ActionType": "reply",
                "ActionBody": option.value.input.text,
                "Text": option.label
              })
            })
            await myAxios.post('/pa/send_message', {
              "receiver": myQueueItem.sender.id,
              "min.api.version": 1,
              "type": "text",
              "sender": { "name": "Асистент" },
              "text": `${responses[i].title}`
            })
              .then(res => { context.log.verbose(res) })
              .catch(error => { context.log.error(error) })

            await myAxios.post('/pa/send_message', {
              "receiver": myQueueItem.sender.id,
              "min_api_version": 7,
              "type": "rich_media",
              "sender": { "name": "Асистент" },
              "rich_media": richMediaContent
            })
              .then(res => { context.log.verbose(res) })
              .catch(error => { context.log.error(error) })
          }

          if (responses[i].response_type === "text") {
            await myAxios.post('/pa/send_message', {
              "receiver": myQueueItem.sender.id,
              "min.api.version": 1,
              "type": "text",
              "sender": { "name": "Асистент" },
              "text": responses[i].text,
              "tracking_data": JSON.stringify(tracking_data)
            })
              .then(res => { context.log.verbose(res) })
              .catch(error => { context.log.error(error) })
          }
        }
        if (resp.result.output.actions)
          if (resp.result.output.actions[0].type === "client")
            if (resp.result.output.actions[0].name === "getExamResultReport") {
              let patientId = resp.result.output.actions[0].parameters.patient_id
              let resultVar = resp.result.output.actions[0].result_variable
              let cont = { 'skills': { 'main skill': { 'user_defined': {} } } }
              cont['skills']['main skill']['user_defined'][resultVar] = `this should be the result for ${patientId}!`
              await assistant.message({
                input: {
                  text: "",
                  options: { return_context: true },
                },
                userId: myQueueItem.sender.id,
                assistantId: process.env.IBM_WATSON_ASSISTANT_ID,
                sessionId: watson.session_id,
                context: cont
              })
                .then((resp) => { context.log("response from watson:", JSON.stringify(resp.result, null, 2)) })
                .catch(err => { context.log.error("error occured while talking to watson:", err) });
            }
      })
      .catch(err => { context.log.error("error occured while talking to watson:", err) });
      */
  }
  else
    context.log("no new message")
};

async function sendMessageToWatson(userId, sessionId, messageInput, wa_context, azf_context) {
  await assistant.message({
    input: {
      text: messageInput,
      //intents: tracking_data.data.watson_intents,
      options: { return_context: true },
    },
    userId: userId,
    assistantId: process.env.IBM_WATSON_ASSISTANT_ID,
    sessionId: sessionId,
    context: wa_context
  })
    .then(async (response) => {
      azf_context.log("Watson response:", JSON.stringify(response.result, null, 2));
      await processWatsonResponse(response.result, azf_context);
    })
    .catch(err => { azf_context.log.error("error occured while talking to watson:", err) });
}

async function processWatsonResponse(response, azf_context) {
  let intents = response.output.intents;
  let replies = response.output.generic
  let sessionId = response.context.global.session_id
  let userId = response.user_id
  let tracking_data = {
    data: {
      watson: {
        session_id: sessionId,
        intents: intents
      }
    },
    timestamp: Date.now()
  }

  for (i = 0; Array.isArray(replies) && i < replies.length; i++) {//context.log(responses[i].text)
    if (replies[i].response_type === "option") {
      let richMediaContent = { "ButtonsGroupRows": 2, "ButtonsGroupColumns": 4, "Buttons": [] }
      replies[i].options.forEach((option) => {
        richMediaContent.Buttons.push({
          "ActionType": "reply",
          "ActionBody": option.value.input.text,
          "Text": option.label
        })
      })

      await sendViberMessage(userId, replies[i].title, tracking_data)
      await sendViberRichMedia(userId, richMediaContent, tracking_data)
    }

    if (replies[i].response_type === "text") {
      await sendViberMessage(userId, replies[i].text, tracking_data)
    }
  }

  if (response.output.actions)
    if (response.output.actions[0].type === "client")
      if (response.output.actions[0].name === "getExamResultReport") {
        let patientId = response.output.actions[0].parameters.patient_id
        let patientId_type = response.output.actions[0].parameters.patient_id_type
        let resultVar = response.output.actions[0].result_variable
        let wa_context = { 'skills': { 'main skill': { 'user_defined': {} } } }
        let resultReports = await getExamResultReports(azf_context, patientId, patientId_type)
        await sendViberUrlMessages(userId, resultReports, tracking_data)
        if (resultReports.length > 0)
          wa_context['skills']['main skill']['user_defined'][resultVar] = `Това бяха вашите резултати!`
        else
          wa_context['skills']['main skill']['user_defined'][resultVar] = `Не намерих резултати`
        await sendMessageToWatson(userId, sessionId, "", wa_context, azf_context)
      }
}

async function getExamResultReports(azf_context, patientId, patientId_type) {
  const patients = await bodimed.getPatients(azf_context, patientId, patientId_type)
  //azf_context.log(patients)
  var a2pClient = new Api2Pdf(process.env.API2PDF_KEY);

  return await Promise.all(patients.patientsList.map(async (patient) => {
    const result = await bodimed.getResults(azf_context, `?idnap=${patient.bodimed_patient_id}&pass=${patient.bodimed_patient_password}`)
    const reportUlr = await a2pClient.chromeHtmlToImage(result.result)
      .then(async (response) => { 
        return response.FileUrl;
      })
      .catch(error => {
        azf_context.log.error("api2pdf error:", error);
        return null
      })

      return reportUlr
  }))
}

async function sendViberUrlMessages(userId, urlList, tracking_data = ""){
  await Promise.all(urlList.map(async (url) =>{
    await myAxios.post( '/pa/send_message', {
      "receiver": userId,
      "min_api_version": 1,
      "type": "url",
      "sender": { "name": "Асистент" },
      "media": url,
      "tracking_data": JSON.stringify(tracking_data)
    })
      .then(res => { console.debug("sendViberUrlMessage POST error ", res) })
      .catch(error => { console.error("sendViberUrlMessage POST error ", error) })
  }))
}

async function sendViberMessage(userId, messageInput, tracking_data = "") {
  await myAxios.post('/pa/send_message', {
    "receiver": userId,
    "min.api.version": 1,
    "type": "text",
    "sender": { "name": "Асистент" },
    "text": messageInput,
    "tracking_data": JSON.stringify(tracking_data)
  })
    .then(res => { console.debug("sendViberMessage POST response", res) })
    .catch(error => { console.error("sendViberMessage POST error", error) })
}

async function sendViberRichMedia(userId, richmedia, tracking_data = "") {
  await myAxios.post('/pa/send_message', {
    "receiver": userId,
    "min_api_version": 7,
    "type": "rich_media",
    "sender": { "name": "Асистент" },
    "rich_media": richmedia,
    "tracking_data": JSON.stringify(tracking_data)
  })
    .then(res => { console.debug("sendViberRichMedia POST response", res) })
    .catch(error => { console.error("sendViberRichMedia POST error", error) })
}
