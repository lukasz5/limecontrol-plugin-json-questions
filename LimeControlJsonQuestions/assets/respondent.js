/* SPDX-License-Identifier: GPL-2.0-or-later */
(function (root) {
    'use strict';

    if (root.LimeControlJsonRespondent) {
        if (root.document) root.LimeControlJsonRespondent.mount(root.document);
        return;
    }

    const messages = {
        pl: { empty: 'Brak pasujących pozycji z wcześniejszego pytania.', comment: 'Komentarz', required: 'Wymagane', invalid: 'Nie można odczytać zapisanej odpowiedzi. Skontaktuj się z autorem ankiety.', any: 'Uzupełnij co najmniej jedną odpowiedź.' },
        en: { empty: 'No items match your earlier answers.', comment: 'Comment', required: 'Required', invalid: 'The saved answer could not be read. Please contact the survey author.', any: 'Enter at least one answer.' },
        de: { empty: 'Keine passenden Einträge aus den vorherigen Antworten.', comment: 'Kommentar', required: 'Erforderlich', invalid: 'Die gespeicherte Antwort konnte nicht gelesen werden. Bitte kontaktieren Sie die Umfrageleitung.', any: 'Geben Sie mindestens eine Antwort an.' }
    };
    const byteMessages = {
        pl: (size, max) => `Odpowiedź zajmuje ${size} bajtów. Limit dla tego pytania wynosi ${max} bajtów. Skróć tekst lub komentarze, aby kontynuować.`,
        en: (size, max) => `Your answer uses ${size} bytes. This question allows ${max} bytes. Shorten the text or comments to continue.`,
        de: (size, max) => `Ihre Antwort umfasst ${size} Byte. Für diese Frage sind ${max} Byte zulässig. Kürzen Sie Text oder Kommentare, um fortzufahren.`
    };
    const DEFAULT_BYTES = 60 * 1024;
    const active = new Map();
    let counter = 0;
    let updating = false;
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
    const filled = value => value !== undefined && value !== null && value !== false &&
        (typeof value !== 'string' || value !== '') && (!Array.isArray(value) || value.length > 0);
    const keyOf = path => JSON.stringify(path);
    const cellValue = (cells, code) => own(cells, code) ? cells[code].value : undefined;

    function localLabel(label, language) {
        if (typeof label === 'string') return label;
        if (!label || typeof label !== 'object') return '';
        return label[language] || label[language.split('-')[0]] || label.en || Object.values(label)[0] || '';
    }

    function condition(expr, self, source, count) {
        if (!expr || typeof expr !== 'object') return false;
        if (Array.isArray(expr.all)) return expr.all.every(item => condition(item, self, source, count));
        if (Array.isArray(expr.any)) return expr.any.some(item => condition(item, self, source, count));
        if (expr.not) return !condition(expr.not, self, source, count);
        const [area, code] = String(expr.field || '').split('.');
        const value = expr.field === 'source.count' ? count : cellValue(area === 'self' ? self : source, code);
        if (expr.op === 'selected') return filled(value);
        if (expr.op === 'eq' && value === expr.value) return true;
        // PHP's is_numeric accepts decimal/scientific notation, including numeric strings.
        const numeric = item => typeof item === 'number' || (typeof item === 'string' &&
            /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(item.trim()));
        if (!numeric(value) || !numeric(expr.value)) return false;
        const left = Number(value);
        const right = Number(expr.value);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
        switch (expr.op) {
            case 'eq': return left === right;
            case 'gt': return left > right;
            case 'gte': return left >= right;
            case 'lt': return left < right;
            case 'lte': return left <= right;
            default: return false;
        }
    }

    function rowPolicy(def, row, cells, count) {
        const rules = def.rules || [];
        const matches = rule => condition(rule.when, cells, row.cells || {}, count);
        const effects = (effect, target) => rules.filter(rule => rule.effect === effect && rule.target === target);
        const shown = target => effects('show', target).every(matches);
        const required = target => effects('require', target).some(matches);
        const wantsComment = target => effects('requireComment', target).some(matches);
        return { shown, required, wantsComment };
    }

    function readAnswer(raw) {
        if (raw === '' || raw === null || raw === undefined) return { version: 1, rows: [] };
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!value || value.version !== 1 || !Array.isArray(value.rows)) throw new Error('Invalid saved answer');
        const paths = new Set();
        for (const row of value.rows) {
            if (!row || !Array.isArray(row.path) || !row.path.every(code => typeof code === 'string') ||
                !row.cells || typeof row.cells !== 'object' || Array.isArray(row.cells) ||
                paths.has(keyOf(row.path))) throw new Error('Invalid saved row');
            paths.add(keyOf(row.path));
            for (const cell of Object.values(row.cells)) {
                if (!cell || typeof cell !== 'object' || !own(cell, 'value')) throw new Error('Invalid saved cell');
            }
        }
        return value;
    }

    function nativeRows(ctx, code, saved, doc) {
        const fields = ctx.sourceFields && ctx.sourceFields[code];
        if (!Array.isArray(fields) || !fields.length) return saved;
        const selected = [];
        let onPage = false;
        for (const field of fields) {
            const inputs = Array.from(doc.getElementsByName(field.fieldName)).filter(el => el.type !== 'hidden');
            if (!inputs.length) continue;
            onPage = true;
            if (inputs.some(el => !el.disabled && (el.type === 'checkbox' ? el.checked :
                el.type === 'radio' ? el.checked && el.value === String(field.value ?? field.path.at(-1)) :
                el.value !== '' && el.value === String(field.value ?? field.path.at(-1))))) {
                selected.push({ path: field.path, label: localLabel(field.label, ctx.language) || field.path.join(' / '), cells: {} });
            }
        }
        return onPage ? selected : saved;
    }

    function sourceRows(ctx, code, doc, seen = new Set()) {
        if (!code || seen.has(code)) return [];
        seen.add(code);
        const current = active.get(code);
        const saved = (ctx.sources || {})[code];
        if (!current && Array.isArray(saved)) return nativeRows(ctx, code, saved, doc);
        const def = current?.ctx.definition || saved?.definition || (ctx.sourceDefinitions || {})[code];
        if (!def) return nativeRows(ctx, code, [], doc);
        const answer = current ? current.answer : saved?.answer || saved;
        if (!answer || !Array.isArray(answer.rows)) return [];
        const parents = new Map(sourceRows(current?.ctx || ctx, def.source, doc, seen).map(row => [keyOf(row.path), row]));
        const result = [];
        for (const row of answer.rows) {
            const parent = parents.get(keyOf(row.path));
            if (!parent) continue;
            const label = localLabel(parent.label, ctx.language) || row.path.join(' / ');
            if (def.kind === 'choice') {
                for (const option of def.options) {
                    if (!filled(cellValue(row.cells, option.code))) continue;
                    result.push({ path: [...row.path, option.code], cells: row.cells,
                        label: label + ' / ' + (localLabel(option.label, ctx.language) || option.code) });
                }
            } else {
                result.push({ path: row.path, cells: row.cells, label });
            }
        }
        return result;
    }

    function analyze(def, sources, answer) {
        const prior = new Map(answer.rows.map(row => [keyOf(row.path), row.cells]));
        const rows = [];
        for (const source of sources) {
            const cells = Object.assign(Object.create(null), prior.get(keyOf(source.path)) || {});
            // Remove hidden answers before evaluating their downstream rules.
            for (let pass = 0; pass <= def.options.length; pass++) {
                const policy = rowPolicy(def, source, cells, sources.length);
                const hidden = Object.keys(cells).filter(code =>
                    !def.options.some(option => option.code === code) || !policy.shown(code));
                if (!hidden.length) break;
                for (const code of hidden) delete cells[code];
            }
            const policy = rowPolicy(def, source, cells, sources.length);
            if (!policy.shown('*')) continue;
            const columns = [];
            let valid = true;
            for (const option of def.options) {
                if (!policy.shown(option.code)) continue;
                const hasValue = filled(cellValue(cells, option.code));
                const required = !!option.required || policy.required(option.code);
                const commentRequired = hasValue && (!!option.comment || policy.wantsComment(option.code) || policy.wantsComment('*'));
                const commentEmpty = commentRequired && !String(cells[option.code]?.comment || '').trim();
                if ((required && !hasValue) || commentEmpty) valid = false;
                columns.push({ option, required, commentRequired, commentEmpty });
            }
            const emptyRequired = policy.required('*') && !Object.values(cells).some(cell => filled(cell.value));
            rows.push({ source, cells, columns, valid: valid && !emptyRequired, emptyRequired });
        }
        const clean = { version: 1 };
        if (def.revision !== undefined) clean.revision = def.revision;
        clean.rows = rows.filter(row => Object.keys(row.cells).length).map(row => ({ path: row.source.path, cells: row.cells }));
        return { rows, clean, valid: rows.every(row => row.valid) };
    }

    function element(doc, tag, className, text) {
        const el = doc.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function writeValue(model, row, option, input, isComment) {
        const cells = Object.assign(Object.create(null), row.cells);
        if (isComment) {
            if (!own(cells, option.code)) return;
            const cell = { ...cells[option.code] };
            if (input.value.length) cell.comment = input.value;
            else delete cell.comment;
            cells[option.code] = cell;
        } else {
            const selectable = option.type === 'single' || option.type === 'multi';
            const value = selectable ? input.checked : option.type === 'number' ?
                (Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null) : input.value;
            if (filled(value)) {
                for (const peer of model.ctx.definition.options) {
                    if (peer.code !== option.code && (option.exclusive || peer.exclusive ||
                        (option.type === 'single' && peer.type === 'single'))) delete cells[peer.code];
                }
                cells[option.code] = { ...(cells[option.code] || {}), value };
            } else delete cells[option.code];
        }
        const key = keyOf(row.source.path);
        model.answer.rows = model.answer.rows.filter(other => keyOf(other.path) !== key);
        model.answer.rows.push({ path: row.source.path, cells });
        refresh();
    }

    function createRow(model, source) {
        const doc = model.block.ownerDocument;
        const group = element(doc, 'fieldset', 'fieldset lcjq-row');
        const legend = element(doc, 'legend', 'fieldset-legend');
        const error = element(doc, 'p', 'lcjq-error', model.msg.any);
        error.hidden = true;
        group.append(legend, error);
        const record = { group, legend, error, options: new Map(), row: null };
        const name = 'lcjq-radio-' + (++counter);
        for (const option of model.ctx.definition.options) {
            const unit = element(doc, 'div', 'lcjq-cell');
            const label = element(doc, 'label', 'lcjq-label');
            const selectable = option.type === 'single' || option.type === 'multi';
            const type = selectable ? (option.type === 'single' ? 'radio' : 'checkbox') : option.type === 'number' ? 'number' : 'text';
            const input = element(doc, 'input', selectable ? (type === 'checkbox' ? 'checkbox form-check-input' : 'radio form-check-input') : 'input form-control');
            input.type = type;
            if (type === 'number') input.step = 'any';
            if (type === 'radio') {
                input.name = name;
                // Keep interface controls out of the LimeSurvey POST body.
                input.setAttribute('form', name + '-ui');
            }
            const caption = element(doc, 'span', '', localLabel(option.label, model.ctx.language) || option.code);
            const needed = element(doc, 'small', 'lcjq-required', model.msg.required);
            if (selectable) label.append(input, caption, needed);
            else label.append(caption, needed, input);
            const commentLabel = element(doc, 'label', 'lcjq-comment');
            const comment = element(doc, 'input', 'input form-control');
            comment.type = 'text';
            commentLabel.append(element(doc, 'span', '', model.msg.comment + ' — ' + caption.textContent), comment);
            unit.append(label, commentLabel);
            group.insertBefore(unit, error);
            input.addEventListener(selectable ? 'change' : 'input', () => writeValue(model, record.row, option, input, false));
            comment.addEventListener('input', () => writeValue(model, record.row, option, comment, true));
            record.options.set(option.code, { unit, input, comment, commentLabel, needed });
        }
        model.panel.append(group);
        return record;
    }

    function updateDom(model, result) {
        const retained = new Set();
        let slot = 0;
        for (const row of result.rows) {
            const key = keyOf(row.source.path);
            retained.add(key);
            const record = model.views.get(key) || createRow(model, row.source);
            model.views.set(key, record);
            if (model.panel.children[slot] !== record.group) model.panel.insertBefore(record.group, model.panel.children[slot] || null);
            slot++;
            record.row = row;
            const title = localLabel(row.source.label, model.ctx.language) || row.source.path.join(' / ');
            if (record.legend.textContent !== title) record.legend.textContent = title;
            record.error.hidden = !row.emptyRequired;
            const props = new Map(row.columns.map(col => [col.option.code, col]));
            for (const [code, ui] of record.options) {
                const col = props.get(code);
                ui.unit.hidden = !col;
                if (!col) continue;
                const cell = row.cells[code] || {};
                ui.needed.hidden = !col.required;
                ui.input.setAttribute('aria-required', String(col.required));
                if (ui.input.type === 'radio' || ui.input.type === 'checkbox') ui.input.checked = filled(cell.value);
                else if (ui.input.value !== String(cell.value ?? '')) ui.input.value = String(cell.value ?? '');
                ui.commentLabel.hidden = !col.commentRequired;
                ui.comment.setAttribute('aria-required', String(col.commentRequired));
                ui.comment.setAttribute('aria-invalid', String(col.commentEmpty));
                if (ui.comment.value !== (cell.comment || '')) ui.comment.value = cell.comment || '';
            }
        }
        for (const [key, record] of model.views) {
            if (!retained.has(key)) { record.group.remove(); model.views.delete(key); }
        }
        model.empty.hidden = !!result.rows.length;
    }

    function refresh() {
        if (updating) return;
        updating = true;
        try {
            const visited = new Set();
            const changed = [];
            function update(model) {
                if (visited.has(model) || model.error || !model.block.isConnected) return;
                visited.add(model);
                const def = model.ctx.definition;
                const previous = active.get(def.source);
                if (previous) update(previous);
                const sources = sourceRows(model.ctx, def.source, model.block.ownerDocument);
                const result = analyze(def, sources, model.answer);
                model.answer = result.clean;
                model.valid = result.valid;
                updateDom(model, result);
                // An unanswered optional block remains blank to native ExpressionScript.
                const json = result.clean.rows.length ? JSON.stringify(result.clean) : '';
                const bytes = encodedBytes(json);
                model.tooLarge = bytes > model.maxBytes;
                model.sizeError.hidden = !model.tooLarge;
                if (model.tooLarge) {
                    const language = model.ctx.language.split('-')[0];
                    const message = (byteMessages[language] || byteMessages.en)(bytes, model.maxBytes);
                    if (model.sizeError.textContent !== message) model.sizeError.textContent = message;
                }
                if (model.storage.value !== json) {
                    model.storage.value = json;
                    changed.push(model.storage);
                }
            }
            for (const model of active.values()) update(model);
            for (const storage of changed) {
                for (const type of ['input', 'change', 'keyup']) storage.dispatchEvent(new Event(type, { bubbles: true }));
            }
        } finally { updating = false; }
    }

    function mount(doc = root.document) {
        for (const [code, model] of active) if (!model.block.isConnected) active.delete(code);
        for (const block of doc.querySelectorAll('.lcjq-block[data-lcjq]')) {
            if (block.dataset.lcjqMounted) continue;
            const storage = block.querySelector('textarea');
            if (!storage) continue;
            let ctx;
            try { ctx = JSON.parse(block.dataset.lcjq); } catch (_) { continue; }
            if (!ctx.definition || !Array.isArray(ctx.definition.options) || !ctx.questionCode) continue;
            ctx.language ||= doc.documentElement.lang || 'en';
            const msg = messages[ctx.language.split('-')[0]] || messages.en;
            const panel = element(doc, 'div', 'lcjq-panel');
            const empty = element(doc, 'p', 'lcjq-empty', msg.empty);
            empty.setAttribute('role', 'status');
            const sizeError = element(doc, 'p', 'lcjq-error');
            sizeError.tabIndex = -1;
            sizeError.hidden = true;
            sizeError.setAttribute('role', 'alert');
            const maxBytes = Number.isSafeInteger(ctx.maxBytes) && ctx.maxBytes > 0 ? ctx.maxBytes : DEFAULT_BYTES;
            const model = { block, ctx, msg, panel, empty, storage, sizeError, maxBytes, views: new Map(), valid: false };
            try { model.answer = readAnswer(storage.value); }
            catch (_) { model.error = true; empty.textContent = msg.invalid; empty.setAttribute('role', 'alert'); }
            block.dataset.lcjqMounted = 'true';
            storage.hidden = true;
            for (const fallback of block.querySelectorAll('.lcjq-fallback')) fallback.hidden = true;
            block.append(panel, empty, sizeError);
            active.set(ctx.questionCode, model);
        }
        refresh();
    }

    const encodedBytes = value => new TextEncoder().encode(value).length;

    function validatePayload(def, sources, raw, maxBytes = DEFAULT_BYTES) {
        const answer = readAnswer(raw);
        if (typeof raw === 'string' && encodedBytes(raw) > maxBytes) return false;
        if (raw && def.revision !== undefined && answer.revision !== def.revision) return false;
        const options = new Map(def.options.map(option => [option.code, option]));
        const sourceMap = new Map(sources.map(row => [keyOf(row.path), row]));
        if (answer.rows.length > 10000) return false;
        for (const row of answer.rows) {
            const source = sourceMap.get(keyOf(row.path));
            if (!source || !row.path.length || row.path.length > 32) return false;
            const policy = rowPolicy(def, source, row.cells, sources.length);
            if (!policy.shown('*') && Object.keys(row.cells).length) return false;
            let single = 0;
            let count = 0;
            let exclusive = false;
            for (const [code, cell] of Object.entries(row.cells)) {
                const option = options.get(code);
                if (!option || Object.keys(cell).some(key => !['value', 'comment'].includes(key))) return false;
                const value = cell.value;
                if (value !== null) {
                    if (option.type === 'number' && !Number.isFinite(value)) return false;
                    if (option.type === 'text' && (typeof value !== 'string' || encodedBytes(value) > 65535)) return false;
                    if (['single','multi'].includes(option.type) && typeof value !== 'boolean') return false;
                }
                if (cell.comment != null && (typeof cell.comment !== 'string' || encodedBytes(cell.comment) > 65535)) return false;
                if (!filled(value)) {
                    if (String(cell.comment || '').trim()) return false;
                    continue;
                }
                if (!policy.shown(code)) return false;
                if (option.type === 'single') single++;
                if (option.exclusive) exclusive = true;
                count++;
            }
            if (single > 1 || (exclusive && count > 1)) return false;
        }
        return analyze(def, sources, answer).valid;
    }

    root.lcjqValid = function (payload, code, sid) {
        const model = active.get(code);
        if (!model || model.error || model.tooLarge || (model.ctx.surveyId && String(sid) !== String(model.ctx.surveyId))) return false;
        try {
            return validatePayload(model.ctx.definition, sourceRows(model.ctx, model.ctx.definition.source, model.block.ownerDocument), payload, model.maxBytes);
        } catch (_) { return false; }
    };
    root.LimeControlJsonRespondent = { mount, condition, analyze, readAnswer, validatePayload };
    if (!root.document) return;
    const doc = root.document;
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => mount(doc));
    else mount(doc);
    for (const type of ['change', 'input']) doc.addEventListener(type, event => {
        if (!event.target.closest?.('.lcjq-block')) refresh();
    });
    function guardSubmit(event, form) {
        if (!form) return;
        for (const model of active.values()) {
            if (!model.tooLarge || model.storage.form !== form || !model.block.isConnected) continue;
            event.preventDefault();
            event.stopImmediatePropagation();
            model.sizeError.focus();
            return;
        }
    }
    doc.addEventListener('submit', event => guardSubmit(event, event.target), true);
    doc.addEventListener('click', event => {
        const control = event.target.closest?.('button, input[type=submit], input[type=image]');
        if (control && (control.type === 'submit' || control.type === 'image')) guardSubmit(event, control.form);
    }, true);
    const observer = new MutationObserver(records => {
        if (records.some(record => Array.from(record.addedNodes).some(node => node.nodeType === 1 &&
            (node.matches('.lcjq-block') || node.querySelector('.lcjq-block'))))) mount(doc);
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    if (root.jQuery) root.jQuery(doc).on('pjax:scriptcomplete.lcjq', () => mount(doc));
})(typeof window === 'undefined' ? globalThis : window);
