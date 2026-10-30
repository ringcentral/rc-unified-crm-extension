// @ts-check

// Call pop widget: a connector may attach `widget` to a matched contact. The client renders it as an
// Embeddable JSON schema page, read-only. Anything that would render a form element is removed here.

const MAX_WIDGET_BYTES = 20 * 1024;
const MAX_ACTIONS = 10;
const ALLOWED_UI_FIELDS = new Set(['typography', 'list', 'button', 'admonition']);
const ALLOWED_UI_WIDGETS = new Set(['hidden']);

/**
 * @param {any} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Drops every property that would render as an input. A leaf property is kept only when its uiSchema
 * names an allowed `ui:field` or the `hidden` widget; objects are walked recursively.
 * @param {any} schema
 * @param {any} uiSchema
 * @returns {{ schema: Record<string, any>, uiSchema: Record<string, any>, removed: string[] }}
 */
function filterSchema(schema, uiSchema) {
    /** @type {string[]} */
    const removed = [];
    /**
     * @param {Record<string, any>} node
     * @param {Record<string, any>} ui
     * @param {string} path
     */
    const walk = (node, ui, path) => {
        const properties = isPlainObject(node.properties) ? node.properties : {};
        /** @type {Record<string, any>} */
        const keptProperties = {};
        /** @type {Record<string, any>} */
        const keptUi = {};
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
            const fieldAllowed = typeof field === 'string' && ALLOWED_UI_FIELDS.has(field);
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

/**
 * @param {any} widget
 * @returns {{ schema: Record<string, any>, uiSchema: Record<string, any>, formData: Record<string, any>, actions?: { id: string, label: string, color?: string }[], links?: Record<string, string> } | undefined}
 */
function sanitizeContactWidget(widget) {
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
    /** @type {{ id: string, label: string, color?: string }[]} */
    const actions = [];
    if (Array.isArray(widget.actions)) {
        for (const action of widget.actions.slice(0, MAX_ACTIONS)) {
            if (isPlainObject(action) && typeof action.id === 'string' && typeof action.label === 'string') {
                actions.push(typeof action.color === 'string' ? { id: action.id, label: action.label, color: action.color } : { id: action.id, label: action.label });
            }
        }
    }
    /** @type {Record<string, string>} */
    const links = {};
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

/**
 * Replaces each contact's `widget` with its sanitized form, or removes it when invalid.
 * @template {Record<string, any>} T
 * @param {T[] | null | undefined} contacts
 * @returns {T[] | null | undefined}
 */
function sanitizeContactsWidget(contacts) {
    if (!Array.isArray(contacts)) {
        return contacts;
    }
    return contacts.map(contact => {
        if (!contact || !('widget' in contact)) {
            return contact;
        }
        const { widget, ...rest } = contact;
        const sanitized = sanitizeContactWidget(widget);
        return sanitized ? { ...rest, widget: sanitized } : /** @type {T} */ (rest);
    });
}

module.exports = {
    MAX_WIDGET_BYTES,
    sanitizeContactWidget,
    sanitizeContactsWidget
};
