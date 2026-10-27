// Training corpus: hand-written + generated cases. POS must be detected (covering the value), NEG must give zero hits.
export type Group = 'cred' | 'id' | 'acct' | 'card' | 'phone' | 'email' | 'dob' | 'conf';
export interface Pos { text: string; group: Group; value?: string }
let seed = 20261018;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const HEX = '0123456789abcdef', ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const gen = (n: number, set = ALNUM) => Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join('');
const digits = (n: number) => gen(n, '0123456789');
const noiseBefore = ['', '', '', 'Hi team, ', 'FYI ', 'Please note: ', 'Here you go. ', 'Dear sir, ', 'bhai ', 'hey, ', 'urgent: ', 'btw '];
const noiseAfter = ['', '', '', ' thanks', ' please keep it safe', ' ok?', '.', ' do not share', ' regards', '!', ' bhai'];

/* ---------- hand-written positives ---------- */
export const HAND_POS: Pos[] = [
  { text: 'api of whatsapp is 28379217327', group: 'cred', value: '28379217327' },
  { text: 'my id number y327457386489327', group: 'id', value: 'y327457386489327' },
  { text: 'My api key is 345435435', group: 'cred', value: '345435435' },
  { text: 'my api key is sk-test1234', group: 'cred', value: 'sk-test1234' },
  { text: 'API_KEY=sk-abc123def456ghi789jkl012', group: 'cred', value: 'sk-abc123def456ghi789jkl012' },
  { text: 'meri api key ye hai AH82BNS92H', group: 'cred', value: 'AH82BNS92H' },
  { text: 'AH82BNS92H <- password', group: 'cred', value: 'AH82BNS92H' },
  { text: '28379217327 is my api key', group: 'cred', value: '28379217327' },
  { text: 'hunter22 mera password hai', group: 'cred', value: 'hunter22' },
  { text: 'login credentials: ali / Pass@9921 ok', group: 'cred', value: 'Pass@9921' },
  { text: 'DB_PASSWORD=SuperSecret123', group: 'cred', value: 'SuperSecret123' },
  { text: 'export OPENAI_API_KEY="sk-proj-abc123XYZ789"', group: 'cred', value: 'sk-proj-abc123XYZ789' },
  { text: 'const apiKey = "AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q";', group: 'cred', value: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q' },
  { text: 'AKIAIOSFODNN7EXAMPLE', group: 'cred', value: 'AKIAIOSFODNN7EXAMPLE' },
  { text: 'mongodb://admin:pass123@localhost/db', group: 'cred', value: 'pass123' },
  { text: '-----BEGIN RSA PRIVATE KEY-----', group: 'cred', value: '-----BEGIN RSA PRIVATE KEY-----' },
  { text: 'Hi Ahmed,\nSharing the creds.\nusername: ahmed\npassword: Qwerty@7788\nthanks', group: 'cred', value: 'Qwerty@7788' },
  { text: 'Long paragraph about our project timeline and deliverables. By the way the api key is 5566778899 so please configure the server. Regards', group: 'cred', value: '5566778899' },
  { text: 'zero\u200bwidth: my api key is 28379217327', group: 'cred', value: '28379217327' },
  { text: 'api of whatsapp is 28379217327, and api of telegram is 11223344556', group: 'cred', value: '11223344556' },
  { text: 'API KEY\n28379217327', group: 'cred', value: '28379217327' },
  { text: 'api   key   is   28379217327', group: 'cred', value: '28379217327' },
  { text: 'PASSWORD IS HUNTER22', group: 'cred', value: 'HUNTER22' },
  { text: 'Password is Karachi#123.', group: 'cred', value: 'Karachi#123' },
  { text: 'my cnic is 35202-1234567-1', group: 'id', value: '35202-1234567-1' },
  { text: 'CNIC 3520212345671', group: 'id', value: '3520212345671' },
  { text: 'mera shanakhti card number 35202 1234567 1 hai', group: 'id', value: '35202 1234567 1' },
  { text: '42101-9876543-2', group: 'id', value: '42101-9876543-2' },
  { text: 'my passport number is AB1234567', group: 'id', value: 'AB1234567' },
  { text: 'passport no: CD7654321', group: 'id', value: 'CD7654321' },
  { text: 'my ssn is 123-45-6789', group: 'id', value: '123-45-6789' },
  { text: 'driving license number is KHI-2024-558899', group: 'id', value: 'KHI-2024-558899' },
  { text: 'my national id is 4210198765432', group: 'id', value: '4210198765432' },
  { text: 'id number: 99887766554433', group: 'id', value: '99887766554433' },
  { text: '327457386489327 is my id', group: 'id', value: '327457386489327' },
  { text: 'meri id number hai y327457386489327', group: 'id', value: 'y327457386489327' },
  { text: 'my account number is 0123456789012', group: 'acct', value: '0123456789012' },
  { text: 'acc no 00112233445566', group: 'acct', value: '00112233445566' },
  { text: 'iban is PK36SCBL0000001123456702', group: 'acct', value: 'PK36SCBL0000001123456702' },
  { text: 'PK36 SCBL 0000 0011 2345 6702', group: 'acct', value: 'PK36 SCBL 0000 0011 2345 6702' },
  { text: 'meri account number hai 1234567890123', group: 'acct', value: '1234567890123' },
  { text: 'my card number is 4111 1111 1111 1111', group: 'card', value: '4111 1111 1111 1111' },
  { text: '5500-0000-0000-0004', group: 'card', value: '5500-0000-0000-0004' },
  { text: 'card 378282246310005', group: 'card', value: '378282246310005' },
  { text: 'call me on 03001234567', group: 'phone', value: '03001234567' },
  { text: 'my phone number is 0300-1234567', group: 'phone', value: '0300-1234567' },
  { text: 'whatsapp me at +92 300 1234567', group: 'phone', value: '+92 300 1234567' },
  { text: '+923001234567', group: 'phone', value: '+923001234567' },
  { text: 'mera number hai 0321 7654321', group: 'phone', value: '0321 7654321' },
  { text: 'contact: 0092 333 1234567', group: 'phone', value: '0092 333 1234567' },
  { text: 'office 021-34567890', group: 'phone', value: '021-34567890' },
  { text: 'US office +1 415 555 2671', group: 'phone', value: '+1 415 555 2671' },
  { text: 'email me at ali.khan@gmail.com', group: 'email', value: 'ali.khan@gmail.com' },
  { text: 'send to a@x.com, b@y.org and c@z.pk', group: 'email', value: 'b@y.org' },
  { text: 'my dob is 15/08/1999', group: 'dob', value: '15/08/1999' },
  { text: 'date of birth: 1999-08-15', group: 'dob', value: '1999-08-15' },
  { text: 'born on 15 August 1999', group: 'dob', value: '15 August 1999' },
  { text: 'CONFIDENTIAL: client list attached', group: 'conf', value: 'CONFIDENTIAL' },
  { text: 'This document is Internal Use Only', group: 'conf', value: 'Internal Use Only' },
  { text: 'STRICTLY CONFIDENTIAL budget 2026', group: 'conf', value: 'STRICTLY CONFIDENTIAL' },
];

/* ---------- generated positives ---------- */
const CRED_KW = ['api key', 'api', 'api of whatsapp', 'whatsapp api key', 'api of telegram', 'stripe api key', 'openai key', 'api token', 'token', 'access token', 'auth token', 'bot token', 'secret', 'secret key', 'client secret', 'password', 'passwd', 'wifi password', 'bank password', 'gmail password', 'pwd', 'pass', 'passcode', 'api secret', 'private key', 'apikey', 'API KEY', 'Password', 'whatsapp business token'];
const CONNS = ['is', '=', ':', 'hai', 'ye hai', 'ye raha', 'was', '-', 'is:', 'yeh hai'];
const POSSS = ['', '', 'my ', 'the ', 'our ', 'mera ', 'meri '];
const credVals = () => pick([digits(11), digits(9), digits(10), 'sk-' + gen(20), gen(10), gen(8, ALNUM) + '1' + gen(3), gen(20, HEX), 'Pass@' + digits(4), 'Admin#' + digits(3) + gen(2), gen(32, HEX), 'EAAG' + gen(12), 'Xk' + digits(2) + 'Lmq' + digits(2) + 'Zp', 'sk_live_' + gen(24)]);
const quoteIt = (v: string) => pick([v, v, v, `"${v}"`, `'${v}'`, `${v}.`]);
export function genCred(n: number): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < n; i++) {
    const v = credVals(), kw = pick(CRED_KW), c = pick(CONNS), p = pick(POSSS), t = Math.floor(rnd() * 8);
    let core: string;
    if (t === 0) core = `${p}${kw} ${c} ${quoteIt(v)}`;
    else if (t === 1) core = `${p}${kw} ${c} ${v}`;
    else if (t === 2) core = `${v} is ${pick(['my ', 'the ', 'mera ', ''])}${kw}`;
    else if (t === 3) core = `${v} <- ${kw}`;
    else if (t === 4) core = `${v} (${kw})`;
    else if (t === 5) core = `${kw.replace(/ /g, '_').toUpperCase()}=${v}`;
    else if (t === 6) core = `${p}${kw} ${pick(['of my bank', 'for stripe', 'for the server', 'of gmail', 'for whatsapp', 'of instagram'])} ${c} ${v}`;
    else core = `${v} ${pick(['mera', 'meri', 'apna'])} ${kw} hai`;
    out.push({ text: pick(noiseBefore) + core + pick(noiseAfter), group: 'cred', value: v });
  }
  return out;
}
const PIN_KW = ['pin', 'otp', 'cvv', 'atm pin', 'bank otp', 'verification code otp'];
export function genPin(n: number): Pos[] { return Array.from({ length: n }, () => { const v = digits(pick([4, 5, 6])); const kw = pick(PIN_KW); return { text: `${pick(noiseBefore)}${pick(['my ', 'the ', ''])}${kw} ${pick(['is', ':', '=', 'hai'])} ${v}${pick(noiseAfter)}`, group: 'cred' as Group, value: v }; }); }
const ID_KW = ['id number', 'id no', 'my id', 'id', 'cnic', 'cnic number', 'nic', 'national id', 'identity card number', 'passport number', 'passport no', 'ssn', 'social security number', 'driving license number', 'tax id', 'ntn', 'student id', 'employee id', 'aadhaar'];
const idVals = () => pick([digits(13), digits(15), digits(12), gen(1, 'abcdefghijklmnopqrstuvwxyz') + digits(15), digits(5) + '-' + digits(7) + '-' + digits(1), digits(5) + ' ' + digits(7) + ' ' + digits(1), 'AB' + digits(7), digits(10)]);
export function genId(n: number): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < n; i++) {
    const v = idVals(), kw = pick(ID_KW), c = pick(['is', ':', '=', 'hai', '', '', 'ye hai', '-']), p = pick(POSSS);
    const core = pick([`${p}${kw} ${c} ${v}`, `${p}${kw} ${c} ${v}`, `${v} is ${p || 'my '}${kw}`, `${kw}: ${v}`]).replace(/\s{2,}/g, ' ');
    out.push({ text: pick(noiseBefore) + core + pick(noiseAfter), group: 'id', value: v });
  }
  return out.filter(o => { const d = (o.value as string).replace(/\D/g, '').length; return d >= 9; }); // keep only values a human would call an ID
}
const PH_FORMS = () => pick(['03' + digits(2) + digits(7), '03' + digits(2) + '-' + digits(7), '+92 3' + digits(2) + ' ' + digits(7), '+923' + digits(2) + digits(7), '0092 3' + digits(2) + ' ' + digits(7), '03' + digits(2) + ' ' + digits(7), '+1 415 555 ' + digits(4), '021-' + digits(8)]);
export function genPhone(n: number): Pos[] { return Array.from({ length: n }, () => { const v = PH_FORMS(); return { text: pick(noiseBefore) + pick([`call me on ${v}`, `my phone number is ${v}`, `whatsapp me at ${v}`, `mera number hai ${v}`, `contact: ${v}`, `${v}`, `mobile ${v}`, `ph no ${v}`, `reach me on ${v} anytime`]) + pick(noiseAfter), group: 'phone' as Group, value: v }; }); }
export function genCard(n: number): Pos[] {
  const prefixes = ['4111111111111111', '5500000000000004', '378282246310005', '6011111111111117', '4012888888881881', '5105105105105100'];
  return Array.from({ length: n }, () => { const d = pick(prefixes); const v = pick([d, d.replace(/(.{4})/g, '$1 ').trim(), d.replace(/(.{4})/g, '$1-').replace(/-$/, '')]); return { text: pick(noiseBefore) + pick(['card ', 'my card number is ', 'credit card: ', 'pay with ', '']) + v + pick(noiseAfter), group: 'card' as Group, value: v }; });
}
export function genEmail(n: number): Pos[] {
  const names = ['ali.khan', 'sara_ahmed', 'dev+test', 'info', 'admin', 'omar.farooq99', 'finance-team'], doms = ['gmail.com', 'yahoo.com', 'company.pk', 'corp.co.uk', 'outlook.com'];
  return Array.from({ length: n }, () => { const v = `${pick(names)}@${pick(doms)}`; return { text: pick(noiseBefore) + pick(['email me at ', 'my email is ', 'send it to ', 'cc ', '']) + v + pick(noiseAfter), group: 'email' as Group, value: v }; });
}
export const ALL_POS: Pos[] = [...HAND_POS, ...genCred(900), ...genPin(120), ...genId(300), ...genPhone(200), ...genCard(80), ...genEmail(60)];

