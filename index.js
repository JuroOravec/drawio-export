//
// Script to decode .drawio to XML. Taken from Draw.io's guide
//

const {
  cli
} = require('./src/cli');

if (require && require.main === module) {
  cli();
}