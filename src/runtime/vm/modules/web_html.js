'use strict';

function createWebHtmlModules() {
    return {
        web: {
            html: (args) => {
                const template = args[0] ?? '';
                const data = args[1] ?? {};
                const _escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                let result = template;
                for (const [key, value] of Object.entries(data)) {
                    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), _escapeHtml(value));
                }
                return result;
            },
            tag: (args) => {
                const tagName = String(args[0] ?? 'div');
                if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tagName)) return '';
                const attrs = args[1] ?? {};
                const children = args[2] ?? '';
                const _escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const _escapeContent = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                let attrStr = '';
                for (const [key, value] of Object.entries(attrs)) {
                    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(key)) continue;
                    attrStr += ' ' + key + '="' + _escapeAttr(value) + '"';
                }
                const selfClosing = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
                if (selfClosing.includes(tagName.toLowerCase())) {
                    return '<' + tagName + attrStr + ' />';
                }
                return '<' + tagName + attrStr + '>' + _escapeContent(children) + '</' + tagName + '>';
            },
            css: (args) => {
                const styles = args[0] ?? {};
                let cssStr = '';
                for (const [selector, rules] of Object.entries(styles)) {
                    cssStr += selector + ' {';
                    for (const [prop, value] of Object.entries(rules)) {
                        cssStr += prop + ': ' + value + ';';
                    }
                    cssStr += '} ';
                }
                return cssStr.trim();
            },
            page: (args) => {
                const title = args[0] ?? 'Untitled';
                const body = args[1] ?? '';
                const styles = args[2] ?? '';
                const scripts = args[3] ?? '';
                return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + title + '</title>\n' + (styles ? '<style>' + styles + '</style>\n' : '') + '</head>\n<body>\n' + body + '\n' + (scripts ? '<script>' + scripts + '</script>' : '') + '\n</body>\n</html>';
            },
            component: (args) => {
                const name = args[0] ?? 'component';
                const template = args[1] ?? '';
                const data = args[2] ?? {};
                let html = template;
                for (const [key, value] of Object.entries(data)) {
                    html = html.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), String(value));
                }
                return '<div data-component="' + name + '">' + html + '</div>';
            },
            link: (args) => {
                const text = args[0] ?? '';
                const href = args[1] ?? '#';
                const className = args[2] ?? '';
                return '<a href="' + href + '"' + (className ? ' class="' + className + '"' : '') + '>' + text + '</a>';
            },
            img: (args) => {
                const src = args[0] ?? '';
                const alt = args[1] ?? '';
                const className = args[2] ?? '';
                return '<img src="' + src + '" alt="' + alt + '"' + (className ? ' class="' + className + '"' : '') + ' />';
            },
            list: (args) => {
                const items = args[0] ?? [];
                const ordered = args[1] ?? false;
                const tag = ordered ? 'ol' : 'ul';
                let html = '<' + tag + '>';
                for (const item of items) {
                    html += '<li>' + String(item) + '</li>';
                }
                html += '</' + tag + '>';
                return html;
            },
            table: (args) => {
                const data = args[0] ?? [];
                const headers = args[1] ?? [];
                let html = '<table>';
                if (headers.length > 0) {
                    html += '<thead><tr>';
                    for (const h of headers) {
                        html += '<th>' + String(h) + '</th>';
                    }
                    html += '</tr></thead>';
                }
                html += '<tbody>';
                for (const row of data) {
                    html += '<tr>';
                    if (Array.isArray(row)) {
                        for (const cell of row) {
                            html += '<td>' + String(cell) + '</td>';
                        }
                    } else {
                        for (const h of headers) {
                            html += '<td>' + String(row[h] ?? '') + '</td>';
                        }
                    }
                    html += '</tr>';
                }
                html += '</tbody></table>';
                return html;
            },
            form: (args) => {
                const action = args[0] ?? '';
                const method = args[1] ?? 'POST';
                const fields = args[2] ?? [];
                let html = '<form action="' + action + '" method="' + method + '">';
                for (const field of fields) {
                    const type = field.type ?? 'text';
                    const name = field.name ?? '';
                    const label = field.label ?? name;
                    const required = field.required ? ' required' : '';
                    if (label) {
                        html += '<label>' + label + '</label>';
                    }
                    if (type === 'textarea') {
                        html += '<textarea name="' + name + '"' + required + '></textarea>';
                    } else if (type === 'select') {
                        html += '<select name="' + name + '"' + required + '>';
                        const options = field.options ?? [];
                        for (const opt of options) {
                            html += '<option value="' + opt + '">' + opt + '</option>';
                        }
                        html += '</select>';
                    } else {
                        html += '<input type="' + type + '" name="' + name + '"' + required + ' />';
                    }
                }
                html += '<button type="submit">Submit</button></form>';
                return html;
            },
            escape: (args) => {
                const str = String(args[0] ?? '');
                return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
            },
            minify: (args) => {
                const html = String(args[0] ?? '');
                return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
            }
        },
        html: {
            tag: (args) => {
                const tagName = String(args[0] ?? 'div');
                if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tagName)) return '';
                const content = args[1] ?? '';
                const selfClosing = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
                if (selfClosing.includes(tagName.toLowerCase())) {
                    return '<' + tagName + ' />';
                }
                return '<' + tagName + '>' + String(content) + '</' + tagName + '>';
            },
            css: (args) => {
                const styles = args[0] ?? {};
                let css = '';
                for (const [selector, rules] of Object.entries(styles)) {
                    if (typeof rules === 'object' && rules !== null) {
                        css += selector + ' { ';
                        for (const [prop, val] of Object.entries(rules)) {
                            css += prop.replace(/([A-Z])/g, '-$1').toLowerCase() + ': ' + val + '; ';
                        }
                        css += '} ';
                    }
                }
                return css.trim();
            },
            escape: (args) => {
                const str = String(args[0] ?? '');
                return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
            }
        }
    };
}

module.exports = {
    createWebHtmlModules
};
