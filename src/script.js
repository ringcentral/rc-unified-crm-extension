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
    for (let i = 13442; i < times; i++) {
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
                    "Authorization": "Bearer eyJraWQiOiJjLlREMjk5MjEwMS4yMDI1LTAyLTI1XzAwLTAyLTA0IiwidHlwIjoiSldUIiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiIxMTcxOy01IiwiYXVkIjpbIkY2ODc0RjMyLUY3N0UtNDFERS04RkUwLTIzRTQ2QzhEMDhBNjtURDI5OTIxMDEiLCIxODA1OTMzNjA2OWQ1ZmY2OWZmYmQ0NTVjZjZiYmM2OTE4YTQ2YTQwMTgyNTBjMTI0NWM0YjM2MWY5YjNlMjIxIl0sInNjb3BlIjpbInJlc3RsZXRzIiwicmVzdF93ZWJzZXJ2aWNlcyJdLCJpc3MiOiJodHRwczovL3N5c3RlbS5uZXRzdWl0ZS5jb20iLCJvaXQiOjE3NDEyNDQzNzMsImV4cCI6MTc0MTI1NjM5OSwiaWF0IjoxNzQxMjUyNzk5LCJqdGkiOiJURDI5OTIxMDEuYS1hLmJhYmEwZTAwLTM0MmQtNDYzNC1iOTIzLTFkZTExMWRiMjg3ZV8xNzQxMjQ0MzczNjc2LjE3NDEyNTI3OTkxNzIifQ.v7NAsO8QQ-C3dE5whGj0__VnPjLg-gAGQoF5DN4iTtl5bMlvDDt-OFUfrC2hC7oarEq4xSWkzOgS25Rn67k50QKl_bvV8pfoghJshQA51FtfnSB35PYSSpiNj7_AphYwbQTm1wVusr109_kjO4C0mpyU6vpZoHSuE-B4iF4hZFkPs8Pi69SH1Ewse20qK_c1ybewl9tXgGRPYHw9uQpq-oo7qrC4BDt-ILB6cH-X8q75TIy8PSvMJd0tWJdJxoSFKdKMumLdYXzbQ2LGxJoEVa9d5kSoYf342MWlTMHi-BJd7SljLlpemwziPR3eFq8UwoDPZoTxy0pEf5MhhhHCtZqUodF8O3aSfKx8yua51kYxBB5FybPuN0s2-kXh0th1CJOQFG0Pt2oRyIhnHrfo1_ynNkV6jE7YGS9Uyiqyu6Aa8yxypgqd3aKUPfmqrA1x0dFw7IfMhJ1ZyPrT--W4SMboKdKWEVuYW0C6DEmzEqM_6OlvQpLg0DDLU7WHIO2xJK4uv2-FqYfGgTZ2-aoY6RWRKUkzJx-OGiSycZUirtbbWvOxts23MnfOiWa_q2WUEYciO7zAvnYPVJbe8kqfpwUUHMEkdRxqCONmhR8GVjrlbAvQbsLthZeNuGUghYqMkg-jgWLG2aZEaqtfhsg2K3N2N4agTBvc2k5lJPvnymY"
                }
            });
        } catch (error) {
            console.error({ error });
        }

    }
}

// Run the API call 100 times
runRequests(20000);
