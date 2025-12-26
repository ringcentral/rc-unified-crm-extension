const { redactPii } = require('../src/processors/piiRedactionProcessor');

describe('piiRedactionProcessor', () => {
    describe('field-name based redaction', () => {
        test('should redact phoneNumber field regardless of format', () => {
            const input = {
                phoneNumber: '+17206789819'
            };
            const result = redactPii(input);
            expect(result.phoneNumber).toBe('[REDACTED_PHONE]');
        });

        test('should redact phone field', () => {
            const input = {
                phone: '650-362-6712'
            };
            const result = redactPii(input);
            expect(result.phone).toBe('[REDACTED_PHONE]');
        });

        test('should redact mobilePhone field', () => {
            const input = {
                mobilePhone: '+1 (650) 362-6712'
            };
            const result = redactPii(input);
            expect(result.mobilePhone).toBe('[REDACTED_PHONE]');
        });

        test('should redact email field', () => {
            const input = {
                email: 'test@example.com'
            };
            const result = redactPii(input);
            expect(result.email).toBe('[REDACTED_EMAIL]');
        });

        test('should redact emailAddress field', () => {
            const input = {
                emailAddress: 'user@domain.org'
            };
            const result = redactPii(input);
            expect(result.emailAddress).toBe('[REDACTED_EMAIL]');
        });

        test('should redact ssn field', () => {
            const input = {
                ssn: '123456789'
            };
            const result = redactPii(input);
            expect(result.ssn).toBe('[REDACTED_SSN]');
        });

        test('should redact creditCard field', () => {
            const input = {
                creditCard: '4111111111111111'
            };
            const result = redactPii(input);
            expect(result.creditCard).toBe('[REDACTED_CREDIT_CARD]');
        });

        test('should redact nested phoneNumber fields', () => {
            const input = {
                to: {
                    name: 'DENVER CO',
                    phoneNumber: '+17206789819'
                },
                from: {
                    name: 'Da Kong',
                    phoneNumber: '+16503626712'
                }
            };
            const result = redactPii(input);
            expect(result.to.phoneNumber).toBe('[REDACTED_PHONE]');
            expect(result.from.phoneNumber).toBe('[REDACTED_PHONE]');
            expect(result.to.name).toBe('DENVER CO');
            expect(result.from.name).toBe('Da Kong');
        });

        test('should redact phoneNumber in arrays', () => {
            const input = {
                phoneNumbers: [
                    { phoneNumber: '+16503626712', phoneType: 'direct' },
                    { phoneNumber: '+17206789819', phoneType: 'mobile' }
                ]
            };
            const result = redactPii(input);
            expect(result.phoneNumbers[0].phoneNumber).toBe('[REDACTED_PHONE]');
            expect(result.phoneNumbers[1].phoneNumber).toBe('[REDACTED_PHONE]');
            expect(result.phoneNumbers[0].phoneType).toBe('direct');
            expect(result.phoneNumbers[1].phoneType).toBe('mobile');
        });
    });

    describe('should NOT redact non-PII fields', () => {
        test('should NOT redact sessionId with numeric value', () => {
            const input = {
                sessionId: '1708336148048'
            };
            const result = redactPii(input);
            expect(result.sessionId).toBe('1708336148048');
        });

        test('should NOT redact extensionId', () => {
            const input = {
                extensionId: '1021461048'
            };
            const result = redactPii(input);
            expect(result.extensionId).toBe('1021461048');
        });

        test('should NOT redact account IDs in URIs', () => {
            const input = {
                uri: 'https://platform.ringcentral.com/restapi/v1.0/account/485987048/extension/1021461048'
            };
            const result = redactPii(input);
            expect(result.uri).toBe('https://platform.ringcentral.com/restapi/v1.0/account/485987048/extension/1021461048');
        });

        test('should NOT redact telephonySessionId', () => {
            const input = {
                telephonySessionId: 's-a7191271558f2z19b537bedf7z125e0e10000'
            };
            const result = redactPii(input);
            expect(result.telephonySessionId).toBe('s-a7191271558f2z19b537bedf7z125e0e10000');
        });

        test('should NOT redact partyId', () => {
            const input = {
                partyId: 'p-a7191271558f2z19b537bedf7z125e0e10000-2'
            };
            const result = redactPii(input);
            expect(result.partyId).toBe('p-a7191271558f2z19b537bedf7z125e0e10000-2');
        });

        test('should NOT redact numeric id fields', () => {
            const input = {
                id: 2051197353,
                extension: {
                    id: 1021461048
                }
            };
            const result = redactPii(input);
            expect(result.id).toBe(2051197353);
            expect(result.extension.id).toBe(1021461048);
        });

        test('should NOT redact startTime timestamp', () => {
            const input = {
                startTime: 1766632189625
            };
            const result = redactPii(input);
            expect(result.startTime).toBe(1766632189625);
        });

        test('should NOT redact matter IDs', () => {
            const input = {
                matters: 1745737711,
                additionalInfo: {
                    matters: [
                        { const: 1652634481, title: '00010-Lab1' }
                    ]
                }
            };
            const result = redactPii(input);
            expect(result.matters).toBe(1745737711);
            expect(result.additionalInfo.matters[0].const).toBe(1652634481);
        });

        test('should NOT redact contactId', () => {
            const input = {
                contactId: 2289883081
            };
            const result = redactPii(input);
            expect(result.contactId).toBe(2289883081);
        });
    });

    describe('pattern-based redaction in free text', () => {
        test('should redact phone numbers with + prefix in free text', () => {
            const input = {
                note: 'Called customer at +17206789819 regarding order'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Called customer at [REDACTED_PHONE] regarding order');
        });

        test('should redact phone numbers with dashes in free text', () => {
            const input = {
                description: 'Contact number: 720-678-9819'
            };
            const result = redactPii(input);
            expect(result.description).toBe('Contact number: [REDACTED_PHONE]');
        });

        test('should redact phone numbers with dots in free text', () => {
            const input = {
                note: 'Phone: 720.678.9819'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Phone: [REDACTED_PHONE]');
        });

        test('should redact phone numbers with parentheses in free text', () => {
            const input = {
                note: 'Call (720) 678-9819'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Call [REDACTED_PHONE]');
        });

        test('should redact email addresses in free text', () => {
            const input = {
                note: 'Email sent to john.doe@example.com about the meeting'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Email sent to [REDACTED_EMAIL] about the meeting');
        });

        test('should redact SSN with dashes in free text', () => {
            const input = {
                note: 'SSN: 123-45-6789'
            };
            const result = redactPii(input);
            expect(result.note).toBe('SSN: [REDACTED_SSN]');
        });

        test('should redact SSN with dots in free text', () => {
            const input = {
                note: 'SSN: 123.45.6789'
            };
            const result = redactPii(input);
            expect(result.note).toBe('SSN: [REDACTED_SSN]');
        });

        test('should redact credit card with dashes in free text', () => {
            const input = {
                note: 'Card: 4111-1111-1111-1111'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Card: [REDACTED_CREDIT_CARD]');
        });

        test('should redact IP addresses in free text', () => {
            const input = {
                note: 'User connected from 192.168.1.100'
            };
            const result = redactPii(input);
            expect(result.note).toBe('User connected from [REDACTED_IP]');
        });

        test('should NOT redact plain 9-digit numbers without separators', () => {
            const input = {
                note: 'Account ID: 485987048'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Account ID: 485987048');
        });

        test('should NOT redact plain 10-digit numbers without separators', () => {
            const input = {
                note: 'Extension: 1021461048'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Extension: 1021461048');
        });

        test('should NOT redact plain 13-digit numbers', () => {
            const input = {
                note: 'Session: 1708336148048'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Session: 1708336148048');
        });
    });

    describe('edge cases', () => {
        test('should handle null input', () => {
            const result = redactPii(null);
            expect(result).toBeNull();
        });

        test('should handle undefined input', () => {
            const result = redactPii(undefined);
            expect(result).toBeUndefined();
        });

        test('should handle empty object', () => {
            const result = redactPii({});
            expect(result).toEqual({});
        });

        test('should handle empty array', () => {
            const result = redactPii([]);
            expect(result).toEqual([]);
        });

        test('should handle empty string', () => {
            const result = redactPii('');
            expect(result).toBe('');
        });

        test('should handle string input directly', () => {
            const result = redactPii('Call me at +17206789819');
            expect(result).toBe('Call me at [REDACTED_PHONE]');
        });

        test('should handle number input directly', () => {
            const result = redactPii(12345);
            expect(result).toBe(12345);
        });

        test('should handle boolean input', () => {
            const result = redactPii(true);
            expect(result).toBe(true);
        });

        test('should not redact empty phoneNumber field', () => {
            const input = {
                phoneNumber: ''
            };
            const result = redactPii(input);
            // Empty strings in PII fields remain as-is
            expect(result.phoneNumber).toBe('');
        });

        test('should handle deeply nested objects', () => {
            const input = {
                level1: {
                    level2: {
                        level3: {
                            phoneNumber: '+17206789819'
                        }
                    }
                }
            };
            const result = redactPii(input);
            expect(result.level1.level2.level3.phoneNumber).toBe('[REDACTED_PHONE]');
        });

        test('should handle arrays of strings', () => {
            const input = ['test@example.com', 'normal string', '+17206789819'];
            const result = redactPii(input);
            expect(result[0]).toBe('[REDACTED_EMAIL]');
            expect(result[1]).toBe('normal string');
            expect(result[2]).toBe('[REDACTED_PHONE]');
        });

        test('should handle mixed arrays', () => {
            const input = [
                { phoneNumber: '+17206789819' },
                'test@example.com',
                12345,
                null
            ];
            const result = redactPii(input);
            expect(result[0].phoneNumber).toBe('[REDACTED_PHONE]');
            expect(result[1]).toBe('[REDACTED_EMAIL]');
            expect(result[2]).toBe(12345);
            expect(result[3]).toBeNull();
        });
    });

    describe('real-world call log data', () => {
        test('should correctly redact call log data without over-redacting', () => {
            const input = {
                logInfo: {
                    id: 'AI1PbNC0BTgpK81A',
                    sessionId: '1708336148048',
                    startTime: 1766632189625,
                    duration: 9,
                    durationMs: 9126,
                    type: 'Voice',
                    internalType: 'LongDistance',
                    direction: 'Outbound',
                    action: 'VoIP Call',
                    result: 'Call connected',
                    to: {
                        name: 'DENVER CO',
                        phoneNumber: '+17206789819',
                        location: 'Denver, CO'
                    },
                    from: {
                        name: 'Da Kong',
                        phoneNumber: '+16503626712',
                        extensionId: '1021461048'
                    },
                    extension: {
                        uri: 'https://platform.ringcentral.com/restapi/v1.0/account/485987048/extension/1021461048',
                        id: 1021461048
                    },
                    telephonySessionId: 's-a7191271558f2z19b537bedf7z125e0e10000',
                    partyId: 'p-a7191271558f2z19b537bedf7z125e0e10000-2',
                    fromName: 'Da Kong',
                    toName: 'DENVER CO',
                    fromMatches: [
                        {
                            id: 2051197353,
                            type: 'clio',
                            name: 'Pineapple Publishing',
                            phoneNumbers: [
                                {
                                    phoneNumber: '+16503626712',
                                    phoneType: 'direct'
                                }
                            ],
                            entityType: 'clio',
                            contactType: 'Company',
                            additionalInfo: {
                                matters: [
                                    {
                                        const: 1652634481,
                                        title: '00010-Lab1',
                                        description: 'Pineapple Publishing vs. Citrus Media Group',
                                        status: 'Open'
                                    }
                                ],
                                logTimeEntry: true,
                                nonBillable: {
                                    customizable: true,
                                    value: false
                                }
                            },
                            mostRecentActivityDate: '2025-04-02T05:06:18+08:00'
                        }
                    ],
                    toMatches: [
                        {
                            id: 2289883081,
                            type: 'clio',
                            name: 'Da Prod',
                            phoneNumbers: [
                                {
                                    phoneNumber: '+17206789819',
                                    phoneType: 'direct'
                                }
                            ],
                            entityType: 'clio',
                            contactType: 'Person',
                            additionalInfo: {
                                matters: [
                                    {
                                        const: 1745737711,
                                        title: '00030-Prod',
                                        description: 'dfgsd',
                                        status: 'Open'
                                    }
                                ],
                                logTimeEntry: true,
                                nonBillable: {
                                    customizable: true,
                                    value: false
                                }
                            },
                            mostRecentActivityDate: '2025-11-06T16:09:59+08:00'
                        }
                    ],
                    activityMatches: [],
                    toNumberEntity: 1754,
                    customSubject: 'Outbound Call to Da Prod'
                },
                note: '',
                aiNote: null,
                additionalSubmission: {
                    matters: 1745737711
                },
                overridingFormat: [],
                contactId: 2289883081,
                contactType: 'Person',
                contactName: 'Da Prod'
            };

            const result = redactPii(input);

            // Should redact phone numbers in phoneNumber fields
            expect(result.logInfo.to.phoneNumber).toBe('[REDACTED_PHONE]');
            expect(result.logInfo.from.phoneNumber).toBe('[REDACTED_PHONE]');
            expect(result.logInfo.fromMatches[0].phoneNumbers[0].phoneNumber).toBe('[REDACTED_PHONE]');
            expect(result.logInfo.toMatches[0].phoneNumbers[0].phoneNumber).toBe('[REDACTED_PHONE]');

            // Should NOT redact non-PII fields
            expect(result.logInfo.sessionId).toBe('1708336148048');
            expect(result.logInfo.from.extensionId).toBe('1021461048');
            expect(result.logInfo.extension.uri).toBe('https://platform.ringcentral.com/restapi/v1.0/account/485987048/extension/1021461048');
            expect(result.logInfo.extension.id).toBe(1021461048);
            expect(result.logInfo.telephonySessionId).toBe('s-a7191271558f2z19b537bedf7z125e0e10000');
            expect(result.logInfo.partyId).toBe('p-a7191271558f2z19b537bedf7z125e0e10000-2');
            expect(result.logInfo.fromMatches[0].id).toBe(2051197353);
            expect(result.logInfo.fromMatches[0].additionalInfo.matters[0].const).toBe(1652634481);
            expect(result.additionalSubmission.matters).toBe(1745737711);
            expect(result.contactId).toBe(2289883081);

            // Should preserve other fields
            expect(result.logInfo.id).toBe('AI1PbNC0BTgpK81A');
            expect(result.logInfo.type).toBe('Voice');
            expect(result.logInfo.to.name).toBe('DENVER CO');
            expect(result.logInfo.from.name).toBe('Da Kong');
            expect(result.logInfo.customSubject).toBe('Outbound Call to Da Prod');
            expect(result.contactName).toBe('Da Prod');
        });
    });

    describe('multiple PII types in same string', () => {
        test('should redact multiple phone numbers in same string', () => {
            const input = {
                note: 'Call from +17206789819 transferred to +16503626712'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Call from [REDACTED_PHONE] transferred to [REDACTED_PHONE]');
        });

        test('should redact phone and email in same string', () => {
            const input = {
                note: 'Contact: +17206789819 or test@example.com'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Contact: [REDACTED_PHONE] or [REDACTED_EMAIL]');
        });

        test('should redact all PII types in same string', () => {
            const input = {
                note: 'User test@example.com, phone +17206789819, SSN 123-45-6789, IP 192.168.1.1'
            };
            const result = redactPii(input);
            expect(result.note).toBe('User [REDACTED_EMAIL], phone [REDACTED_PHONE], SSN [REDACTED_SSN], IP [REDACTED_IP]');
        });
    });

    describe('international phone formats', () => {
        test('should redact international phone with + prefix', () => {
            const input = {
                note: 'UK number: +442071234567'
            };
            const result = redactPii(input);
            expect(result.note).toBe('UK number: [REDACTED_PHONE]');
        });

        test('should redact long international numbers', () => {
            const input = {
                note: 'Number: +861391234567'
            };
            const result = redactPii(input);
            expect(result.note).toBe('Number: [REDACTED_PHONE]');
        });
    });
});

