const imageExtensionRegex = /\.(jpg|jpeg|png|gif|bmp|tiff|svg|webp)$/i;

/**
 * Extracts the image basename from a given URL.
 *
 * @param urlString - The URL string from which the image basename is to be extracted.
 * @returns The basename of the image file from the URL.
 * Returns an empty string if the URL does not contain a valid image basename.
 */
export function getImageBasename(urlString: string) {
  try {
    const url = new URL(urlString); // ✅ Web API (works in browser + Node)
    const pathname = url.pathname;
    const basename = pathname.substring(pathname.lastIndexOf('/') + 1);

    return imageExtensionRegex.test(basename) ? basename : '';
  } catch {
    return '';
  }
}

/**
 * Extracts the basename of a file from a given URL.
 *
 * @param urlString - The URL string from which the file basename is to be extracted.
 * @returns The basename of the file from the URL.
 * Returns an empty string if the URL parsing fails.
 */
export function getFileBasename(urlString: string) {
  try {
    const url = new URL(urlString); // ✅ Web API
    const pathname = url.pathname;
    return pathname.substring(pathname.lastIndexOf('/') + 1);
  } catch {
    return '';
  }
}
