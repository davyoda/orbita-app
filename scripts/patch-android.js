// Ajusta o projeto Android gerado pelo Capacitor: permissões de microfone e versão do app.
const fs = require("fs");
const man = "android/app/src/main/AndroidManifest.xml";
let x = fs.readFileSync(man, "utf8");
const perms = ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.WAKE_LOCK"];
for (const p of perms) if (!x.includes(p)) x = x.replace("</manifest>", `    <uses-permission android:name="${p}" />\n</manifest>`);
fs.writeFileSync(man, x);
const gradle = "android/app/build.gradle";
let g = fs.readFileSync(gradle, "utf8");
const code = parseInt(process.env.VERSION_CODE || "1", 10);
g = g.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "1.0.${code}"`);
fs.writeFileSync(gradle, g);
console.log("Android ajustado: microfone liberado, versão", code);
