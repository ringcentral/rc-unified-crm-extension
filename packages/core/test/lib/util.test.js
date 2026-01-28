jest.mock('tz-lookup');
jest.mock('country-state-city');

const tzlookup = require('tz-lookup');
const { State } = require('country-state-city');
const {
  getTimeZone,
  getHashValue,
  secondsToHoursMinutesSeconds,
  getMostRecentDate,
  getMediaReaderLinkByPlatformMediaLink,
  getProcessorsFromUserSettings
} = require('../../lib/util');

describe('Utility Functions', () => {
  describe('getTimeZone', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return timezone for valid state and country', () => {
      // Arrange
      State.getStateByCodeAndCountry = jest.fn().mockReturnValue({
        name: 'California',
        latitude: '36.778259',
        longitude: '-119.417931'
      });
      tzlookup.mockReturnValue('America/Los_Angeles');

      // Act
      const result = getTimeZone('US', 'CA');

      // Assert
      expect(State.getStateByCodeAndCountry).toHaveBeenCalledWith('CA', 'US');
      expect(tzlookup).toHaveBeenCalledWith('36.778259', '-119.417931');
      expect(result).toBe('America/Los_Angeles');
    });

    test('should return "Unknown timezone" when state not found', () => {
      // Arrange
      State.getStateByCodeAndCountry = jest.fn().mockReturnValue(null);

      // Act
      const result = getTimeZone('XX', 'YY');

      // Assert
      expect(result).toBe('Unknown timezone');
      expect(tzlookup).not.toHaveBeenCalled();
    });

    test('should handle different country/state combinations', () => {
      // Arrange
      State.getStateByCodeAndCountry = jest.fn().mockReturnValue({
        name: 'Tokyo',
        latitude: '35.6762',
        longitude: '139.6503'
      });
      tzlookup.mockReturnValue('Asia/Tokyo');

      // Act
      const result = getTimeZone('JP', 'TK');

      // Assert
      expect(result).toBe('Asia/Tokyo');
    });

    test('should handle European timezone', () => {
      // Arrange
      State.getStateByCodeAndCountry = jest.fn().mockReturnValue({
        name: 'Bavaria',
        latitude: '48.7904',
        longitude: '11.4979'
      });
      tzlookup.mockReturnValue('Europe/Berlin');

      // Act
      const result = getTimeZone('DE', 'BY');

      // Assert
      expect(result).toBe('Europe/Berlin');
    });
  });

  describe('getHashValue', () => {
    test('should generate consistent hash for same input', () => {
      const hash1 = getHashValue('test-string', 'secret-key');
      const hash2 = getHashValue('test-string', 'secret-key');

      expect(hash1).toBe(hash2);
    });

    test('should generate different hashes for different strings', () => {
      const hash1 = getHashValue('string-1', 'secret-key');
      const hash2 = getHashValue('string-2', 'secret-key');

      expect(hash1).not.toBe(hash2);
    });

    test('should generate different hashes for different keys', () => {
      const hash1 = getHashValue('test-string', 'key-1');
      const hash2 = getHashValue('test-string', 'key-2');

      expect(hash1).not.toBe(hash2);
    });

    test('should return a 64-character hex string (SHA-256)', () => {
      const hash = getHashValue('test', 'key');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('should handle empty string', () => {
      const hash = getHashValue('', 'secret-key');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('should handle special characters', () => {
      const hash = getHashValue('test@#$%^&*()', 'key!@#');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('secondsToHoursMinutesSeconds', () => {
    test('should return "0 seconds" for 0', () => {
      expect(secondsToHoursMinutesSeconds(0)).toBe('0 seconds');
    });

    test('should return singular "second" for 1 second', () => {
      expect(secondsToHoursMinutesSeconds(1)).toBe('1 second');
    });

    test('should return plural "seconds" for multiple seconds', () => {
      expect(secondsToHoursMinutesSeconds(30)).toBe('30 seconds');
    });

    test('should return singular "minute" for 60 seconds', () => {
      expect(secondsToHoursMinutesSeconds(60)).toBe('1 minute');
    });

    test('should return plural "minutes" for multiple minutes', () => {
      expect(secondsToHoursMinutesSeconds(120)).toBe('2 minutes');
    });

    test('should return minutes and seconds combined', () => {
      expect(secondsToHoursMinutesSeconds(90)).toBe('1 minute, 30 seconds');
    });

    test('should return singular "hour" for 3600 seconds', () => {
      expect(secondsToHoursMinutesSeconds(3600)).toBe('1 hour');
    });

    test('should return plural "hours" for multiple hours', () => {
      expect(secondsToHoursMinutesSeconds(7200)).toBe('2 hours');
    });

    test('should return hours, minutes, and seconds combined', () => {
      expect(secondsToHoursMinutesSeconds(3661)).toBe('1 hour, 1 minute, 1 second');
    });

    test('should return hours and minutes combined (no seconds)', () => {
      expect(secondsToHoursMinutesSeconds(3660)).toBe('1 hour, 1 minute');
    });

    test('should return hours and seconds combined (no minutes)', () => {
      expect(secondsToHoursMinutesSeconds(3601)).toBe('1 hour, 1 second');
    });

    test('should handle large values', () => {
      // 2 hours, 30 minutes, 45 seconds
      expect(secondsToHoursMinutesSeconds(9045)).toBe('2 hours, 30 minutes, 45 seconds');
    });

    test('should return input directly if not a number', () => {
      expect(secondsToHoursMinutesSeconds('not a number')).toBe('not a number');
      expect(secondsToHoursMinutesSeconds(undefined)).toBe(undefined);
      // Note: null coerces to 0 via isNaN(null) === false, so returns "0 seconds"
      expect(secondsToHoursMinutesSeconds(null)).toBe('0 seconds');
    });

    test('should handle NaN', () => {
      expect(secondsToHoursMinutesSeconds(NaN)).toBe(NaN);
    });
  });

  describe('getMostRecentDate', () => {
    test('should return 0 for empty array', () => {
      expect(getMostRecentDate({ allDateValues: [] })).toBe(0);
    });

    test('should return the single date from single-element array', () => {
      const date = new Date('2024-01-15').getTime();
      expect(getMostRecentDate({ allDateValues: [date] })).toBe(date);
    });

    test('should return the most recent date from multiple dates', () => {
      const date1 = new Date('2024-01-01').getTime();
      const date2 = new Date('2024-06-15').getTime();
      const date3 = new Date('2024-03-10').getTime();

      expect(getMostRecentDate({ allDateValues: [date1, date2, date3] })).toBe(date2);
    });

    test('should handle numeric timestamps', () => {
      const timestamps = [1000, 5000, 3000, 2000];
      expect(getMostRecentDate({ allDateValues: timestamps })).toBe(5000);
    });

    test('should skip null values', () => {
      const date1 = new Date('2024-01-01').getTime();
      const date2 = new Date('2024-06-15').getTime();

      expect(getMostRecentDate({ allDateValues: [date1, null, date2, null] })).toBe(date2);
    });

    test('should skip undefined values', () => {
      const date1 = new Date('2024-01-01').getTime();
      const date2 = new Date('2024-06-15').getTime();

      expect(getMostRecentDate({ allDateValues: [date1, undefined, date2] })).toBe(date2);
    });

    test('should return 0 for array with only null/undefined values', () => {
      expect(getMostRecentDate({ allDateValues: [null, undefined, null] })).toBe(0);
    });

    test('should handle all same dates', () => {
      const sameDate = new Date('2024-05-01').getTime();
      expect(getMostRecentDate({ allDateValues: [sameDate, sameDate, sameDate] })).toBe(sameDate);
    });
  });

  describe('getMediaReaderLinkByPlatformMediaLink', () => {
    test('should return null for null input', () => {
      expect(getMediaReaderLinkByPlatformMediaLink(null)).toBeNull();
    });

    test('should return null for undefined input', () => {
      expect(getMediaReaderLinkByPlatformMediaLink(undefined)).toBeNull();
    });

    test('should return null for empty string', () => {
      expect(getMediaReaderLinkByPlatformMediaLink('')).toBeNull();
    });

    test('should return media reader link for valid platform media link', () => {
      const platformLink = 'https://media.ringcentral.com/restapi/v1.0/account/123/extension/456/message-store/789/content/abc';
      const result = getMediaReaderLinkByPlatformMediaLink(platformLink);

      expect(result).toBe(`https://ringcentral.github.io/ringcentral-media-reader/?media=${encodeURIComponent(platformLink)}`);
    });

    test('should properly encode special characters in URL', () => {
      const platformLink = 'https://media.ringcentral.com/test?param=value&other=123';
      const result = getMediaReaderLinkByPlatformMediaLink(platformLink);

      expect(result).toContain('https://ringcentral.github.io/ringcentral-media-reader/?media=');
      expect(result).toContain(encodeURIComponent(platformLink));
    });

    test('should handle simple URL', () => {
      const platformLink = 'https://example.com/media.mp3';
      const result = getMediaReaderLinkByPlatformMediaLink(platformLink);

      expect(result).toBe(`https://ringcentral.github.io/ringcentral-media-reader/?media=${encodeURIComponent(platformLink)}`);
    });

    test('should handle URL with query parameters', () => {
      const platformLink = 'https://media.ringcentral.com/file?id=123&type=audio';
      const result = getMediaReaderLinkByPlatformMediaLink(platformLink);

      expect(result).toContain('ringcentral-media-reader');
      // Verify the URL is properly encoded
      expect(result).not.toContain('&type=');
      expect(result).toContain('%26type%3D');
    });
  });

  describe('getProcessorsFromUserSettings', () => {
    test('should return empty array when userSettings is null', () => {
      const result = getProcessorsFromUserSettings({
        userSettings: null,
        phase: 'beforeLogging',
        logType: 'call'
      });

      expect(result).toEqual([]);
    });

    test('should return empty array when userSettings is undefined', () => {
      const result = getProcessorsFromUserSettings({
        userSettings: undefined,
        phase: 'beforeLogging',
        logType: 'call'
      });

      expect(result).toEqual([]);
    });

    test('should return empty array when userSettings is empty object', () => {
      const result = getProcessorsFromUserSettings({
        userSettings: {},
        phase: 'beforeLogging',
        logType: 'call'
      });

      expect(result).toEqual([]);
    });

    test('should return processors matching phase and logType', () => {
      const userSettings = {
        processor_googleDrive: {
          value: {
            activated: true,
            phase: 'afterLogging',
            supportedLogType: 'call',
            name: 'Google Drive Upload',
            isAsync: true
          }
        }
      };

      const result = getProcessorsFromUserSettings({
        userSettings,
        phase: 'afterLogging',
        logType: 'call'
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('googleDrive');
      expect(result[0].value.name).toBe('Google Drive Upload');
    });

    test('should filter out non-processor settings', () => {
      const userSettings = {
        processor_piiRedaction: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'call',
            name: 'PII Redaction'
          }
        },
        theme: { value: 'dark' },
        autoLog: { value: true },
        notificationSound: { value: 'default' }
      };

      const result = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'call'
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('piiRedaction');
    });

    test('should filter out deactivated processors', () => {
      const userSettings = {
        processor_googleDrive: {
          value: {
            activated: false,
            phase: 'afterLogging',
            supportedLogType: 'call',
            name: 'Google Drive Upload'
          }
        },
        processor_piiRedaction: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'call',
            name: 'PII Redaction'
          }
        }
      };

      const result = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'call'
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('piiRedaction');
    });

    test('should correctly parse processor ID from setting key', () => {
      const userSettings = {
        processor_myCustomProcessor: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'call',
            name: 'My Custom Processor'
          }
        },
        processor_anotherOne: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'call',
            name: 'Another One'
          }
        }
      };

      const result = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'call'
      });

      expect(result).toHaveLength(2);
      const ids = result.map(r => r.id);
      expect(ids).toContain('myCustomProcessor');
      expect(ids).toContain('anotherOne');
    });

    test('should support multiple processors with different phases', () => {
      const userSettings = {
        processor_piiRedaction: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'call',
            name: 'PII Redaction'
          }
        },
        processor_googleDrive: {
          value: {
            activated: true,
            phase: 'afterLogging',
            supportedLogType: 'call',
            name: 'Google Drive Upload'
          }
        },
        processor_analytics: {
          value: {
            activated: true,
            phase: 'afterLogging',
            supportedLogType: 'call',
            name: 'Analytics'
          }
        }
      };

      // Test beforeLogging phase
      const beforeResult = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'call'
      });
      expect(beforeResult).toHaveLength(1);
      expect(beforeResult[0].id).toBe('piiRedaction');

      // Test afterLogging phase
      const afterResult = getProcessorsFromUserSettings({
        userSettings,
        phase: 'afterLogging',
        logType: 'call'
      });
      expect(afterResult).toHaveLength(2);
      const afterIds = afterResult.map(r => r.id);
      expect(afterIds).toContain('googleDrive');
      expect(afterIds).toContain('analytics');
    });

    test('should filter by logType - call only', () => {
      const userSettings = {
        processor_callOnly: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'call',
            name: 'Call Only Processor'
          }
        },
        processor_messageOnly: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'message',
            name: 'Message Only Processor'
          }
        }
      };

      const result = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'call'
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('callOnly');
    });

    test('should filter by logType - message only', () => {
      const userSettings = {
        processor_callOnly: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'call',
            name: 'Call Only Processor'
          }
        },
        processor_messageOnly: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'message',
            name: 'Message Only Processor'
          }
        }
      };

      const result = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'message'
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('messageOnly');
    });

    test('should only return processor when logType matches supportedLogType', () => {
      const userSettings = {
        processor_callProcessor: {
          value: {
            activated: true,
            phase: 'beforeLogging',
            supportedLogType: 'call',
            name: 'Call Processor'
          }
        }
      };

      const callResult = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'call'
      });
      expect(callResult).toHaveLength(1);
      expect(callResult[0].id).toBe('callProcessor');

      const messageResult = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'message'
      });
      expect(messageResult).toHaveLength(0);
    });

    test('should return empty array when no processors match criteria', () => {
      const userSettings = {
        processor_googleDrive: {
          value: {
            activated: true,
            phase: 'afterLogging',
            supportedLogType: 'call',
            name: 'Google Drive Upload'
          }
        }
      };

      // Wrong phase
      const wrongPhase = getProcessorsFromUserSettings({
        userSettings,
        phase: 'beforeLogging',
        logType: 'call'
      });
      expect(wrongPhase).toEqual([]);

      // Wrong logType
      const wrongLogType = getProcessorsFromUserSettings({
        userSettings,
        phase: 'afterLogging',
        logType: 'message'
      });
      expect(wrongLogType).toEqual([]);
    });

    test('should preserve full processor value in result', () => {
      const processorValue = {
        activated: true,
        phase: 'afterLogging',
        supportedLogTypes: ['call'],
        name: 'Google Drive Upload',
        isAsync: true,
        customOption: 'someValue'
      };

      const userSettings = {
        processor_googleDrive: {
          value: processorValue
        }
      };

      const result = getProcessorsFromUserSettings({
        userSettings,
        phase: 'afterLogging',
        logType: 'call'
      });

      expect(result).toHaveLength(1);
      expect(result[0].value).toEqual(processorValue);
    });
  });
});

