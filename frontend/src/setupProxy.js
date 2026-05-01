// setupProxy.js — força Cache-Control: no-store en TODAS las respuestas del dev server
// Esto previene que el browser sirva bundle.js stale desde su disk cache
module.exports = function (app) {
  app.use(function (req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });
};
