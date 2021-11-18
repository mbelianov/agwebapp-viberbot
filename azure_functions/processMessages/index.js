const axios = require('axios');
const Api2Pdf = require('api2pdf');  
const bodimed = require('./helpers/bodimed_connect');

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
    context.bindings.wDoctors = [];

/*    for (var i = 1; i < 10; i++) {
        context.bindings.wDoctors.push({
            PartitionKey: "Test",
            RowKey: i.toString(),
            uin: "Name1 " + i,
            pass: "Name2 " + i,
            name: "Павлина"
        });
    }*/

    if (myQueueItem.event === "message") {
        context.log('Processing new mesasage from the queue');
        context.log.verbose(myQueueItem);
        let re_000 = /^uin:[0-9]{10}$/gi
        if (re_000.test(myQueueItem.message.text)){
            
            if (doctors.length > 50) // max 50 users with a 'Doctor' role
                return;
            
            await myAxios.post('/pa/send_message', {
                    "receiver": myQueueItem.sender.id,
                    "min.api.version": 1,
                    "type": "text",
                    "sender": {"name": "Асистент"},
                    "text": `Моля въведете парола за Бодимед.`,
                    "tracking_data": myQueueItem.message.text
                })
                .then(res => {context.log.verbose(res)})
                .catch(error => {context.log.error(error)})

        }
        if (re_000.test(myQueueItem.message.tracking_data)){
            doctors.push({
                PartitionKey: "Partition",
                RowKey: myQueueItem.sender.id,
                uin: myQueueItem.message.tracking_data.substr(-10),
                pass: myQueueItem.message.text,
                name: myQueueItem.sender.name,
                viber_id:myQueueItem.sender.id
            })
            context.bindings.wDoctors = doctors;
            await myAxios.post('/pa/send_message', {
                    "receiver": myQueueItem.sender.id,
                    "min.api.version": 1,
                    "type": "text",
                    "sender": {"name": "Асистент"},
                    "text": `Чудесно.`
                })
                .then(res => {context.log.verbose(res)})
                .catch(error => {context.log.error(error)})
        }

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
                    "sender": {"name": "Асистент"},
                    "text": `${count} от ${patients.patientsList.length}`
                })
                .then(res => {context.log.verbose(res)})
                .catch(error => {context.log.error(error)})

            return await myAxios.post('/pa/send_message', {
                    "receiver": myQueueItem.sender.id,
                    "min_api_version": 7,
                    "type": "rich_media",
                    "sender": {"name": "Асистент"},
                    "rich_media": richMediaContent
                })
                .then(res => {context.log.verbose(res)})
                .catch(error => {context.log.error(error)})
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
                        "sender": {"name": "Асистент"},
                        "media": result.FileUrl
                    };
                    return await myAxios.post('/pa/send_message', msgData)
                        .then(res => {context.log.verbose(res)})
                        .catch(error => {context.log.error("send_message POST error: ", error)})
                    
                })
                .catch(error => {context.log.error("api2pdf error: ", error)});
        }        
    }
    else
        context.log("no new message")
};