const axios = require("axios");
const cheerio = require("cheerio");
const win1251 = require('./windows-1251');

/**
 * get exam results from Bodimed database. We are scraping their website. not the best approach but this is what we have...
 * @param idnap id of the exam in Bodimed database
 * @param pass password for accessing the results
 * @return HTML page with the exam reults
 */

exports.getResults = (context, query) => {
  context.log('In route - Bodimed.getResults');

  let headersList = {
    "Accept": "*/*",
    "User-Agent": "Axios Client",
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
    .then(async function (response) {
      let result = win1251.decode(response.data)

      let outcome = extractOutcome(context, result);
      return ({ result, outcome });
    })
    .catch(error => {
      context.log.error("getResults from Bodimed failed", error);
      return ({
        message: 'getResults from Bodimed failed',
        error: error,
      });
    });
}

extractOutcome = (azf_context, exam_protocol) => {
  const $ = cheerio.load(exam_protocol);
  const organics = $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(4) > td").text().trim().replace(/\s+/g, ' ');
  const conclusion = $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(7) > td").text().trim().replace(/\s+/g, ' ');
  const recommendation = $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(8) > td").text().trim().replace(/\s+/g, ' ');

  return {
    name: $("body > p:nth-child(2) > span.text-md > strong").text().trim(),
    mldata: organics+conclusion+recommendation,
    results: [{
      title: $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(1) > td").text().trim().replace(/\s+/g, ' '),
      type: $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td.bottom_right.print_col_left.text-lg").text().trim().replace(/\s+/g, ' '),
      conclusion: $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(7) > td").text().trim().replace(/\s+/g, ' '),
      recommendation: $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(8) > td").text().trim().replace(/\s+/g, ' '),
    },
    {
      title: $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(1) > td").text().trim().replace(/\s+/g, ' '),
      type: $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td.bottom_right.print_col_left.text-lg").text().trim().replace(/\s+/g, ' '),
      conclusion: $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(7) > td").text().trim().replace(/\s+/g, ' '),
      recommendation: $("body > p:nth-child(2) > table.table-border > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(8) > td").text().trim().replace(/\s+/g, ' ')
    }]}
}

/**
 * get patient list from Bodimed. We are scraping their website. not the best approach but this is what we have...
 * @param egn the EGN of the patinet we are serching
 * @param name the first name of the patient. if both egn and name are provided, egn will be used
 * @param fromDate start date of the period we search
 * @param untilDate start date of the period we search
 * @return JSON array with all found patients
 */
exports.getPatients = (context, filter_string, filter_type = "name") => {
  context.log('In Bodimed.getPatients');

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
  d = new Date(d.getTime() - 5 * 30 * 24 * 3600 * 1000);
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


  if (filter_type.toLowerCase() === "name") {
    filter.isActive = true,
      filter.key = 'bodimed_patient_name',
      filter.value = filter_string
  }

  if (filter_type.toLowerCase() === "egn") {
    filter.isActive = true,
      filter.key = 'bodimed_patient_egn',
      filter.value = filter_string
  }

  return axios.request(reqOptions)
    .then((response) => {
      let patientsList = scrapeTable(win1251.decode(response.data), filter);
      return { patientsList };
    })
    .catch(error => {
      context.log.error("getPatients from Bodimed failed", error);
      return {
        message: 'getPatients from Bodimed failed',
        error: error,
      };
    });
};

const COLUMN_HEADER_BGtoEN_MAPPER = new Map([
  ["id", "bodimed_patient_id"],
  ["парола", "bodimed_patient_password"],
  ["мдд номер", "bodimed_mdd_number"],
  ["дата на изд.", "bodimed_issue_date"],
  ["дата на изпълнение", "bodimed_execution_date"],
  ["егн пациент", "bodimed_patient_egn"],
  ["име пациент", "bodimed_patient_name"],
  ["презиме пациент", "bodimed_patient_surname"],
  ["фамилия пациент", "bodimed_patient_familyname"],
  //["сума на напр.","bodimed_charge_ammount"],
  //["схема на продажба", "bodimed_sales_plan"],
  //["резулт", "bodimed_result"]
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
    if (!filter.isActive || (filter.isActive && tableRow[filter.key].toLowerCase().substr(0, filter.value.length) === filter.value.toLowerCase()))
      scrapedData.push(tableRow);
  });
  //console.log(scrapedData);
  return scrapedData;
}
