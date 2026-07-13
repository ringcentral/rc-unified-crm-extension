const axios = require('axios');

async function findContactWithName({ user, authHeader, name }) {
    const matchedContactInfo = [];
    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--------------------------------------
    // const personInfo = await axios.get(`https://${user.hostname}/api/v4/contacts.json?type=Person&query=${name}&fields=id,name,title,company,primary_phone_number`, {
    //     headers: { 'Authorization': authHeader }
    // });
    // const matchedContactInfo = personInfo.data.filter(contact => contact.name.includes(name)).map(contact => {
    //     return {
    //         id: contact.id,
    //         name: contact.name,
    //         type: contact.type,
    //         phone: contact.primary_phone_number
    //     }
    // });
    return {
        successful: true,
        matchedContactInfo
    }
}

module.exports = findContactWithName;