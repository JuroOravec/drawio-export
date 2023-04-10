//
// Parsers that extract data from the XML content of a <diagram> element in a .drawio file
//

const { keyBy } = require('lodash');
const jsdom = require('jsdom');

/**
 * Given a DOM Document of an .drawio XML, extract the info on containers
 * and the parent-child relationships between them.
 *
 * (When container A is inserted into container B, container B is the parent
 * and container A is the child.)
 *
 * @param {Document} document
 */
const parseContainers = (document) => {
  // See https://developer.mozilla.org/en-US/docs/Web/CSS/Attribute_selectors
  const containerNodes = [...document.querySelectorAll('mxCell[style*="container=1"]')]
    .filter((node) => node.id);

  const createNode = () => ({
    node: null,
    nodeId: null,
    parent: null,
    children: [],
    value: null
  });
  const connectNodes = (parent, child) => {
    parent.children.push(child);
    child.parent = parent;
  };

  const containerRoot = createNode();
  const containerCache = {};
  const containerNodeIds = new Set(containerNodes.map((node) => node.id));

  // Populate the graph in the first iter
  containerNodes.forEach((node) => {
    // The node might be already in the tree if added by child - if not, add it
    if (!containerCache[node.id]) {
      containerCache[node.id] = createNode();
    }

    const currTreeNode = containerCache[node.id];
    currTreeNode.node = node;
    currTreeNode.nodeId = node.id;
    currTreeNode.value = (node.getAttribute('value') || '');

    // Connect parent-child
    const parentId = node.getAttribute('parent');
    // No parent container - assign it to the root
    if (!parentId || !containerNodeIds.has(parentId)) {
      connectNodes(containerRoot, currTreeNode);
    }
    // Has parent, but we didn't see it yet - create parent placeholder
    if (!containerCache[parentId]) {
      containerCache[parentId] = createNode();
    }
    // Has parent, and parent node exists - connect parent and child
    connectNodes(containerCache[parentId], currTreeNode);
  });

  return {
    root: containerRoot,
    all: Object.values(containerCache),
  };
};

/**
 * Create CSS selectors for el.querySelector that can be used to identify
 * nodes that start with a particular string
 * @param {string} prefix
 */
const genPrefixedNodeSelector = (prefix) => {
  // See https://developer.mozilla.org/en-US/docs/Web/CSS/Attribute_selectors
  // 
  // Also, consider the following if you need to parse the nodes using XPath
  // const headings = dom.window.document.evaluate("//mxCell[contains(@value, 'Hello')]", dom.window.document, null, XPathResult.ANY_TYPE, null);
  // var thisHeading = headings..iterateNext();
  return [
    // Note:
    // 1) The value of "value" prop may be HTML encoded.
    // 2) The value of "value" may contain HTML tags.
    // Because of those, we can't use the CSS selectors below
    // to filter the nodes at this stage.
    // `mxCell[value^="${prefix}:" i]`, // mxCell[value^="A:" i]
    // `mxCell[value*=">${prefix}:" i]`, // mxCell[value*=">A:" i]
    // `mxCell[value^="${prefix}(" i]`, // mxCell[value^="A(" i]
    // `mxCell[value*=">${prefix}(" i]`, // mxCell[value*=">A(" i]
    'mxCell[value]',
  ].join(', ');
};

/**
 * Create regexp that matches "678xyz" from
 * - `A(678xyz): Bla bla bla...`
 * - `<sometag style="...">Prefix(678xyz): Bla bla bla...`
 *
 * @param {string} prefix 
 */
const genPrefixRegexp = (prefix) => {
  return new RegExp(`(?:^|>)${prefix}(?:\\\((?<id>\\w+)\\\))?:\\s*`, 'i');
};

/**
 * @param {Object} [options]
 * @param {Set|Map} [options.idCache]
 * @param {Function} [options.idGenFn]
 */
const createIdGen = (options) => {
  const {
    idCache = new Set(),
    idGenFn = (i) => i,
  } = options || {};

  let autoIdCounter = 1;
  const genNextId = () => {
    let idCandidate;
    do {
      idCandidate = idGenFn(autoIdCounter++);
    } while (idCache.has(idCandidate));
    idCache.add(idCandidate);
    return idCandidate;
  };

  return genNextId;
};

function htmlDecode(input) {
  const jsdomObj = new jsdom.JSDOM(input, "text/html");
  return jsdomObj.window.document.documentElement.textContent;
}

