const axios = require('axios');

const apiUrl = "https://td2992101.suitetalk.api.netsuite.com/services/rest/record/v1/contact"; // Replace with your API URL

const phoneNumbers = [
    "(980) 326-2689",
    "(650) 844-6728",
    "(980) 495-2395",
    "+17206789819",
    "+16579991394",
    "(980) 890-7415"
];

function getRandomPhoneNumber() {
    const randomIndex = Math.floor(Math.random() * phoneNumbers.length);
    return phoneNumbers[randomIndex];
}

async function runRequests(times) {
    const requests = [];
    let firstName = "SushilTest";
    for (let i = 126012; i < times; i++) {
        let contactPayLoad = {
            firstName: firstName + i,
            lastName: "Mall",
            phone: getRandomPhoneNumber(),
            company: { id: "1646" },
            subsidiary: {
                "id": 1
            }
        };
        try {
            const response = await axios.post(apiUrl, contactPayLoad, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer abc"
                }
            });
        } catch (error) {
            console.error({ error });
        }

    }
}

// Run the API call 100 times
runRequests(150000);
