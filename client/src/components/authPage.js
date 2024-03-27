const config = require('../config.json')

function getAuthPageRender({ platformName }) {
    const platformConfig = config.platforms[platformName].page.auth;
    const pageTitle = platformConfig.title;
    const required = platformConfig.content.filter(c => c.required).map(c => { return c.const });
    const warning = platformConfig.warning ? {
        warning: {
            type: 'string',
            description: platformConfig.warning,
        }
    } : {};
    let content = {};
    for (const c of platformConfig.content) {
        content[c.const] = {
            title: c.title,
            type: c.type
        }
    }
    let uiSchema = {
        submitButtonOptions: { // optional if you don't want to show submit button
            submitText: 'Connect',
        },
        warning: {
            "ui:field": "admonition",
            "ui:severity": "warning",  // "warning", "info", "error", "success"
        }
    };
    for (const c of platformConfig.content) {
        if (!!c.uiSchema) {
            uiSchema[c.const] = c.uiSchema;
        }
    }
    let formData = {};
    for (const c of platformConfig.content) {
        if (!!c.defaultValue) {
            formData[c.const] = c.defaultValue;
        }
    }
    const page = {
        id: 'authPage',
        title: pageTitle,
        schema: {
            type: 'object',
            required,
            properties: {
                ...warning,
                ...content
            }
        },
        uiSchema,
        formData
    }
    return page;
}

exports.getAuthPageRender = getAuthPageRender;