const extractPrefixFromNode = ({ node, prefix }) => {
  const rawValue = node.getAttribute('value') || '';
  const value = htmlDecode(rawValue) || '';
  // Extract ID
  const idRegex = genPrefixRegexp(prefix);
  const [match, prefixId] = value.match(idRegex) || [];

  if (!match) return { match: false, value: '', rawValue: '', prefixId: null };

  const cleanValue = value
    // In some cases the value may be just a nested HTML with <font> or <span> tags
    .replace(/<\/?(?:font|span)\s*.*?>/g, '')
    .replace(idRegex, ''); // Remove our assumption ID

  return { match: true, value: cleanValue, rawValue, prefixId };
};

const createParserForPrefixedNode = (prefix) => {
  const seenIds = new Set();

  const genNextAutoId = createIdGen({
    idCache: seenIds,
    idGenFn: (n) => `auto_${n}`,
  });

  const parseNode = (node) => {
    // Extract Node ID (Node = Assumption or Question)
    // 
    // Note: Do not refer to Assumption and Question as Node. Node is already
    // the generic "thing" we get from Drawio
    const { match, value, rawValue, prefixId } = extractPrefixFromNode({ node, prefix });

    if (!match) return { match, prefixId: null, value: '', rawValue: '' };

    if (prefixId != null) {
      if (seenIds.has(prefixId)) {
        throw Error(`Found duplicate Node with prefix "${prefix}(${prefixId})"`)
      } else {
        seenIds.add(prefixId);
      }
    }

    const finalPrefixId = prefixId || genNextAutoId();

    return { match, prefixId: finalPrefixId, value, rawValue };
  };

  return { parseNode };
};

/**
 * @typedef {Object} PrefixedNode
 * @property {Element} node
 * @property {string} nodeId
 * @property {string} prefix
 * @property {string} prefixId
 * @property {string} value
 * @property {string} rawValue
 */

/**
 * Common pathway for finding nodes in the document whose "value" prop
 * is prefixed.
 * 
 * This is useful to find Assumption or Question nodes, which are identified
 * by starting the "value" (the text inside a Drawio element) with prefixes
 * like "A:", "Q:".
 * 
 * These prefixes can also contain IDs to distinguish individual elements.
 * E.g. "A(123):" or "Q(test_123):""
 *
 * @param {Object} input
 * @param {Document} input.document
 * @param {string} input.prefix
 * @returns {PrefixedNode[]}
 */
const findPrefixedNodes = ({ document, prefix }) => {
  const { parseNode } = createParserForPrefixedNode(prefix);

  const prefixedNodes = [...document.querySelectorAll(genPrefixedNodeSelector(prefix))]
    .reduce((aggArr, node) => {
      if (!node.id) return aggArr;

      const { match, prefixId, value, rawValue } = parseNode(node);
      if (!match) return aggArr;

      const prefixedNode = {
        node,
        nodeId: node.id,
        prefix,
        prefixId,
        value,
        rawValue,
      };

      aggArr.push(prefixedNode);
      return aggArr;
    }, []);

  return prefixedNodes;
};

/**
 * Given a DOM Document of an .drawio XML, extract the info on assumptions.
 *
 * Assumptions are just statements that can be connected to each other,
 * to questions, or inserted into containers.
 *
 * @param {Document} document
 */
const parseAssumptions = (document) => {
  const assumptionNodes = findPrefixedNodes({ document, prefix: 'A' }).map((prefixedNodeData) => {
    const parentId = prefixedNodeData.node.getAttribute('parent') || null;
    return {
      ...prefixedNodeData,
      parentId,
      questions: [],
    };
  });

  return assumptionNodes;
};

/**
 * Given a DOM Document of an .drawio XML, extract the info on questions.
 *
 * Questions are connected to assumtions via edges (arrows).
 *
 * @param {Document} document
 */
const parseQuestions = (document) => {
  const questionNodes = findPrefixedNodes({ document, prefix: 'Q' }).map((prefixedNodeData) => {
    const questions = prefixedNodeData.rawValue.split(/<br.*?>-\s*/).slice(1).map((q) => q.trim()).filter(Boolean);
    return {
      ...prefixedNodeData,
      questions,
      targetIds: [], // Nodes that the question is connected to
    };
  });

  const questionsByNodeId = keyBy(questionNodes, (q) => q.nodeId);

  // Find the edges connected to Question nodes
  for (const node of document.querySelectorAll('mxCell[edge="1"]')) {
    const sourceId = node.getAttribute('source');
    const targetId = node.getAttribute('target');

    const edgeData = questionsByNodeId[sourceId] ? {
      sourceId,
      targetId
    } : questionsByNodeId[targetId] ? {
      sourceId: targetId,
      targetId: sourceId,
    } : null;

    if (!edgeData) continue;

    questionsByNodeId[edgeData.sourceId].targetIds.push(edgeData.targetId);
  };

  return questionNodes;
};

module.exports = {
  parseContainers,
  parseAssumptions,
  parseQuestions,
}
