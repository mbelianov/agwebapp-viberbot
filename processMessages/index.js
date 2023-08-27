const axios = require('axios');
const Api2Pdf = require('api2pdf');
//const bodimed = require('./helpers/bodimed_connect');
const bodimed = require('../common/bodimed_connect');
//const AssistantV2 = require('ibm-watson/assistant/v2');
//const { IamAuthenticator } = require('ibm-watson/auth');
const { TableClient } = require("@azure/data-tables");
const { button } = require("../common/keyboard_buttons");
const { concatHexCharCode, removeNullParams } = require("../common/support_functions");
const mltools = require("./helpers/mltools")

const connectionString = process.env.AzureWebJobsStorage;
const containerName = process.env.TRAINING_DATA_CONTAINER_NAME;
const textClassificationProjectFile = process.env.TEXT_CLASSIFICATION_PROJECT_FILE;
const requestsTable = TableClient.fromConnectionString(connectionString, "resultrequests");
const patientsDBtable = TableClient.fromConnectionString(connectionString, "patientsDB");

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

module.exports = async function (context, myQueueItem) {
  let doctors = context.bindings.rDoctors;
  let registeredRequests = context.bindings.rResultRequests;
  let stdReplies = context.bindings.standardReplies;
  let rp = "";

  if (myQueueItem.event === "message") {
    context.log('Processing new mesasage from the queue');
    //context.log(myQueueItem);

    let i = doctors.findIndex(doctor => doctor.viber_id == myQueueItem.sender.id);

    if (i != -1) { // doctor section

      rp = /^---resultrequests$/gi //doctor asking for first patient in the queue
      if (rp.test(myQueueItem.message.text)) {
        if (registeredRequests.length > 0) {
          const request = registeredRequests[0];

          const reply = { // prepare reply
            "ButtonsGroupColumns": 6,
            "ButtonsGroupRows": 2,
            "Buttons": [{
              "Columns": 6, "Rows": 2, "ActionType": "reply", "TextHAlign": "left",
              "Text": `<font color=#323232><b>${request.patientName}</b></font><font color=#777777><br>ЕГН: ${request.patientEGN}<br>Viber name: ${request.patientViberName}</font>`,
              "ActionBody": `${request.patientName.split(" ")[0]}`,
            }]
          }

          const track_data = JSON.stringify({
            timestamp: 0,
            data: {
              conversation_stage: "processing-results-request", //current_task: "results", current_subtask: "fetch_results", 
              parameters: {
                patientViberId: request.patientViberId,
                patientViberName: request.patientViberName
              }
            }
          })

          await sendViberRichMedia(myQueueItem.sender.id,
            reply, track_data,
            {
              "Type": "keyboard",
              "Buttons": [button(`Следващ (${registeredRequests.length - 1})`, "---resultrequests")]
            }
          )

          return await requestsTable.deleteEntity(request.PartitionKey, request.RowKey)
            .catch(error => context.log.error("error delete entity from resultrequests table. ", error));
        }
        else {
          return await sendViberMessage(myQueueItem.sender.id,
            "Няма чакаши заявки", null,
            {
              "Type": "keyboard",
              "Buttons": [button("Нова проверка", "---resultrequests")]
            })
        }
      }

      rp = /^[a-zа-я]{1,}$/gi  //doctor searching for a patient in bodimed DB
      if (rp.test(myQueueItem.message.text)) {
        const patients = await bodimed.getPatients(context, myQueueItem.message.text);
        let count = 0;
        richMediaContent["Buttons"].length = 0;
        patients.patientsList.forEach(patient => { // prepare reply with first 9 patients from Bodimed DB
          if (count < 9) { // we show only first 9 patients
            count++
            richMediaContent["Buttons"].push({
              "Columns": 6, "Rows": 2, "ActionType": "reply", "TextHAlign": "left",
              "Text": `<font color=#323232><b>${patient.bodimed_patient_name} ${patient.bodimed_patient_surname} ${patient.bodimed_patient_familyname}</b></font><font color=#777777><br>ЕГН: ${patient.bodimed_patient_egn}</font>`,
              "ActionBody": `?idnap=${patient.bodimed_patient_id}&pass=${patient.bodimed_patient_password}`,
            })
          }
        })

        await sendViberMessage(myQueueItem.sender.id,
          `${count} от ${patients.patientsList.length}`, null,
          {
            "Type": "keyboard",
            "Buttons": [button(`Следващ (${registeredRequests.length})`, "---resultrequests")]
          }
        )

        const tracking_data = myQueueItem.message.tracking_data || /*default*/JSON.stringify({
          timestamp: 0,
          data: {
            conversation_stage: "choose-patient-from-bodimed",
            parameters: {
            }
          }
        })

        return await sendViberRichMedia(myQueueItem.sender.id,
          richMediaContent, tracking_data,
          {
            "Type": "keyboard",
            "Buttons": [button(`Следващ (${registeredRequests.length})`, "---resultrequests")]
          }
        )
      }

      rp = /^\?idnap=[0-9]+&pass=[0-9]+$/gi  //doctor fetching exam results for specific patient from bodibmed DB
      if (rp.test(myQueueItem.message.text)) {
        const tracking_data = JSON.parse(myQueueItem.message.tracking_data || /*default*/JSON.stringify({data:{parameters:{}}}));
        var a2pClient = new Api2Pdf(process.env.API2PDF_KEY);
        const result = await bodimed.getResults(context, myQueueItem.message.text);
        const mldata = result.outcome.mldata;
        //const blobName = await mltools.createAzureBlob(connectionString, containerName, mldata);
        //await mltools.updateProjectFile(connectionString, containerName, blobName, textClassificationProjectFile);
        return await a2pClient.chromeHtmlToImage(result.result)
          .then(async (result) => {

            let track_data = null;
            let kb = null;

            if (tracking_data.data.parameters.patientViberId) {
              track_data = JSON.stringify({
                timestamp: 0,
                data: {
                  conversation_stage: "present-results", current_task: "result_interpretation",
                  parameters: {
                    resultUrl: result.FileUrl,
                    blobName: null,//blobName,
                    patientViberId: tracking_data.data.parameters.patientViberId || "",
                    patientViberName: tracking_data.data.parameters.patientViberName || ""
                  }
                }
              })

              kb = {
                "Type": "keyboard",
                "Buttons": [
                  button(`${stdReplies[0].text}`, `---interpretation|${stdReplies[0].reply}|Cat1`, 2, 1),
                  button(`${stdReplies[1].text}`, `---interpretation|${stdReplies[1].reply}|Cat2`, 2, 1),
                  button(`${stdReplies[2].text}`, `---interpretation|${stdReplies[2].reply}|Cat3`, 2, 1),
                  button(`Следващ (${registeredRequests.length})`, "---resultrequests")
                ]
              }
            }

            if (tracking_data.data.parameters.patientViberName)
              await sendViberMessage(myQueueItem.sender.id, `Заявка от ${tracking_data.data.parameters.patientViberName || "---"}`)

            return await sendViberUrlMessages(myQueueItem.sender.id, [result.FileUrl], track_data, kb); 
            return await myAxios.post('/pa/send_message', msgData)
              .then(async res => {
                //const blobName = await mltools.createAzureBlob(connectionString, containerName, mldata);
                //await mltools.updateProjectFile(connectionString, containerName, blobName, textClassificationProjectFile);
                //context.log.verbose("send_message POST result: ", res)
              })
              .catch(error => { context.log.error("send_message POST error: ", error) })

          })
          .catch(error => { context.log.error("api2pdf error: ", error) });
      }

      rp = /^---interpretation\|.{1,}\|Cat[1-3]$/gi //doctor provides instructions to the bot what to reply to the patient
      //the bot also stores the results in Azure Blob and clasifies the reply
      //later, stored data will be used to train a text classification project and 
      //automate the analysis of the exams.
      if (rp.test(myQueueItem.message.text)) {
        const reply = myQueueItem.message.text.split("|")[1];
        const category = myQueueItem.message.text.split("|")[2];
        const tracking_data = JSON.parse(myQueueItem.message.tracking_data)
        const patientViberId = tracking_data.data.parameters.patientViberId;
        const resultUrl = tracking_data.data.parameters.resultUrl;
        const patientViberName = tracking_data.data.parameters.patientViberName;
        const blobName = tracking_data.data.parameters.blobName;

        //await mltools.updateProjectFile(connectionString, containerName, blobName, textClassificationProjectFile, category);
        await sendViberUrlMessages(patientViberId, [resultUrl]);
        await sendViberMessage(patientViberId, reply);

        return await sendViberMessage(myQueueItem.sender.id,
          `Изпратено на ${patientViberName}`, null,
          {
            "Type": "keyboard",
            "Buttons": [button(`Следващ (${registeredRequests.length - 1})`, "---resultrequests")]
          })
      }

    } // end of doctor section

    rp = /^---add uin:[0-9]{10}pass:[a-zа-я0-9]{1,}$/gi //new user in Doctor role
    let re_000_uin = /uin:[0-9]{10}/gi
    let re_000_pass = /pass:[a-zа-я0-9]{1,}/gi
    if (rp.test(myQueueItem.message.text)) {
      let reply = "Вие сте оторизиран.";

      if (doctors.length >= 50) {// max 50 users with a 'Doctor' role
        reply = "Достигнат максимален брой оторизирани потребители";
      }
      else {
        if (i == -1) {
          context.bindings.wDoctors = [];
          context.bindings.wDoctors.push({
            PartitionKey: "Partition",
            RowKey: concatHexCharCode(myQueueItem.sender.id),
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

      return await sendViberMessage(myQueueItem.sender.id, reply);
    }

    rp = /^---delete uin:[0-9]{10}$/gi //delete this profile from doctors table
    if (rp.test(myQueueItem.message.text)) {
      return await sendViberMessage(myQueueItem.sender.id, "Тази операция още не се поддържа.");
    }

    let tracking_data = myQueueItem.message.tracking_data ? JSON.parse(myQueueItem.message.tracking_data) : { timestamp: Date.now(), data: {} };

    rp = /^---start/gi
    if (rp.test(myQueueItem.message.text) || (tracking_data.timestamp < (Date.now() - 600 * 1000) /*timeout*/)) {
      if (rp.test(myQueueItem.message.text)) { //create patient DB for CRM purposes
        await patientsDBtable.upsertEntity({ partitionKey: "p1", rowKey: concatHexCharCode(myQueueItem.sender.id), patientViberProfile: JSON.stringify(myQueueItem.sender) }, "Replace")
          .then(res => context.log.verbose("upsert response: ", res))
          .catch(error => context.log.error("error upsert entity in patientsDB.", error));
      }

      return await sendViberMessage(myQueueItem.sender.id,
        "Изберете как да Ви помогна.",
        null,
        {
          "Type": "keyboard",
          "Buttons": [button("Резултати", "---results", 3, 2), button("Друго/Помощ", "---help", 3, 2)]
        })
    }

    rp = /^---results/gi
    if (rp.test(myQueueItem.message.text)) {
      if (registeredRequests.length > 99)
        return await sendViberMessage(myQueueItem.sender.id,
          "Съжалявам, в момента имаме твърде много чакащи пациенти. Моля опитайте пак след няколко часа.",
          null,
          {
            "Type": "keyboard",
            "Buttons": [button("Резултати", "---results", 3, 2), button("Друго/Помощ", "---help", 3, 2)]
          })

      return await sendViberMessage(myQueueItem.sender.id,
        "Въведете на кирилица Вашето първо име и ЕГН разделени с интервал.",
        JSON.stringify({
          timestamp: Date.now(),
          data: { conversation_stage: "check-results-request" }
        }),
        {
          "Type": "keyboard",
          "Buttons": [button("Отказ", "---start", 4, 1), button("Друго/Помощ", "---help", 2, 1)]
        })
    }

    rp = /^[a-zа-я]{1,} [0-9]{10}$/gi
    if (rp.test(myQueueItem.message.text) && (tracking_data.data.conversation_stage == "check-results-request")) {
      if (registeredRequests.findIndex(req => req.patientViberId == myQueueItem.sender.id) == -1) { // new request
        context.bindings.wResultRequests = [];
        context.bindings.wResultRequests.push({
          PartitionKey: "Partition",
          RowKey: concatHexCharCode(myQueueItem.sender.id),
          patientName: myQueueItem.message.text.split(" ")[0],
          patientEGN: myQueueItem.message.text.split(" ")[1],
          patientViberName: myQueueItem.sender.name,
          patientViberId: myQueueItem.sender.id
        })
      }
      else { //double request
      }

      return await sendViberMessage(myQueueItem.sender.id,
        "Вашата заявка е приета. Д-р Арабаджикова ще Ви информира за Вашите резултати в срок от един работен ден.", null,
        {
          "Type": "keyboard",
          "Buttons": [{
            "Columns": 6, "Rows": 1, "ActionType": "reply", "TextSize": "regular", "BgColor": "#ff0000",
            "ActionBody": "---start", "Text": "Начало"
          }]
        })
    }

    rp = /^---help/gi
    if (rp.test(myQueueItem.message.text)) {
      return await sendViberMessage(myQueueItem.sender.id,
        "За да заявите проверка на резултати от изследвания, изберете 'Резултати' от началното меню и следвайте точно инструкциите на асистента.",
        null,
        {
          "Type": "keyboard",
          "Buttons": [button("Към началното меню", "---start")]
        })
    }

    return await sendViberMessage(myQueueItem.sender.id,
      "Не ви разбрах. Моля започнете от начало.",
      null,
      {
        "Type": "keyboard",
        "Buttons": [button("Към началното меню", "---start")]
      })
  }
  else
    context.log("no new message")
};


async function sendViberUrlMessages(userId, urlList, tracking_data = null, keyboard = null) {
  await Promise.all(urlList.map(async (url) => {
    const t = removeNullParams({
      "receiver": userId,
      "min_api_version": 1,
      "type": "url",
      "sender": { "name": "Асистент" },
      "media": url,
      "tracking_data": tracking_data,
      "keyboard": keyboard
    })

    await myAxios.post('/pa/send_message', removeNullParams({
      "receiver": userId,
      "min_api_version": 1,
      "type": "url",
      "sender": { "name": "Асистент" },
      "media": url,
      "tracking_data": tracking_data,
      "keyboard": keyboard
    }))
      .then(res => { console.debug("sendViberUrlMessage POST response ", res) })
      .catch(error => { console.error("sendViberUrlMessage POST error ", error) })
  }))
}

async function sendViberMessage(userId, messageInput, tracking_data = null, keyboard = null) {
  await myAxios.post('/pa/send_message', removeNullParams({
    "receiver": userId,
    "min_api_version": 1,
    "type": "text",
    "sender": { "name": "Асистент" },
    "text": messageInput,
    "tracking_data": tracking_data,
    "keyboard": keyboard
  }))
    .then(res => { console.debug("sendViberMessage POST response", res) })
    .catch(error => { console.error("sendViberMessage POST error", error) })
}

async function sendViberRichMedia(userId, richmedia, tracking_data = null, keyboard = null) {
  await myAxios.post('/pa/send_message', removeNullParams({
    "receiver": userId,
    "min_api_version": 7,
    "type": "rich_media",
    "sender": { "name": "Асистент" },
    "rich_media": richmedia,
    "tracking_data": tracking_data,
    "keyboard": keyboard
  }))
    .then(res => { console.debug("sendViberRichMedia POST response", res) })
    .catch(error => { console.error("sendViberRichMedia POST error", error) })
}
