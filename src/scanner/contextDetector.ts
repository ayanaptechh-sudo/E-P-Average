// PromptShield context-based sensitive-data detector (offset-only results, never returns matched values)
export type Category =
  | 'Password/API Key' | 'API Keys & Secrets' | 'National ID' | 'Personal ID' | 'Phone Number'
  | 'Bank Account / IBAN' | 'Payment Cards' | 'Email Lists' | 'Passport' | 'SSN' | 'Date of Birth' | 'Confidentiality Labels';
export type Severity = 'Medium' | 'High' | 'Critical';
export interface Hit { start: number; end: number; category: Category; severity: Severity; rule: string; priority: number; }

const U = 'giu';
const W = String.raw`[\p{L}\p{N}]`;
const SEP = String.raw`[\s_-]*`;

/* ---------- shared pieces ---------- */
const CONN = String.raw`(?:is|was|are|were|<-+|<=+|=>|->|=|:|-|hai|he|h|hy|ye\s+hai|yeh\s+hai|ye\s+h|ye\s+raha|yeh\s+raha|ye\s+rahi|ye\s+hy|ye\s+he|ye\s+wala|yeh\s+wala)`;
const VAL = String.raw`["'\x60“‘]?([^\s"'\x60”’,;]{3,})["'\x60”’]?`;
const FILL = String.raw`(?:\s+[\p{L}\p{N}_'’-]{1,20}){0,5}?`;
const POSS = String.raw`(?:(?:my|the|our|his|her|their|your|mera|meri|mere|apna|apni)\s+)?(?:[\p{L}]{2,15}\s+){0,2}?`;
const TAIL = String.raw`(?:\s+[\p{L}]{1,12}){0,2}?`;
const NB = String.raw`(?<![\p{L}\p{N}_])`;
const NA = String.raw`(?![\p{L}\p{N}@#$%])`;

/* ---------- credential keywords ---------- */
const CKW = String.raw`(?:api${SEP}key|api${SEP}secret|apikey|api|secret${SEP}key|client${SEP}secret|secret|access${SEP}(?:key|token)|auth${SEP}token|bearer|token|passw(?:or)?d|passcode|passphrase|pwd|pass|credentials?|private${SEP}key|login|pin|otp|cvv|cvc|key)`;
const PIN = /^(?:pin|otp|cvv|cvc)$/i;

/* ---------- identity keywords, grouped by how strict the value must be ---------- */
const ID_STRONG = String.raw`(?:national${SEP}id(?:entity)?(?:${SEP}(?:card|number|no\.?|num|#))?|identity${SEP}card(?:${SEP}(?:number|no\.?|num))?|identity${SEP}(?:number|no\.?)|shanakhti${SEP}card(?:${SEP}(?:number|no\.?|num))?|id${SEP}card(?:${SEP}(?:number|no\.?|num))?|cnic(?:${SEP}(?:number|no\.?|num|#))?|nicop|nic(?:${SEP}(?:number|no\.?|num|#))?|nid|b${SEP}form|passport(?:${SEP}(?:number|no\.?|num|#))?|ssn|social${SEP}security(?:${SEP}(?:number|no\.?))?|(?:driving${SEP})?licen[cs]e(?:${SEP}(?:number|no\.?|num))?|tax${SEP}(?:id|number)|ntn|strn|aadhaar|aadhar|student${SEP}(?:id|number)|employee${SEP}(?:id|number)|emp${SEP}id|roll${SEP}(?:no\.?|number))`;
const ID_ACCT = String.raw`(?:(?:bank${SEP})?acc(?:ount|t)?${SEP}(?:number|no\.?|num|#)|a/c(?:${SEP}(?:no\.?|number))?|iban|card${SEP}(?:number|no\.?|num)|(?:credit|debit|atm)${SEP}card(?:${SEP}(?:number|no\.?|num))?|visa|mastercard)`;
const ID_GENERIC = String.raw`(?:id${SEP}(?:number|no\.?|num|#)|id)`;
const PH_KW = String.raw`(?:(?:phone|mobile|cell|contact|whatsapp|tel(?:ephone)?|call|number)${SEP}(?:number|no\.?|num|#)?|ph${SEP}(?:no\.?|number)|call${SEP}me${SEP}(?:on|at)|whatsapp${SEP}me${SEP}(?:on|at)|text${SEP}me${SEP}(?:on|at))`;
const DOB_KW = String.raw`(?:dob|d\.o\.b\.?|date${SEP}of${SEP}birth|birth${SEP}date|birthday|born${SEP}on)`;

