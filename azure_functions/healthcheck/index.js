const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');

const assistant = new AssistantV2({
  authenticator: new IamAuthenticator({ apikey: process.env.IBM_WATSON_API_KEY }),
  serviceUrl: 'https://api.eu-de.assistant.watson.cloud.ibm.com',
  version: '2018-09-19'
});

module.exports = async function (context, req) {
  context.log('healthcheck function processed a request.');



  let sessionId;
  await assistant.createSession({
    assistantId: 'aead57e1-4be3-408e-ba16-05c9c563e053'
  })
    .then(response => {
      context.log.verbose(JSON.stringify(response.result, null, 2));
      sessionId = response.result.session_id;
    })
    .catch(err => {
      context.log.error(err);
    });

  

  await assistant.message(
    {
      input: { text: "What's the weather?" },
      assistantId: 'aead57e1-4be3-408e-ba16-05c9c563e053',
      sessionId: sessionId
    })
    .then(response => {
      context.log(JSON.stringify(response.result, null, 2));
    })
    .catch(err => {
      context.log(err);
    });


  const name = (req.query.name || (req.body && req.body.name));
  const responseMessage = name
    ? "Hello, " + name + ". This HTTP triggered function executed successfully."
    : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: responseMessage
  };
}