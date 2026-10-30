/* Generates a bcrypt hash for your admin password.
   Usage:  npm run make-password
   Then paste the hash into .env as ADMIN_PASSWORD_HASH.        */
const bcrypt = require("bcryptjs");
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Choose an admin password: ", pw => {
  if (pw.length < 8) { console.error("Use at least 8 characters."); process.exit(1); }
  console.log("\nPaste this line into your .env file:\n");
  console.log("ADMIN_PASSWORD_HASH=" + bcrypt.hashSync(pw, 12));
  rl.close();
});
