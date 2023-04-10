// 
// Script to decode .drawio to XML. Taken from Draw.io's github
// https://github.com/jgraph/drawio-tools
// 

const pako = require('pako'); // 2.0.4
const jsdom = require('jsdom');

/**
 * Decode text content of <diagram> elements from base64.
 * 
 * This is a NodeJS version of the decoder function from
 * https://github.com/jgraph/drawio-tools/blob/d8e3e585e3d71e867650834396afef659ced6264/tools/convert.html
 */
function decodeDrawio(data, options) {
  const {
    base64 = true,
      deflate = true,
      urlEncode = true,
      logger = console,
  } = options || {};

  try {
    const node = parseXml(data).documentElement;

    if (node && node.nodeName == 'mxfile') {
      const diagrams = node.getElementsByTagName('diagram');

      if (diagrams.length > 0) {
        data = getTextContent(diagrams[0]);
      }
    }
  } catch (e) {
    logger.error(e);
    return null;
  }

  if (base64) {
    try {
      data = globalThis.atob(data);
    } catch (e) {
      logger.error('atob failed: ' + e);
      return null;
    }
  }

  if (deflate && data.length > 0) {
    try {
      data = pako.inflateRaw(Uint8Array.from(data, c => c.charCodeAt(0)), {
        to: 'string'
      });
    } catch (e) {
      logger.error('inflateRaw failed: ' + e);
      return null;
    }
  }

  if (urlEncode) {
    try {
      data = decodeURIComponent(data);
    } catch (e) {
      logger.error('decodeURIComponent failed: ' + e);
      return null;
    }
  }

  return data;
};

/**
 * Encode text content of <diagram> elements into base64.
 * 
 * This is a NodeJS version of the encoder function from
 * https://github.com/jgraph/drawio-tools/blob/d8e3e585e3d71e867650834396afef659ced6264/tools/convert.html
 */
function encodeDrawio(data, options) {
  const {
    base64 = true,
      deflate = true,
      urlEncode = true,
      logger = console,
  } = options || {};

  if (urlEncode) {
    try {
      data = encodeURIComponent(data);
    } catch (e) {
      logger.error('encodeURIComponent failed: ' + e);
      return null;
    }
  }

  if (deflate && data.length > 0) {
    try {
      data = String.fromCharCode.apply(null, new Uint8Array(pako.deflateRaw(data)));
    } catch (e) {
      logger.error('deflateRaw failed: ' + e);
      return null;
    }
  }

  if (base64) {
    try {
      data = btoa(data);
    } catch (e) {
      console.error('btoa failed: ' + e);
      return null;
    }
  }

  return data;
};

function parseXml(xml) {
  // Browser
  if (globalThis && globalThis.DOMParser) {
    var parser = new DOMParser();

    return parser.parseFromString(xml, 'text/xml');
  }
  // Node
  else if (jsdom && jsdom.JSDOM) {
    const dom = new jsdom.JSDOM(xml, {
      contentType: 'text/xml'
    });
    return dom.window.document;
  } else {
    var result = createXmlDocument();

    result.async = 'false';
    result.loadXML(xml);

    return result;
  }
};

function createXmlDocument() {
  var doc = null;

  if (document && document.implementation && document.implementation.createDocument) {
    doc = document.implementation.createDocument('', '', null);
  } else if (globalThis && globalThis.ActiveXObject) {
    doc = new ActiveXObject('Microsoft.XMLDOM');
  }

  return doc;
};

function getTextContent(node) {
  if (!node) return '';
  const textAttr = (node.textContent === undefined) ? 'text' : 'textContent';
  return node[textAttr];
};

module.exports = {
  decodeDrawio,
  encodeDrawio,
};