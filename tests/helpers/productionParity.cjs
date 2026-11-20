// Only these two reviewed configuration/startup differences are intentional.
// Application statements, templates, module bindings and export wiring stay covered.
function normalizeRuntime(module, text) {
  if (module === 'app') {
    text = text.replace(/^const localRuntime_service_\d+ = require\("\.\/services\/localRuntime.service"\);\r?\n/m, '');
    text = text.replace(/process\.env\.NODE_ENV !== 'production' && !\(0, localRuntime_service_\d+\.skipLocalInitialization\)\(\)/g,
      "process.env.NODE_ENV !== 'production'");
  }
  if (module === 'db') text = text.replace(/^const connectionString = [^;\r\n]+;/m,
    'const connectionString = process.env.DATABASE_URL;');
  return text;
}
module.exports = { normalizeRuntime };
