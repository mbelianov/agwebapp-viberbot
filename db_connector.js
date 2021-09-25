const IBMCloudEnv = require('ibm-cloud-env');
IBMCloudEnv.init('/mappings.json');

// initialize Cloudant
const CloudantSDK = require('@cloudant/cloudant');
const cloudant = new CloudantSDK(IBMCloudEnv.getString('cloudant_url'));

// create viberbot-db database if it does not already exist. this db will contain viber user's profiles that can query bodimied db
cloudant.db.create('viberbot-db')
    .then(data => {
        console.log('viberbot-db database created');
    })
    .catch(error => {
        if (error.error === 'file_exists') {
            console.log('viberbot-db database already exists');
        } else {
            console.log('Error occurred when creating viberbot-db database', error.error);
        }
    });
const db = cloudant.db.use('viberbot-db');


//get all registered profiles in viber bot db. each profile in viberbot db can request data from bodimed db
let profiles = [];
exports.listProfiles = () => db.list({ include_docs: true })
    .then(fetchedProfiles => {
        let row = 0;
        fetchedProfiles.rows.forEach(fetchedPofile => {
            profiles[row] = {
                id: fetchedPofile.id,
                rev: fetchedPofile.value.rev,
                profile: fetchedPofile.doc
            };
            row = row + 1;
        });
        console.log('Get profiles successful', profiles);
        return profiles;
    })
    .catch(error => {
        console.log('Get profiles failed: ', error.error);
        return [];
    });


// add profile in the viberbot-db
exports.addProfile = (profile) => db.insert(profile)
    .then(addedProfile => {
        console.log('Add profile successful: ', addedProfile);
        return addedProfile;
    })
    .catch(error => {
        console.log('Add profile failed: ', error.error);
        return {};
    });

//delete profile from viberbot-db
exports.deleteProfile = (profiles) => db.destroy(profiles[0].id, profiles[0].rev)
    .then(response => {
      console.log('success deleting profile');
      return (0);

    })
    .catch(error => {
      console.log('error occured when deleting profile: ', error.error);
      return 1;

    });