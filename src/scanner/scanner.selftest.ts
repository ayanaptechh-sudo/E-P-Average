import { detectAll } from './contextDetector';
import { ALL_POS, ALL_NEG, CONF_ALLOWED, Group } from './corpus';
const GROUPS: Record<Group, string[]> = {
  cred: ['Password/API Key', 'API Keys & Secrets'], id: ['Personal ID', 'National ID', 'Passport', 'SSN', 'Bank Account / IBAN'],
  acct: ['Bank Account / IBAN', 'Personal ID'], card: ['Payment Cards'], phone: ['Phone Number'], email: ['Email Lists'], dob: ['Date of Birth'], conf: ['Confidentiality Labels'],
};
let miss: string[] = [], fp: string[] = [];
const t0 = Date.now();
for (const p of ALL_POS) {
  const hits = detectAll(p.text); const val = p.value as string;
  const idx = p.text.indexOf(val);
  const okHit = hits.some(h => GROUPS[p.group].includes(h.category) && (idx < 0 || (h.start <= idx + val.replace(/[.,]+$/, '').length - 1 && h.end >= idx + 1)));
  if (!okHit) miss.push(`[${p.group}] ${JSON.stringify(p.text)} => ${hits.map(h => h.category + ':' + p.text.slice(h.start, h.end)).join('|') || 'NONE'}`);
}
for (const t of ALL_NEG) { const hits = detectAll(t).filter(h => !(CONF_ALLOWED.has(t))); if (hits.length) fp.push(`${JSON.stringify(t)} => ${hits.map(h => h.category + ':' + t.slice(h.start, h.end)).join('|')}`); }
console.log(`POS detected ${ALL_POS.length - miss.length}/${ALL_POS.length}   NEG clean ${ALL_NEG.length - fp.length}/${ALL_NEG.length}   (${Date.now() - t0} ms)`);
console.log('MISSED (' + miss.length + '):\n' + miss.slice(0, 40).join('\n'));
console.log('FALSE POSITIVES (' + fp.length + '):\n' + fp.slice(0, 40).join('\n'));
process.exit(miss.length || fp.length ? 1 : 0);
