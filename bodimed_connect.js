const axios = require("axios");
const cheerio = require("cheerio");
const win1251 = require('./windows-1251');

/**
 * get exam results from Bodimed database. We are scraping their website. not the best approach but this is what we have...
 * @param idnap id of the exam in Bodimed database
 * @param pass password for accessing the results
 * @return HTML page with the exam reults
 */

exports.getResults = (query) => {
  console.log('In route - Bodimed.getResults');

  let headersList = {
    "Accept": "*/*",
    "User-Agent": "Thunder Client (https://www.thunderclient.io)",
    "Content-Type": "application/x-www-form-urlencoded" 
   }
   

  let reqOptions = {
     url: "https://results.bodimed.com/new/results_patient.php",
     method: "POST",
     headers: headersList,
     data: `${query.substring(1)}`,
     responseType: 'arraybuffer',
   }

  return axios.request(reqOptions)
    .then(function (response) {
      let result = win1251.decode(response.data)
      return ({ result });
    })
    .catch(error => {
      console.log("getResults from Bodimed failed", error);
      return ({
        message: 'getResults from Bodimed failed',
        error: error,
      });
    });

}

/**
 * get patient list from Bodimed. We are scraping their website. not the best approach but this is what we have...
 * @param egn the EGN of the patinet we are serching
 * @param name the first name of the patient. if both egn and name are provided, egn will be used
 * @param fromDate start date of the period we search
 * @param untilDate start date of the period we search
 * @return JSON array with all found patients
 */
exports.getPatients = (name) => {
  console.log('In Bodimed.getPatients');

  let headersList = {
    "Accept": "*/*",
    "User-Agent": "Axios Client",
    "Content-Type": "application/x-www-form-urlencoded"
  }

  let _do = '01.08.2021'; //just default date
  let d = new Date();
  if (d != "Invalid Date") {
    let dd = d.getDate();
    let mm = d.getMonth() + 1;
    let yyyy = d.getFullYear();
    _do = `${dd}.${mm}.${yyyy}`;
  }
  
  let _ot = '01.08.2121'; //just default date
  d = new Date(d.getTime() - 30*24*3600*1000);
  if (d != "Invalid Date") {
    let dd = d.getDate();
    let mm = d.getMonth() + 1;
    let yyyy = d.getFullYear();
    _ot = `${dd}.${mm}.${yyyy}`;
  }

  let reqOptions = {
    url: "https://results.bodimed.com/new/naplek.php",
    method: "POST",
    headers: headersList,
    data: `idnap=2300010857&pass=0857&ot=${_ot}&do=${_do}&search=search`,
    responseType: 'arraybuffer',
    //responseEncoding: 'latin1'
  }

  let filter = {
    isActive: false
  };

  if (name) {
    filter.isActive = true,
    filter.key = 'bodimed_patient_name',
    filter.value = name
  }

  return axios.request(reqOptions)
    .then((response) => {
      let patientsList = scrapeTable(win1251.decode(response.data), filter);
      return { patientsList };
    })
    .catch(error => {
      console.log("getPatients from Bodimed failed", error);
      return {
        message: 'getPatients from Bodimed failed',
        error: error,
      };
    });
};

const COLUMN_HEADER_BGtoEN_MAPPER = new Map([
  ["id", "bodimed_patient_id"],
  ["????????????", "bodimed_patient_password"],
  ["?????? ??????????", "bodimed_mdd_number"],
  ["???????? ???? ??????.", "bodimed_issue_date"],
  ["???????? ???? ????????????????????", "bodimed_execution_date"],
  ["?????? ??????????????", "bodimed_patient_egn"],
  ["?????? ??????????????", "bodimed_patient_name"],
  ["?????????????? ??????????????", "bodimed_patient_surname"],
  ["?????????????? ??????????????", "bodimed_patient_familyname"],
  //["???????? ???? ????????.","bodimed_charge_ammount"],
  //["?????????? ???? ????????????????", "bodimed_sales_plan"],
  //["????????????", "bodimed_result"]
]);

scrapeTable = (result, filter) => {
  const $ = cheerio.load(result);
  const scrapedData = [];
  const tableHeaders = [];
  $("body > table.table > tbody > tr").each((index, element) => {
    if (index === 0) {
      const ths = $(element).find("td"); //first row contains columnt headers
      $(ths).each((i, element) => {
        tableHeaders.push(COLUMN_HEADER_BGtoEN_MAPPER.get(
          $(element)
            .text()
            .toLowerCase())
        );
      });
      return true;
    }
    const tds = $(element).find("td");
    const tableRow = {};
    $(tds).each((i, element) => {
      if (tableHeaders[i])
        tableRow[tableHeaders[i]] = $(element).text().trim();
    });
    if (!filter.isActive || (filter.isActive && tableRow[filter.key].toLowerCase().substr(0,filter.value.length) === filter.value.toLowerCase()))
      scrapedData.push(tableRow);
  });
  //console.log(scrapedData);
  return scrapedData;
}
