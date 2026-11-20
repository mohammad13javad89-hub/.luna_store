require('dotenv').config();
const readline = require('node:readline');
const db = require('./server/db');
const { hashPassword } = require('./server/auth');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = question => new Promise(resolve => rl.question(question, resolve));
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') return reject(new Error('این دستور باید در ترمینال تعاملی اجرا شود.'));
    process.stdout.write(question);
    const previous = input.isRaw;
    let value = '';
    input.setRawMode(true); input.resume();
    const onData = key => {
      if (key === '\u0003') { input.setRawMode(previous); input.pause(); process.exit(1); }
      if (key === '\r' || key === '\n') { input.setRawMode(previous); input.pause(); input.removeListener('data', onData); process.stdout.write('\n'); resolve(value); return; }
      if (key === '\u007f' || key === '\b') value = value.slice(0, -1);
      else if (key >= ' ') value += key;
    };
    input.on('data', onData);
  });
}
(async () => {
  try {
    if (db.prepare('SELECT COUNT(*) AS count FROM admins').get().count > 0) {
      console.log('حساب مدیر از قبل وجود دارد.');
      return;
    }
    const username = (await ask('نام کاربری مدیر: ')).trim();
    if (!/^[a-zA-Z0-9_]{4,30}$/.test(username)) throw new Error('نام کاربری باید ۴ تا ۳۰ نویسه و فقط شامل حروف انگلیسی، عدد یا _ باشد.');
    const password = await askHidden('رمز عبور (حداقل ۱۲ نویسه): ');
    const confirm = await askHidden('تکرار رمز عبور: ');
    if (password.length < 12) throw new Error('رمز عبور باید حداقل ۱۲ نویسه باشد.');
    if (password !== confirm) throw new Error('رمزهای عبور یکسان نیستند.');
    const hash = await hashPassword(password);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
    console.log('حساب مدیر با موفقیت ساخته شد.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { rl.close(); db.close(); }
})();
