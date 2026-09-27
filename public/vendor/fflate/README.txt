fflate 0.8.3, MIT license, https://github.com/101arrowz/fflate
Source: https://cdn.jsdelivr.net/npm/fflate@0.8.3/umd/index.js
Local adjustment: UMD global target is globalThis instead of self/this so the
same trusted bundle also works in Node ES modules. Compression code unchanged.
Used synchronously only when loading the local road database; region scenery
uses the browser's DecompressionStream and yields while decoding geometry.
