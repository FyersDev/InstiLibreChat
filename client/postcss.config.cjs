// Custom plugin to suppress :is() selector transformation warnings
const suppressIsWarnings = () => {
  return {
    postcssPlugin: 'suppress-is-warnings',
    OnceExit(root, { result }) {
      // Filter out warnings about :is() selector transformations
      if (result.messages) {
        result.messages = result.messages.filter(
          (msg) => !(msg.type === 'warning' && msg.text && msg.text.includes('can not be transformed to an equivalent selector without \':is()\''))
        );
      }
    },
  };
};
suppressIsWarnings.postcss = true;

module.exports = {
  plugins: [
    require('postcss-import'),
    require('postcss-preset-env')({
      // Target modern browsers that support :is() pseudo-class (Chrome 88+, Firefox 78+, Safari 14+)
      // This prevents postcss-preset-env from trying to transform :is() selectors
      stage: 2,
      features: {
        'custom-selectors': false,
      },
      autoprefixer: {
        grid: true,
      },
    }),
    require('tailwindcss'),
    require('autoprefixer')({
      // Configure autoprefixer to target modern browsers
      overrideBrowserslist: ['defaults', 'not IE 11'],
    }),
    suppressIsWarnings,
  ],
};
