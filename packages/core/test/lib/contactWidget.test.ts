const { MAX_WIDGET_BYTES, sanitizeContactWidget, sanitizeContactsWidget } = require('../../lib/contactWidget');

const baseWidget = (): any => ({
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      cases: { type: 'string' },
      open: { type: 'string' },
    },
  },
  uiSchema: {
    title: { 'ui:field': 'typography' },
    cases: { 'ui:field': 'list' },
    open: { 'ui:field': 'button' },
  },
  formData: { title: 'Open cases' },
});

describe('contactWidget', () => {
  describe('sanitizeContactWidget', () => {
    test('keeps allowed read-only elements', () => {
      const result = sanitizeContactWidget(baseWidget());

      expect(Object.keys(result.schema.properties)).toEqual(['title', 'cases', 'open']);
      expect(result.formData).toEqual({ title: 'Open cases' });
    });

    test('removes form elements and properties without an explicit ui field', () => {
      const widget = baseWidget();
      widget.schema.properties.search = { type: 'string' };
      widget.uiSchema.search = { 'ui:field': 'search' };
      widget.schema.properties.plain = { type: 'string' };
      widget.schema.properties.picker = { type: 'string' };
      widget.uiSchema.picker = { 'ui:widget': 'select' };

      const result = sanitizeContactWidget(widget);

      expect(Object.keys(result.schema.properties)).toEqual(['title', 'cases', 'open']);
      expect(result.uiSchema.search).toBeUndefined();
      expect(result.uiSchema.picker).toBeUndefined();
    });

    test('allows hidden properties and filters nested objects', () => {
      const widget = {
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            group: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                input: { type: 'string' },
              },
            },
          },
        },
        uiSchema: {
          id: { 'ui:widget': 'hidden' },
          group: { text: { 'ui:field': 'typography' } },
        },
      };

      const result = sanitizeContactWidget(widget);

      expect(Object.keys(result.schema.properties.group.properties)).toEqual(['text']);
      expect(result.schema.properties.id).toBeDefined();
    });

    test('returns undefined when nothing renderable remains', () => {
      const result = sanitizeContactWidget({
        schema: { type: 'object', properties: { name: { type: 'string' } } },
        uiSchema: {},
      });

      expect(result).toBeUndefined();
    });

    test('returns undefined for missing or malformed widgets', () => {
      expect(sanitizeContactWidget(undefined)).toBeUndefined();
      expect(sanitizeContactWidget('text')).toBeUndefined();
      expect(sanitizeContactWidget({ uiSchema: {} })).toBeUndefined();
    });

    test('drops widgets over the size limit', () => {
      const widget = baseWidget();
      widget.formData = { title: 'x'.repeat(MAX_WIDGET_BYTES) };

      expect(sanitizeContactWidget(widget)).toBeUndefined();
    });

    test('keeps valid actions and string links only', () => {
      const result = sanitizeContactWidget({
        ...baseWidget(),
        actions: [{ id: 'a', label: 'Open', color: 'primary' }, { id: 1 }, 'bad'],
        links: { a: 'https://example.com', b: 42 },
      });

      expect(result.actions).toEqual([{ id: 'a', label: 'Open', color: 'primary' }]);
      expect(result.links).toEqual({ a: 'https://example.com' });
    });
  });

  describe('sanitizeContactsWidget', () => {
    test('passes through contacts without a widget and non-arrays', () => {
      const contacts = [{ id: '1', name: 'A' }];

      expect(sanitizeContactsWidget(contacts)).toEqual(contacts);
      expect(sanitizeContactsWidget(null)).toBeNull();
      expect(sanitizeContactsWidget(undefined)).toBeUndefined();
    });

    test('removes an invalid widget from the contact', () => {
      const result = sanitizeContactsWidget([{ id: '1', name: 'A', widget: { schema: 'nope' } }]);

      expect(result).toEqual([{ id: '1', name: 'A' }]);
    });
  });
});
