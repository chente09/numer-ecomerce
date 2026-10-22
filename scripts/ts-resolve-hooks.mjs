// Lets node's test runner import app code that uses extension-less relative imports (valid for the Angular
// compiler): "./pricing" is retried as "./pricing.ts". Registered from the tests that need it.
export async function resolve(specifier, context, nextResolve) {
  if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
    try {
      return await nextResolve(specifier + '.ts', context);
    } catch {
      /* fall through to the default resolution */
    }
  }
  return nextResolve(specifier, context);
}