const DOB_VAL = String.raw`\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4}`;
/* ---------- value validators ---------- */
const STOP = new Set(['password','username','hello','thanks','please','working','welcome','example','changeme','required','invalid','expired','correct','missing','secure','private','public','strong','simple','access','account','number','generate','generated','revoked','rotation','login','token','secret']);
const PLACEHOLDER = /^(?:x+|\*+|-+|\.+|_+|changeme|your[_-]?(?:api[_-]?key|password|secret|token|key)|example|test123|<[^>]*>|\{[^}]*\}|\[[^\]]*\]|redacted|placeholder|null|none|undefined|true|false)$/i;
const clean = (v: string) => v.replace(/[.,;:!?)\]}]+$/, '').replace(/^[(\[{]+/, '');
const digitsOf = (v: string) => v.replace(/\D/g, '');
function shannon(s: string) { const f: Record<string, number> = {}; for (const c of s) f[c] = (f[c] || 0) + 1; return -Object.values(f).reduce((a, n) => a + (n / s.length) * Math.log2(n / s.length), 0); }
export function luhn(d: string) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return d.length > 0 && s % 10 === 0; }
export function cardBrandOk(d: string) {
  const n = d.length;
  if (/^4/.test(d)) return n === 16 || n === 19;
  if (/^(?:5[1-5]|2(?:2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return n === 16;
  if (/^3[47]/.test(d)) return n === 15;
  if (/^(?:6011|65|64[4-9])/.test(d)) return n >= 16 && n <= 19;
  if (/^35(?:2[89]|[3-8])/.test(d)) return n >= 16 && n <= 19;
  if (/^3(?:0[0-5]|[68])/.test(d)) return n >= 14 && n <= 16;
  if (/^62/.test(d)) return n >= 16 && n <= 19;
  return false;
}
export function ibanOk(raw: string) {
  const s = raw.replace(/\s+/g, '').toUpperCase(); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let rem = 0; for (const ch of r) rem = (rem * 10 + +ch) % 97; return rem === 1;
}
function credValue(v0: string, kind: string): string | null {
  const v = clean(v0);
  if (v.length < 3 || /^[\/.]|^https?:/i.test(v)) return null;
  if (PLACEHOLDER.test(v) || STOP.has(v.toLowerCase())) return null;
  const hasDigit = /\d/.test(v), hasSym = /[_\-@#$%^&*!+=\/\\.]/.test(v) && /[A-Za-z0-9]/.test(v);
  const mixed = /[a-z]/.test(v) && /[A-Z]/.test(v);
  if (/^\d+$/.test(v)) return v.length >= 6 ? v : null;
  if (hasDigit && v.length >= 6) return v;
  if (mixed && v.length >= 8 && (v.match(/[A-Z]/g) || []).length >= 2) return v;
  if (hasSym && v.length >= 8 && (hasDigit || mixed)) return v;
  if (/^[A-Za-z0-9_\-+/=]{20,}$/.test(v) && shannon(v) > 3.5) return v;
  return null;
}
function idValue(v0: string, level: 'strong' | 'acct' | 'generic'): string | null {
  const v = clean(v0); if (PLACEHOLDER.test(v) || /^[\/.]|^https?:/i.test(v)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9\-/. ]*$/.test(v)) return null;
  const d = digitsOf(v).length, letters = (v.match(/[A-Za-z]/g) || []).length;
  if (letters > d) return null;
  if (level === 'generic') return d >= 9 ? v : null;       // "id" alone is noisy, require a long number
  if (level === 'acct') return d >= 8 ? v : null;
  return d >= 5 ? v : null;
}
function phoneValue(v0: string): string | null {
  const v = clean(v0); const d = digitsOf(v);
  if (!/^[+(]?\d[\d\-().]*$/.test(v)) return null;
  if (d.length < 10 || d.length > 14) return null;
  return v;
}

/* ---------- detection ---------- */
interface Raw { start: number; end: number; category: Category; severity: Severity; rule: string; priority: number; }
const P = { PRIVKEY: 100, KNOWN: 95, IDCTX: 92, CARD: 90, ACCT: 88, CNIC: 85, SSN: 85, IBAN: 85, CRED: 70, PASSPORT: 65, PHONE: 50, EMAIL: 45, DOB: 40, CONF: 30 };

export function detectAll(text: string, extraKeywords: string[] = []): Hit[] {
  const out: Raw[] = [];
  const push = (start: number, end: number, category: Category, severity: Severity, rule: string, priority: number) => { if (end > start) out.push({ start, end, category, severity, rule, priority }); };
  const extra = extraKeywords.map(k => k.trim()).filter(Boolean).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  const CK = extra.length ? `(?:${CKW}|${extra.join('|')})` : CKW;


  /* 1. known-format secrets (anywhere, no keyword needed) */
  const KNOWN: [RegExp, string][] = [
    [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, 'private_key'],
    [/(?<![\w-])sk-(?:proj-|live-|ant-)?[A-Za-z0-9_-]{16,}/g, 'sk_key'],
    [/(?<![\w-])(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g, 'stripe'],
    [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g, 'aws'],
    [/(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/g, 'google'],
    [/(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{36,}/g, 'github'],
    [/(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{22,}/g, 'github_pat'],
    [/(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}/g, 'slack'],
    [/(?<![A-Za-z0-9])hf_[A-Za-z0-9]{30,}/g, 'huggingface'],
    [/(?<![A-Za-z0-9])ya29\.[A-Za-z0-9_-]{10,}/g, 'google_oauth'],
    [/(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, 'sendgrid'],
    [/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'jwt'],
    [/(?<=Bearer\s)[A-Za-z0-9._~+/=-]{16,}/gi, 'bearer'],
    [/(?<=\/\/)[^\s:@/]+:([^\s:@/]{3,})(?=@[^\s]+)/g, 'uri_cred'],
  ];
  for (const [re, rule] of KNOWN) for (const m of text.matchAll(re)) push(m.index as number, (m.index as number) + m[0].length, 'API Keys & Secrets', rule === 'private_key' || rule === 'aws' || rule === 'stripe' ? 'Critical' : 'High', rule, rule === 'private_key' ? P.PRIVKEY : P.KNOWN);

  /* 2. contextual credentials (non-consuming lookahead scans, so one match can never hide another) */
  const TS = String.raw`(?<=^|[\s"'\x60(\[{“‘:=,;])`;                       // token start
  const scan = (body: string) => text.matchAll(new RegExp(`(?=(${body}))`, U));
  const addCred = (m: RegExpMatchArray, kwIdx: number, vIdx: number, kind: string, valFirst: boolean) => {
    const region = m[1]; const kw = m[kwIdx + 1]; const val = m[vIdx + 1]; if (!kw || !val) return;
    const ok = PIN.test(kw.trim()) ? (/^\d{3,8}$/.test(val.replace(/[.,;!?]+$/, '')) ? val : null) : credValue(val, kind);
    if (!ok) return;
    const rel = valFirst ? region.indexOf(val) : region.lastIndexOf(val); const start = (m.index as number) + rel;
    push(start, start + clean(val).length, 'Password/API Key', 'High', 'cred_' + kind, P.CRED);
  };
  for (const m of scan(`${NB}(${CK})${NA}${FILL}\\s*(?:${CONN})\\s*${VAL}`)) addCred(m, 1, 2, 'forward', false);
  for (const m of scan(`${NB}(${CK})${NA}\\s+${VAL}`)) addCred(m, 1, 2, 'direct', false);
  for (const m of scan(`${TS}${VAL}\\s*(?:${CONN}|\\(|\\[)?\\s*${POSS}(${CK})${NA}`)) addCred(m, 2, 1, 'reverse', true);
  for (const m of scan(`${TS}${VAL}\\s+${POSS}(${CK})${TAIL}\\s+(?:hai|he|h|hy)${NA}`)) addCred(m, 2, 1, 'reverse', true);
  for (const m of scan(String.raw`(?<![\p{L}\p{N}])([\w.-]*(?:passw(?:or)?d|pwd|secret|token|api[_-]|[_-]key|apikey|access[_-]?key|private[_-]?key)[\w.-]*)\s*(?:=|:|=>)\s*${VAL}`)) addCred(m, 1, 2, 'env', false);
  for (const m of text.matchAll(/(?<![\p{L}\p{N}_])(?:credentials?|logins?)\s*[:=-]?\s*([^\n]{3,80})/giu)) {
    const base = (m.index as number) + m[0].length - m[1].length; let off = 0;
    for (const tok of m[1].split(/\s+/)) { const idx = m[1].indexOf(tok, off); off = idx + tok.length; const v = credValue(tok, 'list'); if (v && (/\d/.test(v) || /[@#$%!_]/.test(v))) { push(base + idx, base + idx + v.length, 'Password/API Key', 'High', 'cred_list', P.CRED); break; } }
  }

  /* 3. contextual identity numbers: keyword + value, connector optional, spaced numbers supported */
  const SPACED = String.raw`[A-Za-z]?\d(?:[\s-]?\d){7,25}(?![\p{L}\p{N}])`;
  const VAL2 = String.raw`["'\x60“‘]?(${SPACED}|[^\s"'\x60”’,;]{3,})["'\x60”’]?`;
  const idDefs: [string, 'strong' | 'acct' | 'generic'][] = [[ID_STRONG, 'strong'], [ID_ACCT, 'acct'], [ID_GENERIC, 'generic']];
  const catFor = (kw: string, level: string): Category =>
    /^(?:credit|debit|atm|card|visa|mastercard)/i.test(kw.trim()) ? 'Payment Cards' : level === 'acct' ? 'Bank Account / IBAN' : /passport/i.test(kw) ? 'Passport' : /cnic|\bnic|national|nid|b\s*form/i.test(kw) ? 'National ID' : /ssn|social/i.test(kw) ? 'SSN' : 'Personal ID';
  for (const [kw, level] of idDefs) {
    for (const m of scan(`${NB}${POSS}(${kw})${NA}(?:\\s+[\\p{L}]{1,10}){0,2}?\\s*(?:${CONN})?\\s*${VAL2}`)) {
      const val = m[3]; const ok = val && idValue(val, level); if (!ok) continue;
      const start = (m.index as number) + m[1].lastIndexOf(val); const cat = catFor(m[2], level);
      push(start, start + clean(val).length, cat, cat === 'Payment Cards' ? 'Critical' : 'High', 'id_ctx_' + level, P.IDCTX);
    }
    for (const m of scan(`${TS}${VAL2}\\s*(?:${CONN}|\\(|\\[)?\\s*${POSS}(${kw})${NA}`)) {
      const val = m[2]; const ok = val && idValue(val, level); if (!ok) continue;
      const start = (m.index as number) + m[1].indexOf(val); const cat = catFor(m[3], level);
      push(start, start + clean(val).length, cat, cat === 'Payment Cards' ? 'Critical' : 'High', 'id_ctx_rev_' + level, P.IDCTX);
    }
  }
  /* phones with keyword */
  for (const m of scan(`${NB}${POSS}(${PH_KW})${NA}(?:\\s+[\\p{L}]{1,10}){0,2}?\\s*(?:${CONN})?\\s*(?:["'\\x60]?)(\\+?\\(?\\d[\\d\\s\\-().]{8,22}\\d)`)) {
    const val = m[3]; if (!phoneValue(val.replace(/\s+/g, ''))) continue;
    const start = (m.index as number) + m[1].lastIndexOf(val); push(start, start + val.length, 'Phone Number', 'Medium', 'phone_ctx', P.PHONE);
  }
  /* DOB */
  for (const m of scan(NB + '(' + DOB_KW + ')' + NA + String.raw`\s*(?:` + CONN + String.raw`)?\s*(` + DOB_VAL + ')')) {
    const val = m[3]; const start = (m.index as number) + m[1].lastIndexOf(val); push(start, start + val.length, 'Date of Birth', 'Medium', 'dob_ctx', P.DOB);
  }

  /* 4. standalone personal data (no keyword needed) */
  for (const m of text.matchAll(/(?<![\d-])([1-7]\d{4})([-\s]?)(\d{7})\2(\d)(?![\d-])/g)) push(m.index as number, (m.index as number) + m[0].length, 'National ID', 'High', 'cnic', P.CNIC);
  for (const m of text.matchAll(/(?<![\d-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\d-])/g)) push(m.index as number, (m.index as number) + m[0].length, 'SSN', 'High', 'ssn', P.SSN);
  for (const m of text.matchAll(/(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?(?![A-Za-z0-9])/g)) if (ibanOk(m[0])) push(m.index as number, (m.index as number) + m[0].length, 'Bank Account / IBAN', 'High', 'iban', P.IBAN);
  for (const m of text.matchAll(/(?<![\d])(?:\d[ .-]?){12,18}\d(?![\d])/g)) { const d = digitsOf(m[0]); if (d.length >= 14 && d.length <= 19 && cardBrandOk(d) && luhn(d) && !/^(\d)\1+$/.test(d)) push(m.index as number, (m.index as number) + m[0].length, 'Payment Cards', 'Critical', 'card', P.CARD); }
  for (const m of text.matchAll(/(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])/g)) push(m.index as number, (m.index as number) + m[0].length, 'Email Lists', 'Medium', 'email', P.EMAIL);
  for (const m of text.matchAll(/(?<![\d+])(?:\+|00)?92[\s-]?\(?0?\)?[\s-]?3\d{2}[\s-]?\d{7}(?!\d)|(?<![\d+])03\d{2}[\s-]?\d{7}(?!\d)|(?<![\d+])\(03\d{2}\)[\s-]?\d{7}(?!\d)|(?<![\d])0(?:21|22|42|51|52|61|91)[\s-]\d{7,8}(?!\d)/g)) push(m.index as number, (m.index as number) + m[0].length, 'Phone Number', 'Medium', 'phone_pk', P.PHONE);
  for (const m of text.matchAll(/(?<![\d+\w])\+(?!92)[1-9]\d{0,2}[\s-]\(?\d{2,4}\)?[\s-]\d{3,4}[\s-]\d{3,4}(?!\d)/g)) push(m.index as number, (m.index as number) + m[0].length, 'Phone Number', 'Medium', 'phone_intl', P.PHONE);
  for (const m of text.matchAll(/\b(?:strictly[\s-]+)?(?:confidential|internal[\s-]+(?:use[\s-]+)?only|company[\s-]+confidential|not[\s-]+for[\s-]+distribution)\b/gi)) push(m.index as number, (m.index as number) + m[0].length, 'Confidentiality Labels', 'High', 'conf_label', P.CONF);

  /* 4b. contextual hits inside URLs are not personal data (query strings like ?id=123456789) */
  const inUrl = (i: number): boolean => { let a = i; while (a > 0 && !/\s/.test(text[a - 1])) a--; return /^(?:https?:\/\/|www\.)/i.test(text.slice(a, a + 12)); };
  for (let i = out.length - 1; i >= 0; i--) { const r = out[i].rule; if (!(r === 'uri_cred' || r === 'email') && inUrl(out[i].start) && out[i].priority <= P.IDCTX) out.splice(i, 1); }

  /* 5. resolve overlaps: highest priority wins, one hit per span */
  out.sort((a, b) => b.priority - a.priority || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const kept: Raw[] = [];
  for (const o of out) if (!kept.some(k => o.start < k.end && o.end > k.start)) kept.push(o);
  return kept.sort((a, b) => a.start - b.start);
}
