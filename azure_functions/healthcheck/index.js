const bodimed = require('../common/bodimed_connect');

module.exports = async function (context, req) {
  context.log('healthcheck function processed a request.');

  let patients = await bodimed.getPatients(context, "9002215792", "egn");
  let results = []
  for (let patient of patients.patientsList){
    let result = await bodimed.getResults(context, `?idnap=${patient.bodimed_patient_id}&pass=${patient.bodimed_patient_password}`)
    results.push(result)
  }
  context.log (results[0].outcome)
  
  const name = (req.query.name || (req.body && req.body.name));
  const responseMessage = name
    ? "Hello, " + name + ". This HTTP triggered function executed successfully."
    : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: responseMessage
  };
}