const axios = require('axios');

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    const newContact = {
        id: 'testContactId',
        name: newContactName,
        type: newContactType,
        phone: phoneNumber,
        additionalInfo: {
            associatedDeal: [
                {
                    const: 'csA351',
                    title: 'Christmas special A351'
                },
                {
                    const: 'eA22',
                    title: 'Easter A22'
                },
                {
                    const: 'aC92',
                    title: 'Anniversary C92'
                }
            ],
            address: ''
        }
    }
    
    // Using mock JSON as CRM response
    const fs = require('fs');
    const path = require('path');
    const mockContactsPath = path.join(__dirname, '..', 'mockContacts.json');
    const mockContacts = require(mockContactsPath);
    mockContacts.push(newContact);
    fs.writeFileSync(mockContactsPath, JSON.stringify(mockContacts, null, 2));

    //--------------------------------------------------------------------------------
    //--- CHECK: In extension, try create a new contact against an unknown number ----
    //--------------------------------------------------------------------------------

    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--- TODO: Delete above mock JSON -----
    //--------------------------------------
    // const postBody = {
    //     name: newContactName,
    //     type: newContactType,
    //     phone_numbers: [
    //         {
    //             name: "Work",
    //             number: phoneNumber,
    //             default_number: true
    //         }
    //     ]
    // }
    // const contactInfoRes = await axios.post(
    //     `https://api.crm.com/contacts`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     }
    // );
    return {
        contactInfo: {
            id: newContact.id,
            name: newContact.name
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        }
    }
}

module.exports = createContact;