/* Generates a bcrypt hash for the admin or blog writer password.
   Usage:  npm run make-password
   Then paste the hash into .env as ADMIN_PASSWORD_HASH or
   BLOG_PASSWORD_HASH.                                          */
const bcrypt = require("bcryptjs");
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Choose a password: ", pw => {
  if (pw.length < 8) { console.error("Use at least 8 characters."); process.exit(1); }
  const hash = bcrypt.hashSync(pw, 12);
  console.log("\nPaste ONE of these lines into your .env file:\n");
  console.log("For the admin:       ADMIN_PASSWORD_HASH=" + hash);
  console.log("For the blog writer: BLOG_PASSWORD_HASH=" + hash);
  rl.close();
});
