const cookies = require('cookie');
const passport = require('passport');
const { isEnabled } = require('@librechat/api');

// This middleware does not require authentication,
// but if the user is authenticated, it will set the user object.
const optionalJwtAuth = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;
  const callback = (err, user) => {
    if (err) {
      return next(err);
    }
    if (user) {
      req.user = user;
    }
    next();
  };
  
  // Use proxy authentication if token provider is "proxy"
  if (tokenProvider === 'proxy') {
    return passport.authenticate('proxyJwt', { session: false }, callback)(req, res, next);
  }
  
  // Use OpenID authentication if configured
  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return passport.authenticate('openidJwt', { session: false }, callback)(req, res, next);
  }
  
  // Default to standard JWT authentication
  passport.authenticate('jwt', { session: false }, callback)(req, res, next);
};

module.exports = optionalJwtAuth;
