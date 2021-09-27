
const ngrok = require('./get_public_url');
const ViberBot = require('viber-bot').Bot;
const BotEvents = require('viber-bot').Events;
const winston = require('winston');
const TextMessage = require('viber-bot').Message.Text;
const RichMediaMessage = require('viber-bot').Message.RichMedia;
const UrlMessage = require("viber-bot").Message.Url;
const db = require('./db_connector');
const bodimed = require('./bodimed_connect');
const http = require('http');

const IBMCloudEnv = require('ibm-cloud-env');
IBMCloudEnv.init('/mappings.json');

var Api2Pdf = require('api2pdf');   
var a2pClient = new Api2Pdf(IBMCloudEnv.getString('api2pdf_key'));

//get all registered profiles in viber bot db. each profile in viberbot db can request data from bodimed db
var profiles = [];
async function getAllProfiles (){
    profiles = await db.listProfiles();
}
//getAllProfiles();

// add profile in the viberbot-db
const addProfile = async (profile) => {
    const result = await db.addProfile(profile);
    if (result.ok){
        profiles[0].id = result.id;
        profiles[0].rev = result.rev;
        profiles[0].profile = profile;
    }
}


function createLogger() {
    const logger = winston.createLogger({
        level: "debug"
    }); // We recommend DEBUG for development
    const { combine, colorize, simple, timestamp, align, prettyPrint, printf } = winston.format;

    logger.add(new winston.transports.Console({ format: simple() }));
    return logger;
}

const logger = createLogger();

// Creating the bot with access token, name and avatar
const bot = new ViberBot({
    logger: logger,
    authToken: IBMCloudEnv.getString('viber_app_key'),
    name: "Асистент",
    avatar: "http://viber.com/avatar.jpg"
});

const KEYBOARD_YES_NO = {
    "Type": "keyboard",
    "Buttons": [{
        "Columns": 2,
        "Rows": 2,
        "Text": "<font size='32'>ДА</font>",
        "ActionType": "reply",
        "ActionBody": "confirm",
        "BgColor": "#00ff00",
    }, {
        "Columns": 2,
        "Rows": 2,
        "Text": "<font size='32'>НЕ</font>",
        "ActionType": "reply",
        "ActionBody": "cancel",
        "BgColor": "#ff0000",
    }]
}

const WELLCOM_KEYBOARD = {
    "Type": "keyboard",
    "Buttons": [{
        "Columns": 3,
        "Rows": 2,
        "Text": "<font size='24'>Регистрация</font>",
        "TextSize": "large",
        "ActionType": "reply",
        "ActionBody": "register",
        "BgColor": "#00ff00"
    }]
}

const wellcomeMsgString = `Здравейте! Аз съм цифровият асистент на д-р Арабаджикова. Мога да Ви регистрирам като неин пациент или да Ви помогна да проверите резултатите си. Моля изберете!`;
const wellcomeMessage = new TextMessage(wellcomeMsgString, WELLCOM_KEYBOARD, null, null, null, 4);


bot.onConversationStarted((userProfile, isSubscribed, context) =>
    bot.sendMessage(userProfile, wellcomeMessage, { operation: "wellcome" }));

