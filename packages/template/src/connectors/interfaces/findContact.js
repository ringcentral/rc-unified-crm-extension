const axios = require('axios');

async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {

    console.log(`phone number: ${phoneNumber}`)
    console.log(`is extesnion number? ${isExtension}`)
    const numberToQueryArray = [];
    if (isExtension) {
        numberToQueryArray.push(phoneNumber);
    }
    else {
        numberToQueryArray.push(phoneNumber.replace(' ', '+'));
    }

    const storedContacts = require('../mockContacts.json');
    const matchedContactInfo = [];
    const matchedContacts = storedContacts.filter(contact => contact.phone === phoneNumber);
    if (matchedContacts?.length > 0) {
        console.log(`found contacts... \n\n${JSON.stringify(matchedContacts, null, 2)}`);
        matchedContactInfo.push(...matchedContacts);
    }
    //------------------------------------------------------
    //--- CHECK: In console, if contact info is printed ----
    //------------------------------------------------------

    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--- TODO: Delete above mock JSON -----
    //--------------------------------------
    // for (var numberToQuery of numberToQueryArray) {
    //     const personInfo = await axios.get(
    //         `https://api.crm.com/contacts?query=number:${numberToQuery}`,
    //         {
    //             headers: { 'Authorization': authHeader }
    //         });
    //     if (personInfo.data.length > 0) {
    //         for (var result of personInfo.data) {
    //             foundContacts.push({
    //                 id: result.id,
    //                 name: result.name,
    //                 type: result.type,
    //                 phone: numberToQuery,
    //                 additionalInfo: null
    //             })
    //         }
    //     }
    // }

    // If you want to support creating a new contact from the extension, below placeholder contact should be used
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: null,
        isNewContact: true
    });
    return {
        successful: true,
        matchedContactInfo,
        returnMessage: {
            messageType: 'success',
            message: 'Successfully found contact.',
            detaisl: [
                {
                    title: 'Details',
                    items: [
                        {
                            id: '1',
                            type: 'text',
                            text: `Found ${matchedContactInfo.length} contacts`
                        }
                    ]
                }
            ],
            ttl: 3000
        }
    };  //[{id, name, phone, additionalInfo}]
}

module.exports = findContact;