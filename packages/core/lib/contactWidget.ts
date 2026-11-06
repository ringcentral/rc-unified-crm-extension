// Contact widget: a connector's `getContactWidget` returns a widget per matched contact. The client renders it
// as an Embeddable JSON schema page, read-only. Anything that would render a form element is removed here.

const MAX_WIDGET_BYTES = 20 * 1024;
const MAX_ACTIONS = 10;
const ALLOWED_UI_FIELDS = new Set(['typography', 'link', 'list', 'button', 'admonition']);
const ALLOWED_UI_WIDGETS = new Set(['hidden']);

function isPlainObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Drops every property that would render as an input. A leaf property is kept only when its uiSchema
 * names an allowed `ui:field` or the `hidden` widget; objects are walked recursively.
 */
function filterSchema(schema: any, uiSchema: any): { schema: Record<string, any>, uiSchema: Record<string, any>, removed: string[] } {
    const removed: string[] = [];
    const walk = (node: Record<string, any>, ui: Record<string, any>, path: string): { node: Record<string, any>, ui: Record<string, any> } => {
        const properties: Record<string, any> = isPlainObject(node.properties) ? node.properties : {};
        const keptProperties: Record<string, any> = {};
        const keptUi: Record<string, any> = {};
        for (const [key, child] of Object.entries(properties)) {
            const childPath = path ? `${path}.${key}` : key;
            const childUi = isPlainObject(ui?.[key]) ? ui[key] : {};
            if (isPlainObject(child) && child.type === 'object' && isPlainObject(child.properties) && !childUi['ui:field']) {
                const walked = walk(child, childUi, childPath);
                keptProperties[key] = walked.node;
                keptUi[key] = walked.ui;
                continue;
            }
            const field = childUi['ui:field'];
            const widget = childUi['ui:widget'];
            // A link field opens `ui:href` directly, so it must be a plain http(s) URL.
            const linkAllowed = field !== 'link' || /^https?:\/\//i.test(String(childUi['ui:href'] ?? ''));
            const fieldAllowed = typeof field === 'string' && ALLOWED_UI_FIELDS.has(field) && linkAllowed;
            const widgetAllowed = typeof widget === 'string' && ALLOWED_UI_WIDGETS.has(widget);
            if (fieldAllowed || widgetAllowed) {
                keptProperties[key] = child;
                keptUi[key] = childUi;
            }
            else {
                removed.push(childPath);
            }
        }
        // Keep non-property uiSchema entries such as `ui:order`.
        for (const [key, value] of Object.entries(ui ?? {})) {
            if (!(key in properties)) {
                keptUi[key] = value;
            }
        }
        return { node: { ...node, properties: keptProperties }, ui: keptUi };
    };
    const walked = walk(isPlainObject(schema) ? schema : { type: 'object', properties: {} }, isPlainObject(uiSchema) ? uiSchema : {}, '');
    return { schema: walked.node, uiSchema: walked.ui, removed };
}

interface ContactWidget {
    schema: Record<string, any>;
    uiSchema: Record<string, any>;
    formData: Record<string, any>;
    actions?: { id: string, label: string, color?: string }[];
    links?: Record<string, string>;
}

function sanitizeContactWidget(widget: any): ContactWidget | undefined {
    if (!isPlainObject(widget) || !isPlainObject(widget.schema)) {
        return undefined;
    }
    if (JSON.stringify(widget).length > MAX_WIDGET_BYTES) {
        console.warn('contact widget dropped: larger than the size limit');
        return undefined;
    }
    const { schema, uiSchema, removed } = filterSchema(widget.schema, widget.uiSchema);
    if (removed.length > 0) {
        console.warn(`contact widget: removed unsupported elements: ${removed.join(', ')}`);
    }
    if (Object.keys(schema.properties ?? {}).length === 0) {
        return undefined;
    }
    const actions: NonNullable<ContactWidget['actions']> = [];
    if (Array.isArray(widget.actions)) {
        for (const action of widget.actions.slice(0, MAX_ACTIONS)) {
            if (isPlainObject(action) && typeof action.id === 'string' && typeof action.label === 'string') {
                actions.push(typeof action.color === 'string' ? { id: action.id, label: action.label, color: action.color } : { id: action.id, label: action.label });
            }
        }
    }
    const links: Record<string, string> = {};
    if (isPlainObject(widget.links)) {
        for (const [id, url] of Object.entries(widget.links)) {
            if (typeof url === 'string') {
                links[id] = url;
            }
        }
    }
    return {
        schema,
        uiSchema,
        formData: isPlainObject(widget.formData) ? widget.formData : {},
        ...(actions.length > 0 ? { actions } : {}),
        ...(Object.keys(links).length > 0 ? { links } : {})
    };
}

interface ContactWidgetResult {
    contactId: string;
    widget: ContactWidget;
}

/** Keeps the `{ contactId, widget }` entries whose widget is valid, with the widget sanitized. */
function sanitizeContactWidgets(widgets: any): ContactWidgetResult[] {
    if (!Array.isArray(widgets)) {
        return [];
    }
    const result: ContactWidgetResult[] = [];
    for (const entry of widgets) {
        if (!isPlainObject(entry) || entry.contactId === undefined || entry.contactId === null) {
            continue;
        }
        const widget = sanitizeContactWidget(entry.widget);
        if (widget) {
            result.push({ contactId: String(entry.contactId), widget });
        }
    }
    return result;
}

export {
    MAX_WIDGET_BYTES,
    sanitizeContactWidget,
    sanitizeContactWidgets
};