bot.on(BotEvents.MESSAGE_RECEIVED, async (message, response) => {
    logger.info(`MESSAGE_RECEIVED: ${JSON.stringify(message)}`);
    logger.info(`RESPONSE: ${JSON.stringify(response.userProfile)}`)
    let re;

    //load all prfiles from db if not already done
    if (profiles.length == 0)
        profiles = await db.listProfiles();

    if (/здравейте|здравей|привет/i.test(message.text)) {
        response.send(wellcomeMessage, { operation: "wellcome" });
        return;
    }

    if (/_register_/i.test(message.text)) {
        if (profiles.length == 0){
            addProfile(response.userProfile);
            response.send(new TextMessage("success. you are now authorized"))
        }
        else {
            response.send(new TextMessage("failed. authorized user already exist"))
        }
        return;
    }

    if (/_delete_/i.test(message.text)) {
        if (profiles.length == 0){
            response.send(new TextMessage("you are not registered"))
        }
        else if (profiles[0].profile.id === response.userProfile.id){
            const result = await db.deleteProfile(profiles)
            if (result == 0){
                response.send(new TextMessage("success"))
                profiles = [];
            }
            else{
                response.send(new TextMessage("something went wrong. try again"))
            }
        }
        return;
    }

    if (profiles.length > 0 && response.userProfile.id == profiles[0].profile.id) { //this is d-r Arabadjikova or other authorized users
        console.log("hello d-r Arabadjikova")
        re = /^[a-zа-я]{1,}$/gi
        if (re.test(message.text)){
            const patients = await bodimed.getPatients(message.text);
            let RICH_MEDIA = {
                "ButtonsGroupColumns":6,
                "ButtonsGroupRows":6,
                "Buttons":[]
            }
            let count = 0;
            patients.patientsList.forEach(patient => {
                if (count < 9){ // we show only first 9 patients
                    count++;
                    RICH_MEDIA["Buttons"].push ({
                        "Columns":6,
                        "Rows":2,
                        "Text":`<font color=#323232><b>${patient.bodimed_patient_name} ${patient.bodimed_patient_surname} ${patient.bodimed_patient_familyname}</b></font><font color=#777777><br>ЕГН: ${patient.bodimed_patient_egn}</font>`,
                        "ActionType":"reply",
                        "ActionBody":`?idnap=${patient.bodimed_patient_id}&pass=${patient.bodimed_patient_password}`,
                        "TextHAlign":"left"
                    })
                }
            })
            if (count == 0)
                RICH_MEDIA["Buttons"].push ({
                    "Columns":6,
                    "Rows":6,
                    "Text":`<font color=#323232><b></b></font><font color=#777777><br>Няма намерени пациенти</font>`,
                    "ActionType":"none",
                    "TextHAlign":"left"
                })
            const richMediaMessage = new RichMediaMessage(RICH_MEDIA);
            bot.sendMessage (response.userProfile, [
                new TextMessage (`${count} от ${patients.patientsList.length}`),
                richMediaMessage
            ])
            return;
        }
        
        re = /^\?idnap=[0-9]+&pass=[0-9]+$/gi
        if (re.test(message.text)){
            const result = await bodimed.getResults(message.text);
            a2pClient.chromeHtmlToImage(result.result).then(function(result) {
                response.send(new UrlMessage(result.FileUrl));
            });
            return;
        }
        return;
    }

    if (message.trackingData) {
        switch (message.trackingData.operation) {
            case "wellcome":
                switch (message.text.toLowerCase()) {
                    case "register":
                    case "регистрация":
                        bot.sendMessage(response.userProfile, [
                            new TextMessage("Чудесно! Ще са ми нужни Вашите имена, ЕГН, email и телефон. Моля бъдете прецизна в отговорите на въпросите ми."),
                            new TextMessage("Моля въведете Вашето ЕГН")
                        ], { operation: "collect_egn", patient: {} })
                        break;
                    default:
                        response.send(wellcomeMessage, { operation: "wellcome" }); //user intent is not clear. we start from begining
                }
                break;
            case "collect_egn":
                re = /^([0-9]{10})$/;
                if (re.test(message.text)) {
                    if (false) {
                        //user exist, do something else
                    }
                    else {
                        message.trackingData.patient.egn = message.text;
                        response.send(new TextMessage("Моля въведете Вашетo първо име"), { operation: "collect_name", patient: message.trackingData.patient });
                    }
                }
                else {
                    response.send(new TextMessage("Некоректно ЕГН. Опитайте пак."), message.trackingData);
                }
                break;
            case "collect_name":
                re = /^[a-zа-я]{2,}/gi
                if (re.test(message.text)) {
                    message.trackingData.patient.name = message.text;
                    response.send(new TextMessage("Моля въведете Вашетo презиме."), { operation: "collect_surname", patient: message.trackingData.patient });
                }
                else {
                    response.send(new TextMessage("Некоректно име. Опитайте пак."), message.trackingData);
                }
                break;
            case "collect_surname":
                re = /^[a-zа-я]{2,}/gi
                if (re.test(message.text)) {
                    message.trackingData.patient.surname = message.text;
                    response.send(new TextMessage("Моля въведете Вашaтa фамилия."), { operation: "collect_familyname", patient: message.trackingData.patient });
                }
                else {
                    response.send(new TextMessage("Некоректно презиме. Опитайте пак."), message.trackingData);
                }
                break;
            case "collect_familyname":
                re = /^[a-zа-я]{2,}/gi
                if (re.test(message.text)) {
                    message.trackingData.patient.familyname = message.text;
                    response.send(new TextMessage("Моля въведете Вашия email."), { operation: "collect_email", patient: message.trackingData.patient });
                }
                else {
                    response.send(new TextMessage("Некоректна фамилия. Опитайте пак."), message.trackingData);
                }
                break;
            case "collect_email":
                //re = /^\w+@\w+.[a-z]{2,}/gi
                re = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/
                if (re.test(message.text)) {
                    message.trackingData.patient.email = message.text;
                    response.send(new TextMessage("Моля въведете Вашия телефонен номер в международен формат (+35988....)."), { operation: "collect_tel", patient: message.trackingData.patient });
                }
                else {
                    response.send(new TextMessage("Некоректен email адрес. Опитайте пак."), message.trackingData);
                }
                break;
            case "collect_tel":
                re = /\+[0-9]{10,}/gi
                if (re.test(message.text)) {
                    message.trackingData.patient.tel = message.text;
                    bot.sendMessage(response.userProfile, [
                        new TextMessage("Благодаря!"),
                        new TextMessage(`Вашите данни са: \nИме: ${message.trackingData.patient.name} ${message.trackingData.patient.surname} ${message.trackingData.patient.familyname}\nЕГН: ${message.trackingData.patient.egn}\nemail: ${message.trackingData.patient.email}\ntel: ${message.trackingData.patient.tel}`),
                        new TextMessage("Моля потвърдете!", KEYBOARD_YES_NO, null, null, null, 3)],
                        { operation: "collect_all", patient: message.trackingData.patient }
                    );
                }
                else {
                    response.send(new TextMessage("Некоректен телефонен номер. Опитайте пак."), message.trackingData);
                }
                break;
            case "collect_all":
                if (message.text == "confirm") {
                    response.send(new TextMessage("Вие сте регистриранa. Заповядайте на преглед в уговорения час."), { operation: "wellcome" });
                }
                else {
                    bot.sendMessage(response.userProfile, [
                        new TextMessage("ОК. Започваме отново."),
                        new TextMessage(wellcomeMessage)],
                        { operation: "wellcome" });
                }
                break;
            default:
                bot.sendMessage(response.userProfile, [
                    new TextMessage("Нещо се обърка. Да започнем отново."),
                    new TextMessage(wellcomeMessage)],
                    { operation: "wellcome" });
        }
    }
    else
        response.send(wellcomeMessage, { operation: "wellcome" }); //trackingData is missing. As we do not know the user state, we start from begining.
})


const port = process.env.PORT || 8080;
return ngrok.getPublicUrl()
    .then(publicUrl => {
        console.log('Set the new webhook to: ', publicUrl);
        http.createServer(bot.middleware()).listen(port, () => bot.setWebhook(publicUrl));
    }).catch(error => {
        console.log('Can not connect to ngrok server, probably in prod environment. searching through environment variables.');
        const publicUrl = IBMCloudEnv.getString('app_uri');
        if (publicUrl){
            console.log('Set the new webhook to: ', publicUrl);
            http.createServer(bot.middleware()).listen(port, () => bot.setWebhook(publicUrl));
        }
        else {
            console.log("Can not find public uri. exiting.")
            console.error(error);
        }
    });
