// 
// CLI interface for functions in this package
// 

const fsp = require('fs').promises;
const jsdom = require('jsdom');
const path = require('path');

/* beautify preserve:start */
const { decodeDrawio } = require('./drawioEncoder');
const { parseContainers, parseAssumptions, parseQuestions } = require('./drawioParsers');
const { transformConnectQuestions, transformConnectContainers } = require('./drawioTransformers');
const { exporterCsv,  exporterXlsx } = require('./drawioExporters');
/* beautify preserve:end */

const decodeUsageText = `\nUsage:\ndecode <path/to/source_file> <path/to/dest_file>`;

const createCommands = ({
  logger = console
} = {}) => {
  /**
   * Parse a .drawio file, and decode the contents of the diagram element
   * from base64 into utf-8 string.
   */
  const doDecode = async (sourceFile) => {
    const encodedData = await fsp.readFile(sourceFile, 'utf-8');
    const decodedData = decodeDrawio(encodedData);

    if (!decodedData) {
      logger.log(`Failed to decode data from source file`);
      return null;
    }

    return decodedData;
  };

  /**
   * Parse a .drawio file, and decode the contents of the diagram element
   * from base64 into utf-8 string, and save it to a new file.
   * 
   * @param {string[]} args 
   */
  const decodeCommand = async (args) => {
    const [sourceFile, destFile] = args;
    if (!sourceFile) {
      logger.log(`"decode" command is missing the source file.${decodeUsageText}`)
      return;
    }
    if (!destFile) {
      logger.log(`"decode" command is missing the destination file.${decodeUsageText}`)
      return;
    }

    const decodedData = await doDecode(sourceFile);
    if (!decodedData) return;

    await fsp.mkdir(path.dirname(destFile), { recursive: true });
    await fsp.writeFile(destFile, decodedData, 'utf-8');
  };

  /**
   * Parse a .drawio file, and decode the contents of the diagram element
   * from base64 into utf-8 string, and save it to a new file.
   * 
   * @param {string[]} args 
   */
  const parseCommand = async (args) => {
    const [sourceFile, exportType, ...exportArgs] = args;

    const parsers = {
      containers: parseContainers,
      assumptions: parseAssumptions,
      questions: parseQuestions,
    };

    const transformers = [
      transformConnectQuestions,
      transformConnectContainers,
    ];

    const exporters = {
      csv: exporterCsv,
      xlsx: exporterXlsx,
    };

    const parseUsageText = `\nUsage:\nparse <path/to/source_file> <export_type> <path/to/export_destination>\n\nWhere:\nexport_type: ${Object.keys(exporters).join(' | ')}`;

    if (!sourceFile) {
      logger.error(`Error: "parse" command is missing the source file.${parseUsageText}`)
      return;
    }

    if (!exportType) {
      logger.error(`Error: "parse" command is missing the export type.${parseUsageText}`)
      return;
    }

    if (!exporters[exportType]) {
      logger.error(`Error: Unknown export type "${exportType}".${parseUsageText}`)
      return;
    }

    const decodedData = await doDecode(sourceFile);
    if (!decodedData) return;

    const dom = new jsdom.JSDOM(decodedData, {
      contentType: 'text/xml',
    });

    // Process individual parsers, and return summary object in shape:
    // {
    //   parserName: {
    //     parser: Func
    //     result: Any
    //     error: Error
    //   }
    // }
    const parsedData = Object.entries(parsers).reduce((resultAgg, [parserName, parserFn]) => {
      let parserResult = null;
      let parserError = null;
      try {
        parserResult = parserFn(dom.window.document);
      } catch (err) {
        console.error(err);
        parserError = err;
      }

      resultAgg[parserName] = {
        parser: parserFn,
        result: parserResult,
        error: parserError,
      };

      return resultAgg;
    }, {});

    const transformedData = transformers.reduce((prevResult, fn) => fn(prevResult), parsedData);

    // console.dir({
    //   assumptions: transformedData.assumptions.result.map((n) => ({
    //     nodeId: n.nodeId,
    //     value: n.value,
    //     parentId: n.parentId,
    //     container: n.container
    //   }))
    // }, {
    //   depth: 4
    // });

    await exporterCsv(transformedData, exportArgs);
    // console.dir(await exporterCsv(transformedData, exportArgs), {
    //   depth: 5
    // });

    // TODO
  };

  return {
    decode: decodeCommand,
    parse: parseCommand,
  };
};

/** Runs a command based on the command line arguments */
const cli = async (options) => {
  const {
    logger = console
  } = options || {};

  const args = process.argv.slice(2);
  const command = (args.shift() || '').toLowerCase();

  if (!command) {
    logger.error(`No command selected. Available commands: ${Object.keys(commands).join(' ')}`);
    return;
  }

  const commands = createCommands(options);
  if (!commands[command]) {
    logger.error(`Unknown command "${command}"`);
    return;
  }

  await commands[command](args);
};

module.exports = {
  cli
};