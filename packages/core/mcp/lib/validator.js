/**
 * Validates a connector manifest structure
 * @param {Object} params - The validation parameters
 * @param {Object} params.connectorManifest - The connector manifest object
 * @param {string} params.connectorName - The name of the connector (e.g., 'clio')
 * @returns {Object} Validation result with isValid boolean and errors array
 */
function isManifestValid({ connectorManifest, connectorName }) {
    const errors = [];

    // Check basic manifest structure
    if (!connectorManifest) {
        errors.push('connectorManifest is required');
        return { isValid: false, errors };
    }

    if (!connectorManifest.platforms) {
        errors.push('connectorManifest.platforms is required');
        return { isValid: false, errors };
    }

    const platform = connectorManifest.platforms[connectorName];
    if (!platform) {
        errors.push(`Platform "${connectorName}" not found in manifest`);
        return { isValid: false, errors };
    }

    // Validate auth configuration
    if (!platform.auth) {
        errors.push('platform.auth is required');
    } else {
        if (!platform.auth.type) {
            errors.push('platform.auth.type is required');
        } else {
            const authType = platform.auth.type.toLowerCase();
            if (authType === 'oauth') {
                if (!platform.auth.oauth) {
                    errors.push('platform.auth.oauth configuration is required for oauth type');
                } else {
                    if (!platform.auth.oauth.authUrl) {
                        errors.push('platform.auth.oauth.authUrl is required');
                    }
                    if (!platform.auth.oauth.clientId) {
                        errors.push('platform.auth.oauth.clientId is required');
                    }
                }
            } else if (authType === 'apikey') {
                if (!platform.auth.apiKey) {
                    errors.push('platform.auth.apiKey configuration is required for apiKey type');
                }
            }
        }
    }

    // Validate environment configuration (optional but if present, must have type)
    if (platform.environment) {
        if (!platform.environment.type) {
            errors.push('platform.environment.type is required when environment is specified');
        } else {
            const envType = platform.environment.type.toLowerCase();
            if (envType === 'selectable' && (!platform.environment.selections || platform.environment.selections.length === 0)) {
                errors.push('platform.environment.selections is required for selectable environment type');
            }
        }
    }

    // Validate required string fields
    if (!platform.name) {
        errors.push('platform.name is required');
    }

    // Validate optional but important fields
    if (platform.settings && !Array.isArray(platform.settings)) {
        errors.push('platform.settings must be an array if specified');
    }

    if (platform.contactTypes && !Array.isArray(platform.contactTypes)) {
        errors.push('platform.contactTypes must be an array if specified');
    }

    if (platform.override && !Array.isArray(platform.override)) {
        errors.push('platform.override must be an array if specified');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

exports.isManifestValid = isManifestValid;