/* ---------- negatives ---------- */
export const HAND_NEG: string[] = [
  'hello how are you', 'password=changeme', 'the key to success is hard work', 'I have 2 keys on my keyboard', 'call me tomorrow', 'the api is working fine', 'the api key is required',
  'what is an api key?', 'my password is too weak', 'reset your password is easy', 'the token is invalid', 'please enter your password', 'the api is 3 times faster', 'my pin is 12', 'otp is expired',
  'API documentation is available online', 'the key is under the mat', 'pass is the opposite of fail', 'I will login tomorrow', 'tokens are used for auth', 'password hai kya?', 'api key kaise banate hain',
  'mera password bhool gaya', 'the secret is love', 'key is 5', 'the price is 28379217327 rupees total', 'order id is ABC-12345', 'the meeting is at 3pm', 'the pass is open until 10',
  'The password policy requires 12 characters', 'Use a strong password with numbers', 'api rate limit is 1000 requests per minute', 'The key points are listed below', 'login page is down', 'token economy in games',
  'Passport number is not needed', 'pin the message on top', 'the otp feature is enabled for users', 'api version is v2.1', 'The api is documented at docs.example.com', 'my api is slow today', 'whatsapp is a messaging app',
  'key takeaways from the meeting', 'Meeting notes: we discussed the Q3 roadmap, hiring plan and budget. Action items assigned to Sara and Omar. Next sync on Friday at 4pm.',
  'Please review the attached document and let me know if the pass criteria are met. The token of appreciation is a gift card.', 'In Python, use requests.get(url) and check the response status code 200 before parsing the JSON body.',
  'Order #4829104 shipped on 12 March, tracking number TRK928374651 arrives Monday.', 'Is the API down? Users report login failures since 3:45 PM, error 503 on /v1/users.', 'Reset instructions: click Forgot password, enter your email, and follow the link we send you.',
  'my id is 12345', 'user id is 482910', 'what is my id number?', 'I lost my id card yesterday', 'please bring your cnic tomorrow', 'cnic is required for registration', 'the passport office opens at 9am', 'enter your account number below',
  'my account number is required', 'what is an iban?', 'the iban format has 24 characters for Pakistan', 'ssn is a US identifier', 'driving license renewal takes 2 weeks', 'my phone is dead', 'call me when you arrive',
  'my number is 5', 'contact the support team', 'whatsapp me later', 'I was born in Karachi', 'my dob is private', 'date of birth is required', 'happy birthday to you', 'The meeting is on 15/08/1999 anniversary of the archive?',
  'the total is 4111 rupees', 'invoice 2024-10-17 amount 1500', 'version 3.14.159 released', 'the year 1999 was great', 'Total: 1,234,567.89 PKR', 'room 504 floor 5', 'Flight PK 305 departs at 14:30', 'ref no 12345678',
  'the file is report_final_v2.pdf', 'visit https://example.com/page?id=12345678901', 'git commit a1b2c3d4e5f6', 'IP address 192.168.1.1', 'x = 28379217327 * 3', 'sum of 123456789 and 987654321 is 1111111110',
  'this is a confidential matter between friends', // note: label word in prose is allowed to flag, see CONF_ALLOWED
];
export const CONF_ALLOWED = new Set(['this is a confidential matter between friends']);
const NEG_KW = ['api key', 'api', 'token', 'password', 'secret', 'pin', 'otp', 'cnic', 'id number', 'passport number', 'account number', 'iban', 'ssn', 'phone number', 'dob', 'card number', 'client secret', 'access token'];
export const GEN_NEG: string[] = NEG_KW.flatMap(k => [`what is a ${k}?`, `the ${k} is required`, `please enter your ${k}`, `${k} is invalid`, `how do I reset my ${k}`, `I forgot my ${k}`, `${k} policy was updated`, `the ${k} field is empty`, `never share your ${k} with anyone`, `where can I find my ${k}?`, `my ${k} is hidden`, `change the ${k} soon`, `the ${k} format is explained in the docs`]);
export const ALL_NEG: string[] = [...HAND_NEG, ...GEN_NEG];
