async function getLicenseStatus({ pluginAuth }) {
    // pluginAuth :
    // {
    //     rcAccountId: "1234567890"
    // }
    const licenseTier = 'Basic';
    return {
        licenseStatus: true,
        licenseStatusDescription: `License: ${licenseTier}`
    };
}

exports.getLicenseStatus = getLicenseStatus;