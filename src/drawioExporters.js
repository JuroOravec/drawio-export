//
// Exporters of processed data from the XML content of a <diagram> element in a .drawio file
//

const fsp = require('fs').promises;
const Papa = require('papaparse');

const doFormatCsv = (data) => {
  const {
    containers,
    assumptions,
  } = data || {};

  const maxContainerDepth = Math.max(...containers.result.all.map((container) => {
    let depth = 0;
    let currContainer = container;
    while (currContainer.parent) {
      depth++;
      currContainer = currContainer.parent;
    }
    return depth;
  }));

  const csvHeaders = [
    'assumptionId',
    'questionId',
    'subquestionId',
    'assumption',
    'question',
    'container',
    ...Array(maxContainerDepth).fill(null).map((_, i) => `container_depth${i + 1}`),
  ];

  const csvData = assumptions.result.flatMap((a) => {
    const containers = [];
    let currContainer = a.container;
    while (currContainer) {
      if (currContainer.nodeId) {
        containers.unshift(currContainer.value);
      }
      currContainer = currContainer.parent;
    }
    while (containers.length < maxContainerDepth) {
      containers.push('');
    }

    const containerKey = containers.filter(Boolean).join(' / ');

    const createRow = (q, index) => {
      if (q && q.prefixId === 'auto_1') {
        console.log({ q, a });
      }
      return [
        a.prefixId,
        q ? q.prefixId : null,
        index != null ? `${a.prefix}(${a.prefixId}):${q.prefix}(${q.prefixId}):${index + 1}` : null,
        a.value,
        q ? q.questions[index] : null,
        containerKey,
        ...containers,
      ]
    };

    return [
      createRow(),
      ...a.questions.flatMap((q) => q.questions.map((_, i) => createRow(q, i))),
    ];
  });

  csvData.unshift(csvHeaders);
  return csvData;
};

const exporterCsv = async (data, args) => {
  const [exportFile] = args;

  if (!exportFile) {
    logger.error(`Error: "csv" export is missing the export file.`)
    return;
  }

  const csvData = doFormatCsv(data);
  const csvString = Papa.unparse(csvData);

  await fsp.writeFile(exportFile, csvString, 'utf-8');
};

const exporterXlsx = async (data, args) => {
  const [exportFile] = args;

  if (!exportFile) {
    logger.error(`Error: "xlsx" export is missing the export file.`)
    return;
  }

  const csvData = doFormatCsv(data);
  // TODO - merge columns
  const csvString = Papa.unparse(csvData);

  await fsp.writeFile(exportFile, csvString, 'utf-8');
};

module.exports = {
  exporterCsv,
  exporterXlsx,
};
