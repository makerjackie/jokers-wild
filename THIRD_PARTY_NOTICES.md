# Third-party notices

Parts of this project are adapted from **LEVIATHAN** (https://github.com/0xCodez/leviathan), by way of our earlier shorts THE BIG ONE and YOUR TURN (same author, MIT): the frame pipeline in `src/engine.js` (a cel pass into colour + normal/depth/material-id targets, a Kuwahara brush pass on painted background pixels, ink lines from material ids and depth/normal edges) and the cel material in `src/materials.js`. LEVIATHAN is distributed under the MIT License:

```
MIT License

Copyright (c) 2026 Beyond Dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---
This license covers the source code. The story, shots and designs follow a short
by AHMII and are not covered by this license. three.js in vendor/ is MIT, see
vendor/THREE-LICENSE.
```

three.js (MIT) and esbuild (MIT) are bundled or used as build tools under their own licenses.
