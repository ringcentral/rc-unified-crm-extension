const {
  composeSharedSMSLog,
  gatherParticipants,
  countEntities,
  processEntities,
  escapeHtml
} = require('../../lib/sharedSMSComposer');
const { LOG_DETAILS_FORMAT_TYPE } = require('../../lib/constants');

describe('sharedSMSComposer', () => {
  describe('composeSharedSMSLog', () => {
    const baseConversation = {
      creationTime: '2024-01-15T10:30:00Z',
      messages: [
        { lastModifiedTime: '2024-01-15T10:30:00Z' },
        { lastModifiedTime: '2024-01-15T11:45:00Z' }
      ],
      entities: [
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T10:30:00Z',
          direction: 'Inbound',
          author: { name: 'John Customer' },
          text: 'Hello, I need help'
        },
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T10:35:00Z',
          direction: 'Outbound',
          author: { name: 'Agent Smith' },
          text: 'Hi! How can I assist you?'
        }
      ],
      owner: {
        name: 'Support Team',
        extensionType: 'User',
        extensionId: '12345'
      }
    };

    test('should compose SMS log with default settings (plain text)', () => {
      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: baseConversation,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.subject).toBe('SMS conversation with John Customer');
      expect(result.body).toContain('Conversation summary');
      expect(result.body).toContain('John Customer (customer)');
      expect(result.body).toContain('BEGIN');
      expect(result.body).toContain('END');
    });

    test('should compose SMS log in HTML format', () => {
      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML,
        conversation: baseConversation,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.subject).toBe('<b>SMS conversation with John Customer</b>');
      expect(result.body).toContain('<b>Conversation summary</b>');
      expect(result.body).toContain('<b>Participants</b>');
      expect(result.body).toContain('<li>');
    });

    test('should compose SMS log in Markdown format', () => {
      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN,
        conversation: baseConversation,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.subject).toBe('**SMS conversation with John Customer**');
      expect(result.body).toContain('## Conversation summary');
      expect(result.body).toContain('### Participants');
      expect(result.body).toContain('---');
    });

    test('should handle conversation with call queue owner', () => {
      const conversationWithQueue = {
        ...baseConversation,
        owner: {
          name: 'Sales Queue',
          extensionType: 'Department',
          extensionId: '99999'
        }
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithQueue,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('Receiving call queue: Sales Queue');
    });

    test('should handle conversation with notes', () => {
      const conversationWithNotes = {
        ...baseConversation,
        entities: [
          ...baseConversation.entities,
          {
            recordType: 'AliveNote',
            creationTime: '2024-01-15T10:40:00Z',
            author: { name: 'Agent Smith' },
            text: 'Customer prefers email contact'
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithNotes,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('2 messages');
      expect(result.body).toContain('1 note');
      expect(result.body).toContain('left a note');
    });

    test('should handle conversation with assignment', () => {
      const conversationWithAssignment = {
        ...baseConversation,
        entities: [
          ...baseConversation.entities,
          {
            recordType: 'ThreadAssignedHint',
            creationTime: '2024-01-15T10:32:00Z',
            assignee: { name: 'Agent Smith' }
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithAssignment,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('Conversation assigned to Agent Smith');
    });

    test('should skip ThreadResolvedHint entities (not processed)', () => {
      const conversationWithResolved = {
        ...baseConversation,
        entities: [
          ...baseConversation.entities,
          {
            recordType: 'ThreadResolvedHint',
            creationTime: '2024-01-15T11:45:00Z',
            initiator: { name: 'Agent Smith' }
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithResolved,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      // ThreadResolvedHint is not processed, so it won't appear in the body
      expect(result.body).not.toContain('resolved the conversation');
    });

    test('should skip ThreadReopenedHint entities (not processed)', () => {
      const conversationWithReopened = {
        ...baseConversation,
        entities: [
          ...baseConversation.entities,
          {
            recordType: 'ThreadReopenedHint',
            creationTime: '2024-01-15T12:00:00Z',
            initiator: { name: 'Agent Smith' }
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithReopened,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      // ThreadReopenedHint is not processed, so it won't appear in the body
      expect(result.body).not.toContain('reopened the conversation');
    });

    test('should apply timezone offset', () => {
      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: baseConversation,
        contactName: 'John Customer',
        timezoneOffset: '+05:00'
      });

      // The time should be adjusted by +5 hours
      expect(result.body).toContain('Started:');
    });

    test('should handle empty entities array', () => {
      const emptyConversation = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: []
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: emptyConversation,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('0 messages');
    });

    test('should handle missing entities', () => {
      const noEntitiesConversation = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: noEntitiesConversation,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('0 messages');
    });
  });

  describe('gatherParticipants', () => {
    test('should gather participants from author names', () => {
      const entities = [
        { author: { name: 'Agent Smith' } },
        { author: { name: 'Agent Jones' } }
      ];

      const result = gatherParticipants(entities);

      expect(result).toContain('Agent Smith');
      expect(result).toContain('Agent Jones');
    });

    test('should gather participants from from names', () => {
      const entities = [
        { from: { name: 'Customer John' } }
      ];

      const result = gatherParticipants(entities);

      expect(result).toContain('Customer John');
    });

    test('should gather participants from initiator names', () => {
      const entities = [
        { initiator: { name: 'Manager Bob' } }
      ];

      const result = gatherParticipants(entities);

      expect(result).toContain('Manager Bob');
    });

    test('should gather participants from assignee names', () => {
      const entities = [
        { assignee: { name: 'Agent Smith' } }
      ];

      const result = gatherParticipants(entities);

      expect(result).toContain('Agent Smith');
    });

    test('should deduplicate participants', () => {
      const entities = [
        { author: { name: 'Agent Smith' } },
        { from: { name: 'Agent Smith' } },
        { initiator: { name: 'Agent Smith' } }
      ];

      const result = gatherParticipants(entities);

      expect(result).toHaveLength(1);
      expect(result).toContain('Agent Smith');
    });

    test('should handle empty entities array', () => {
      const result = gatherParticipants([]);

      expect(result).toEqual([]);
    });

    test('should handle entities without names', () => {
      const entities = [
        { author: {} },
        { from: null },
        {}
      ];

      const result = gatherParticipants(entities);

      expect(result).toEqual([]);
    });
  });

  describe('countEntities', () => {
    test('should count messages correctly', () => {
      const entities = [
        { recordType: 'AliveMessage' },
        { recordType: 'AliveMessage' },
        { recordType: 'AliveMessage' }
      ];

      const result = countEntities(entities);

      expect(result.messageCount).toBe(3);
      expect(result.noteCount).toBe(0);
    });

    test('should count notes correctly', () => {
      const entities = [
        { recordType: 'NoteHint' },
        { recordType: 'ThreadNoteAddedHint' }
      ];

      const result = countEntities(entities);

      expect(result.messageCount).toBe(0);
      expect(result.noteCount).toBe(2);
    });

    test('should count ThreadAssignedHint as note', () => {
      const entities = [
        { recordType: 'ThreadAssignedHint' }
      ];

      const result = countEntities(entities);

      expect(result.noteCount).toBe(1);
    });

    test('should count AliveNote as note', () => {
      const entities = [
        { recordType: 'AliveNote' }
      ];

      const result = countEntities(entities);

      expect(result.noteCount).toBe(1);
    });

    test('should count both messages and notes', () => {
      const entities = [
        { recordType: 'AliveMessage' },
        { recordType: 'AliveMessage' },
        { recordType: 'NoteHint' },
        { recordType: 'ThreadNoteAddedHint' },
        { recordType: 'ThreadAssignedHint' }
      ];

      const result = countEntities(entities);

      expect(result.messageCount).toBe(2);
      expect(result.noteCount).toBe(3);
    });

    test('should return zero counts for empty array', () => {
      const result = countEntities([]);

      expect(result.messageCount).toBe(0);
      expect(result.noteCount).toBe(0);
    });

    test('should ignore other record types', () => {
      const entities = [
        { recordType: 'ThreadResolvedHint' },
        { recordType: 'ThreadReopenedHint' },
        { recordType: 'ThreadCreatedHint' }
      ];

      const result = countEntities(entities);

      expect(result.messageCount).toBe(0);
      expect(result.noteCount).toBe(0);
    });
  });

  describe('processEntities', () => {
    test('should process message entities (plain text)', () => {
      const entities = [
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T10:30:00Z',
          direction: 'Inbound',
          author: { name: 'Customer' },
          text: 'Hello!'
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('message');
      expect(result[0].content).toContain('said on');
      expect(result[0].content).toContain('Hello!');
    });

    test('should process message entities (HTML)', () => {
      const entities = [
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T10:30:00Z',
          direction: 'Outbound',
          author: { name: 'Agent' },
          text: 'Hi there!'
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML,
        contactName: 'Customer'
      });

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('<p>');
      expect(result[0].content).toContain('<b>');
    });

    test('should process message entities (Markdown)', () => {
      const entities = [
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T10:30:00Z',
          direction: 'Outbound',
          author: { name: 'Agent' },
          text: 'Hi there!'
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN,
        contactName: 'Customer'
      });

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('**');
    });

    test('should process assignment entities', () => {
      const entities = [
        {
          recordType: 'ThreadAssignedHint',
          creationTime: '2024-01-15T10:30:00Z',
          assignee: { name: 'Agent Smith' }
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('assignment');
      expect(result[0].content).toContain('assigned to Agent Smith');
    });

    test('should skip ThreadResolvedHint entities', () => {
      const entities = [
        {
          recordType: 'ThreadResolvedHint',
          creationTime: '2024-01-15T10:30:00Z',
          initiator: { name: 'Agent Smith' }
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      // ThreadResolvedHint is not processed (returns null)
      expect(result).toHaveLength(0);
    });

    test('should skip ThreadReopenedHint entities', () => {
      const entities = [
        {
          recordType: 'ThreadReopenedHint',
          creationTime: '2024-01-15T10:30:00Z',
          initiator: { name: 'Agent Smith' }
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      // ThreadReopenedHint is not processed (returns null)
      expect(result).toHaveLength(0);
    });

    test('should process AliveNote entities', () => {
      const entities = [
        {
          recordType: 'AliveNote',
          creationTime: '2024-01-15T10:30:00Z',
          author: { name: 'Agent Smith' },
          text: 'Important note here'
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('note');
      expect(result[0].content).toContain('left a note');
      expect(result[0].content).toContain('Important note here');
    });

    test('should skip NoteHint entities (not processed)', () => {
      const entities = [
        {
          recordType: 'NoteHint',
          creationTime: '2024-01-15T10:30:00Z',
          author: { name: 'Agent Smith' },
          text: 'Important note here'
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      // NoteHint is counted but not processed into formatted entries
      expect(result).toHaveLength(0);
    });

    test('should skip ThreadCreatedHint entities', () => {
      const entities = [
        {
          recordType: 'ThreadCreatedHint',
          creationTime: '2024-01-15T10:30:00Z'
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      expect(result).toHaveLength(0);
    });

    test('should process multiple message entities', () => {
      const entities = [
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T10:00:00Z',
          direction: 'Outbound',
          author: { name: 'Agent' },
          text: 'First message'
        },
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T12:00:00Z',
          direction: 'Outbound',
          author: { name: 'Agent' },
          text: 'Third message'
        },
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T11:00:00Z',
          direction: 'Outbound',
          author: { name: 'Agent' },
          text: 'Second message'
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      expect(result).toHaveLength(3);
      // Verify all messages are processed
      const allContent = result.map(r => r.content).join(' ');
      expect(allContent).toContain('First message');
      expect(allContent).toContain('Second message');
      expect(allContent).toContain('Third message');
    });

    test('should apply timezone offset to timestamps', () => {
      const entities = [
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T10:30:00Z',
          direction: 'Outbound',
          author: { name: 'Agent' },
          text: 'Hello!'
        }
      ];

      const result = processEntities({
        entities,
        timezoneOffset: '+05:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      // 10:30 UTC + 5 hours = 15:30 (3:30 PM)
      expect(result[0].content).toContain('03:30 PM');
    });

    test('should handle empty entities array', () => {
      const result = processEntities({
        entities: [],
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        contactName: 'Customer'
      });

      expect(result).toEqual([]);
    });
  });

  describe('escapeHtml', () => {
    test('should escape ampersand', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    test('should escape less than', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b');
    });

    test('should escape greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    test('should escape double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    test('should escape single quotes', () => {
      expect(escapeHtml("it's fine")).toBe('it&#039;s fine');
    });

    test('should escape multiple special characters', () => {
      expect(escapeHtml('<script>alert("XSS")</script>'))
        .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    test('should return empty string for null input', () => {
      expect(escapeHtml(null)).toBe('');
    });

    test('should return empty string for undefined input', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    test('should return empty string for empty string input', () => {
      expect(escapeHtml('')).toBe('');
    });

    test('should not modify text without special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('Format-specific output', () => {
    const testConversation = {
      creationTime: '2024-01-15T10:30:00Z',
      messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
      entities: [
        {
          recordType: 'AliveMessage',
          creationTime: '2024-01-15T10:30:00Z',
          direction: 'Inbound',
          author: { name: 'John Customer' },
          text: 'Hello!'
        }
      ],
      owner: {
        name: 'Support Team',
        extensionType: 'User',
        extensionId: '12345'
      }
    };

    describe('Plain Text format', () => {
      test('should include proper separators', () => {
        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
          conversation: testConversation,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('------------');
        expect(result.body).toContain('BEGIN');
        expect(result.body).toContain('END');
      });

      test('should use asterisks for list items', () => {
        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
          conversation: testConversation,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('* John Customer (customer)');
      });
    });

    describe('HTML format', () => {
      test('should include proper HTML tags', () => {
        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.HTML,
          conversation: testConversation,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('<div>');
        expect(result.body).toContain('<ul>');
        expect(result.body).toContain('<li>');
        expect(result.body).toContain('<hr>');
      });

      test('should use bold tags for headers', () => {
        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.HTML,
          conversation: testConversation,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('<b>Conversation summary</b>');
        expect(result.body).toContain('<b>Participants</b>');
      });

      test('should escape HTML in content', () => {
        const conversationWithSpecialChars = {
          ...testConversation,
          entities: [
            {
              recordType: 'AliveMessage',
              creationTime: '2024-01-15T10:30:00Z',
              direction: 'Inbound',
              author: { name: '<script>alert("XSS")</script>' },
              text: 'Test <b>bold</b>'
            }
          ]
        };

        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.HTML,
          conversation: conversationWithSpecialChars,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('&lt;script&gt;');
        expect(result.body).toContain('&lt;b&gt;bold&lt;/b&gt;');
      });
    });

    describe('Markdown format', () => {
      test('should include proper Markdown headers', () => {
        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN,
          conversation: testConversation,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('## Conversation summary');
        expect(result.body).toContain('### Participants');
      });

      test('should use horizontal rules', () => {
        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN,
          conversation: testConversation,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('---');
      });

      test('should use asterisks for list items', () => {
        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN,
          conversation: testConversation,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('* John Customer (customer)');
      });

      test('should use bold for owner name', () => {
        const result = composeSharedSMSLog({
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN,
          conversation: testConversation,
          contactName: 'John Customer',
          timezoneOffset: '+00:00'
        });

        expect(result.body).toContain('**Support Team**');
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle conversation with no owner', () => {
      const conversationNoOwner = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: []
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationNoOwner,
        contactName: 'John Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).not.toContain('Owner:');
      expect(result.body).not.toContain('Receiving call queue:');
    });

    test('should handle message with subject instead of text', () => {
      const conversationWithSubject = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: [
          {
            recordType: 'AliveMessage',
            creationTime: '2024-01-15T10:30:00Z',
            direction: 'Inbound',
            author: { name: 'Customer' },
            subject: 'Subject line message'
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithSubject,
        contactName: 'Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('Subject line message');
    });

    test('should handle note with body instead of text', () => {
      const conversationWithBody = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: [
          {
            recordType: 'AliveNote',
            creationTime: '2024-01-15T10:30:00Z',
            author: { name: 'Agent' },
            body: 'Note body content'
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithBody,
        contactName: 'Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('Note body content');
    });

    test('should handle unknown assignee', () => {
      const conversationUnknownAssignee = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: [
          {
            recordType: 'ThreadAssignedHint',
            creationTime: '2024-01-15T10:30:00Z'
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationUnknownAssignee,
        contactName: 'Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('assigned to Unknown');
    });

    test('should handle unknown note author', () => {
      const conversationUnknownAuthor = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: [
          {
            recordType: 'AliveNote',
            creationTime: '2024-01-15T10:30:00Z',
            text: 'Some note'
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationUnknownAuthor,
        contactName: 'Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('Unknown left a note');
    });

    test('should handle missing timezone offset', () => {
      const conversation = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: []
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation,
        contactName: 'Customer'
      });

      expect(result.subject).toBe('SMS conversation with Customer');
      expect(result.body).toContain('Conversation summary');
    });

    test('should default to plain text format', () => {
      const conversation = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: []
      };

      const result = composeSharedSMSLog({
        conversation,
        contactName: 'Customer'
      });

      expect(result.subject).toBe('SMS conversation with Customer');
      expect(result.body).not.toContain('<b>');
      expect(result.body).not.toContain('##');
    });

    test('should handle owner name with queue keyword', () => {
      const conversationWithQueueName = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: [],
        owner: {
          name: 'Support Queue',
          extensionType: 'User',
          extensionId: '12345'
        }
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithQueueName,
        contactName: 'Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('Receiving call queue: Support Queue');
    });

    test('should handle message from from.name instead of author.name', () => {
      const conversationWithFromName = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: [
          {
            recordType: 'AliveMessage',
            creationTime: '2024-01-15T10:30:00Z',
            direction: 'Outbound',
            from: { name: 'Agent via from' },
            text: 'Hello!'
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithFromName,
        contactName: 'Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('Agent via from');
    });

    test('should handle note initiator as fallback for author', () => {
      const conversationWithInitiator = {
        creationTime: '2024-01-15T10:30:00Z',
        messages: [{ lastModifiedTime: '2024-01-15T11:45:00Z' }],
        entities: [
          {
            recordType: 'AliveNote',
            creationTime: '2024-01-15T10:30:00Z',
            initiator: { name: 'Note Initiator' },
            text: 'A note'
          }
        ]
      };

      const result = composeSharedSMSLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        conversation: conversationWithInitiator,
        contactName: 'Customer',
        timezoneOffset: '+00:00'
      });

      expect(result.body).toContain('Note Initiator left a note');
    });
  });
});

