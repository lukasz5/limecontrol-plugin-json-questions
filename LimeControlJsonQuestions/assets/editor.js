// SPDX-License-Identifier: GPL-2.0-or-later
(() => {
  'use strict';
  const question = document.querySelector('#lcjq-question');
  if (question) question.addEventListener('change', () => location.assign(question.value));
  const form = document.querySelector('#lcjq-editor');
  if (!form) return;
  const cfg = JSON.parse(form.dataset.config), text = cfg.messages;
  const def = cfg.definition && cfg.definition.version ? structuredClone(cfg.definition) :
    {version: 1, kind: 'choice', source: cfg.sources[0] || '', options: [], rules: []};
  delete def.revision;
  const byId = key => document.getElementById('lcjq-' + key);
  const element = (tag, content) => {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    return node;
  };
  function control(parent, label, input) {
    const box = element('label', label);
    box.append(input);
    parent.append(box);
    return input;
  }
  function field(parent, label, value, changed, required = false) {
    const input = element('input');
    input.className = 'input'; input.value = value ?? ''; input.required = required;
    input.addEventListener('input', () => { changed(input.value); preview(); });
    return control(parent, label, input);
  }
  function select(parent, label, choices, value, changed) {
    const input = element('select'); input.className = 'select';
    for (const [code, display] of choices) input.add(new Option(display, code));
    input.value = value;
    input.addEventListener('change', () => { changed(input.value); preview(); });
    return control(parent, label, input);
  }
  function tick(parent, label, value, changed) {
    const c = element('input'); c.type = 'checkbox'; c.checked = !!value;
    c.addEventListener('change', () => { changed(c.checked); preview(); });
    return control(parent, label, c);
  }
  function button(parent, label, clicked) {
    const b = element('button', label); b.type = 'button'; b.className = 'btn';
    b.addEventListener('click', clicked); parent.append(b);
  }
  const named = keys => keys.map(key => [key,text[key]]);
  function removeFrom(items, item, draw) {
    items.splice(items.indexOf(item), 1); draw(); preview();
  }
  function newOption() {
    let n = def.options.length + 1;
    while (def.options.some(opt => opt.code === 'OPT' + n)) n++;
    return {code: 'OPT' + n, type: 'multi', label: {pl:'',en:'',de:''}};
  }
  function options() {
    const list = byId('options'); list.replaceChildren();
    for (const opt of def.options) {
      const box = element('fieldset'); box.className = 'fieldset';
      box.append(element('legend',opt.code));
      const key = field(box, text.code, opt.code, value => { opt.code = value; }, true);
      key.pattern = '[A-Za-z][A-Za-z0-9_\\-]{0,63}';
      key.addEventListener('change', () => { rules(); box.querySelector('legend').textContent = opt.code; });
      select(box, text.type, named(['single','multi','number','text']), opt.type, value => { opt.type = value; });
      for (const lang of ['pl','en','de']) field(box, text.label + ' ('+lang+')', opt.label[lang] || '', v=>{opt.label[lang]=v;});
      tick(box, text.exclusive,opt.exclusive,v=>{opt.exclusive=v;});
      tick(box, text.comment,opt.comment,v=>{opt.comment=v;});
      tick(box, text.require,opt.required,v=>{opt.required=v;});
      button(box, text.remove, () => {removeFrom(def.options,opt,options); rules();});
      list.append(box);
    }
  }
  const leaf = () => ({field:'source.count',op:'gt',value:0});
  function clause(parent, c, replace, depth) {
    const box = element('fieldset'); box.className = 'fieldset'; parent.append(box);
    const group = ['all','any','not'].find(k => Object.hasOwn(c,k)) || 'leaf';
    select(box, text.rules, named(['leaf','all','any','not']), group, mode => {
      replace(mode==='leaf' ? leaf() : {[mode]:mode==='not'?leaf():[leaf()]}); rules();
    });
    if (group === 'leaf') {
      const src = cfg.sourceDefinitions[def.source] || {};
      const fields = [['source.count',text.count]];
      for (const [prefix,opts] of [['source',src.options || []],['self',def.options]]) {
        for (const o of opts) fields.push([prefix+'.'+o.code, prefix+' · '+o.code]);
      }
      if (!fields.some(entry => entry[0] === c.field)) fields.push([c.field,c.field]);
      select(box,text.field,fields,c.field,v=>{c.field=v;});
      select(box,text.op,named(['eq','gt','gte','lt','lte','selected']),c.op,v=>{c.op=v; rules();});
      if (c.op !== 'selected') field(box,text.value,c.value ?? '',v=>{
        c.value = v === 'true' ? true : v === 'false' ? false : v !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
      });
      return;
    }
    const children = element('div'); children.className = 'lcjq-children'; box.append(children);
    if (group === 'not') {
      clause(children,c.not,next=>{c.not=next;},depth+1); return;
    }
    for (const child of c[group]) {
      clause(children,child,next=>{c[group][c[group].indexOf(child)]=next;},depth+1);
      if (c[group].length>1) button(children,text.remove,()=>removeFrom(c[group],child,rules));
    }
    if (depth<11 && c[group].length<32) button(box,text.add,()=>{c[group].push(leaf()); rules();});
  }
  function rules() {
    const list = byId('rules'); list.replaceChildren();
    for (const r of def.rules) {
      const box = element('fieldset'); box.className = 'fieldset';
      select(box,text.effect,named(['show','require','requireComment']),r.effect,v=>{r.effect=v;});
      select(box,text.target,[['*','*'],...def.options.map(o=>[o.code,o.code])],r.target,v=>{r.target=v;});
      clause(box,r.when,next=>{r.when=next;},0);
      button(box,text.remove,()=>removeFrom(def.rules,r,rules)); list.append(box);
    }
  }
  function preview() {
    const out=byId('preview'); out.replaceChildren();
    const row=element('fieldset'); row.append(element('legend',text.sample));
    for(const opt of def.options) {
      const input=element('input');
      input.type = ({single:'radio', multi:'checkbox', number:'number', text:'text'})[opt.type];
      if (input.type==='radio') input.name='lcjq-preview-only';
      const lang=cfg.language.split('-')[0];
      control(row,opt.label[lang] || opt.label.en || opt.label.pl || opt.code,input);
      if (opt.comment) control(row,text.comment,element('input'));
    }
    out.append(row);
  }
  byId('kind').value=def.kind;
  byId('source').value=def.source;
  byId('source').addEventListener('change',e=>{def.source=e.target.value;rules();preview();});
  byId('kind').addEventListener('change',e=>{def.kind=e.target.value;preview();});
  byId('new-option').addEventListener('click',()=>{def.options.push(newOption());options();rules();preview();});
  byId('new-rule').addEventListener('click',()=>{def.rules.push({effect:'show',target:'*',when:leaf()});rules();});
  form.addEventListener('submit',()=>{form.elements.definition.value=JSON.stringify(def);});
  if (!def.options.length) def.options.push(newOption());
  options(); rules(); preview();
})();
