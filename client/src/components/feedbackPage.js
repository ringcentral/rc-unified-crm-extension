function getFeedbackPageRender() {
    return {
        id: 'feedbackPage',
        title: 'Feedback',
        schema: {
            type: 'object',
            required: ['score', 'feedback'],
            properties: {
                pageDescription:{
                    type: 'string',
                    description: 'RingCentral CRM Extension is currently in beta. We welcome any problem reports, feedback, ideas and feature requests you may have.'
                },
                scoreDescription: {
                    type: 'string',
                    description: 'How likely are you to recommend the Unified CRM Extension to a friend or colleague?'
                },
                score: {
                    title: 'Score from 1 to 10',
                    type: 'string',
                    oneOf: [
                        { const: '1', title: '1' },
                        { const: '2', title: '2' },
                        { const: '3', title: '3' },
                        { const: '4', title: '4' },
                        { const: '5', title: '5' },
                        { const: '6', title: '6' },
                        { const: '7', title: '7' },
                        { const: '8', title: '8' },
                        { const: '9', title: '9' },
                        { const: '10', title: '10' }
                    ]
                },
                feedback: {
                    title: 'Feedback',
                    type: 'string'
                }
            }
        },
        uiSchema: {
            feedback: {
                "ui:placeholder": 'Please share your feedback...',
                "ui:widget": "textarea",
            },
            pageDescription: {
                "ui:field": "typography",
                "ui:variant": "body1", // "caption1", "caption2", "body1", "body2", "subheading2", "subheading1", "title2", "title1"
            },
            scoreDescription: {
                "ui:field": "typography",
                "ui:variant": "body2", // "caption1", "caption2", "body1", "body2", "subheading2", "subheading1", "title2", "title1"
            },
            submitButtonOptions: { // optional if you don't want to show submit button
                submitText: 'Submit',
            }
        },
        formData: {}
    }
}

exports.getFeedbackPageRender = getFeedbackPageRender;