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
                    "Authorization": "Bearer eyJraWQiOiJjLlREMjk5MjEwMS4yMDI1LTAyLTI1XzAwLTAyLTA0IiwidHlwIjoiSldUIiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiIxMTcxOy01IiwiYXVkIjpbIkY2ODc0RjMyLUY3N0UtNDFERS04RkUwLTIzRTQ2QzhEMDhBNjtURDI5OTIxMDEiLCIxODA1OTMzNjA2OWQ1ZmY2OWZmYmQ0NTVjZjZiYmM2OTE4YTQ2YTQwMTgyNTBjMTI0NWM0YjM2MWY5YjNlMjIxIl0sInNjb3BlIjpbInJlc3RsZXRzIiwicmVzdF93ZWJzZXJ2aWNlcyJdLCJpc3MiOiJodHRwczovL3N5c3RlbS5uZXRzdWl0ZS5jb20iLCJvaXQiOjE3NDE3ODIyMjYsImV4cCI6MTc0MTc4NTgyNiwiaWF0IjoxNzQxNzgyMjI2LCJqdGkiOiJURDI5OTIxMDEuYS1hLmRhNjExZDBlLWE1NzktNDdlYi1iZmZjLTJhN2E1NGJmMzQ5NF8xNzQxNzgyMjI2ODE5LjE3NDE3ODIyMjY4MTkifQ.nWsdqwV48vKGw-PPWYNhBNDv1fxmXyBoBKm6CwOSOfzjNbtj66KiiQEGIg3Ch6xNdAJfltMd_RXduehWehHGGNWrLcVD0hQccjy5oi0uTD7XjlyMik5fqdCYhKjX6CuTBxwBhG6ju0VSVlFmDl_LCS8GCAW21sFSfiU8fwiInAp2B4C-xDObzOcvX4Pk0Kd4OdzNVunE3bF_nq2Tu_KxkxHbJQ7V65shgdGqWrq456izAbgcJwoZ6U_UDMx1XzmPwSyfHNDslDKLdLalOBY8Yxcsj52QL6Dn0WVc-fgURwKcg8GmxQ-UTA0BmOhlUzD3EchN2w2UudfsOhUecA1StNqyCYTa4k2R2HK25kAGjAYRxd5uUEctghKH4PEkDuxsHOwaNj_xHy0bJ17lL5XT4jk0NiS5db9meYc7Xr6v1yq8zLKALWXh_QYpPGIPeNE1s2XrpkPSZgFiquKX1FMMGigF9ipvZS2X3eT3P1s0w17XCeKFJOBe-oipUXgzk2gOSaxCyO8Jgxjo0fbG82ElgYAsJHhMVDlT3XMLaY63CHQFUxNyckWQx0ST8XWo-BZhiF3RaStrBMPf_bNwvMRCNq_WDok3QZsOsqtTVVjAJat4Z3SfG5snYEb5fIsre39QxE4GQrOly9Zcx63t8YrXpB-fSe_HSHGepj2yuj245QY"
                }
            });
        } catch (error) {
            console.error({ error });
        }

    }
}

// Run the API call 100 times
runRequests(150000);
